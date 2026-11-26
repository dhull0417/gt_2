-- Chat moderation: timeouts. Owners/moderators time someone out of one group's chat; while timed out
-- that person can't send, react or pin there (and, once the lockdown has run, can't edit or delete).
-- Spec: docs/specs/2026-11-16-chat-moderation-design.md
--
-- Requires 20261020000000_chat_phase3_membership_mirror.sql (set_message_pinned). Additive: until the
-- backend writes rows into chat_timeouts, nothing changes for anyone.
-- After running, check it with supabase/tests/chat_moderation_check.sql (it rolls itself back).
--
-- Only the backend (service role) writes this table; it checks owner/moderator rights in Mongo.
-- Old app versions that insert into messages directly are NOT blocked until the lockdown runs.

-- ---------------------------------------------------------------- table
create table if not exists public.chat_timeouts (
  group_id text not null,
  clerk_id text not null,
  until timestamptz,               -- null = until a moderator lifts it
  created_at timestamptz not null default now(),
  primary key (group_id, clerk_id)
);
create index if not exists chat_timeouts_clerk_idx on public.chat_timeouts (clerk_id);

alter table public.chat_timeouts enable row level security;

-- People may see only their own timeouts (nobody else in the group learns about them).
drop policy if exists "read own timeouts" on public.chat_timeouts;
create policy "read own timeouts" on public.chat_timeouts
  for select to authenticated
  using (clerk_id = (select auth.jwt() ->> 'sub'));

revoke insert, update, delete on public.chat_timeouts from anon, authenticated;

-- ---------------------------------------------------------------- check
-- security definer so it works whatever the caller can read.
create or replace function public.is_chat_timed_out(p_group_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_timeouts
    where group_id = p_group_id
      and clerk_id = (select auth.jwt() ->> 'sub')
      and (until is null or until > now())
  );
$$;
revoke all on function public.is_chat_timed_out(text) from public;
grant execute on function public.is_chat_timed_out(text) to authenticated;

-- ---------------------------------------------------------------- send_message (same as phase 2 + timeout check)
create or replace function public.send_message(
  p_client_id text,
  p_group_id text,
  p_sender_name text,
  p_content text,
  p_reply_to_id uuid default null,
  p_reply_to_content text default null,
  p_reply_to_sender text default null,
  p_image_url text default null,
  p_image_width int default null,
  p_image_height int default null,
  p_mentions text[] default '{}'
) returns public.messages
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sender text := (select auth.jwt() ->> 'sub');
  r public.messages;
begin
  if v_sender is null then
    raise exception 'not authenticated';
  end if;

  -- A retry of a message that already landed before the timeout still returns it.
  select * into r from public.messages
  where sender_id = v_sender and client_id = p_client_id;
  if r.id is not null then
    return r;
  end if;

  if public.is_chat_timed_out(p_group_id) then
    raise exception 'timed out';
  end if;

  insert into public.messages (
    client_id, group_id, sender_id, sender_name, content,
    reply_to_id, reply_to_content, reply_to_sender,
    image_url, image_width, image_height, mentions
  ) values (
    p_client_id, p_group_id, v_sender, p_sender_name, coalesce(p_content, ''),
    p_reply_to_id, p_reply_to_content, p_reply_to_sender,
    p_image_url, p_image_width, p_image_height,
    coalesce(p_mentions[1:20], '{}')
  )
  on conflict (sender_id, client_id) do nothing
  returning * into r;

  if r.id is null then
    select * into r from public.messages
    where sender_id = v_sender and client_id = p_client_id;
  end if;

  return r;
end;
$$;

-- ---------------------------------------------------------------- toggle_reaction (same as phase 2 + timeout check)
create or replace function public.toggle_reaction(p_message_id uuid, p_emoji text)
returns public.messages
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user text := (select auth.jwt() ->> 'sub');
  r public.messages;
  k text;
  arr jsonb;
  kept jsonb;
  had_same boolean := false;
  next_r jsonb := '{}'::jsonb;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_emoji is null or length(p_emoji) = 0 or length(p_emoji) > 16 then
    raise exception 'invalid emoji';
  end if;

  select * into r from public.messages where id = p_message_id for update;
  if r.id is null then
    raise exception 'message not found';
  end if;
  if public.is_chat_timed_out(r.group_id) then
    raise exception 'timed out';
  end if;

  for k, arr in select key, value from jsonb_each(coalesce(r.reactions, '{}'::jsonb)) loop
    if k = p_emoji and arr @> to_jsonb(v_user) then
      had_same := true;
    end if;
    select coalesce(jsonb_agg(u), '[]'::jsonb) into kept
      from jsonb_array_elements(arr) u where u <> to_jsonb(v_user);
    if jsonb_array_length(kept) > 0 then
      next_r := next_r || jsonb_build_object(k, kept);
    end if;
  end loop;

  if not had_same then
    next_r := jsonb_set(next_r, array[p_emoji],
                coalesce(next_r -> p_emoji, '[]'::jsonb) || to_jsonb(v_user), true);
  end if;

  update public.messages set reactions = next_r where id = p_message_id returning * into r;
  return r;
end;
$$;

-- ---------------------------------------------------------------- set_message_pinned (same as phase 3a + timeout check)
create or replace function public.set_message_pinned(p_message_id uuid, p_pinned boolean)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user text := (select auth.jwt() ->> 'sub');
  r public.messages;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into r from public.messages where id = p_message_id for update;
  if r.id is null then raise exception 'message not found'; end if;
  if not public.is_group_member(r.group_id) then raise exception 'not a member of this group'; end if;
  if public.is_chat_timed_out(r.group_id) then raise exception 'timed out'; end if;
  update public.messages
     set pinned_at = case when p_pinned then now() else null end,
         pinned_by = case when p_pinned then v_user else null end
   where id = p_message_id
   returning * into r;
  return r;
end;
$$;
revoke all on function public.set_message_pinned(uuid, boolean) from public;
grant execute on function public.set_message_pinned(uuid, boolean) to authenticated;

-- Rollback (if ever needed):
--   re-run the send_message / toggle_reaction definitions from 20261019010000_chat_phase2_features.sql
--   and set_message_pinned from 20261020000000_chat_phase3_membership_mirror.sql, then:
--   drop function if exists public.is_chat_timed_out(text);
--   drop table if exists public.chat_timeouts;
