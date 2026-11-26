-- Phase 2/4: server-side push trigger, atomic reactions, pins, system messages, mentions,
-- unread counts, search/media indexes. Additive. Run AFTER 20261019000000_chat_idempotent_send_and_indexes.sql.

-- ---------------------------------------------------------------- columns
alter table public.messages
  add column if not exists kind text not null default 'user' check (kind in ('user', 'system')),
  add column if not exists pinned_at timestamptz,
  add column if not exists pinned_by text,
  add column if not exists mentions text[] not null default '{}';

-- ---------------------------------------------------------------- indexes
create index if not exists messages_pinned_idx
  on public.messages (group_id, pinned_at desc) where pinned_at is not null;
create index if not exists messages_media_idx
  on public.messages (group_id, created_at desc) where image_url is not null and deleted_at is null;
create extension if not exists pg_trgm with schema extensions;
create index if not exists messages_content_trgm_idx
  on public.messages using gin (content extensions.gin_trgm_ops);

-- ---------------------------------------------------------------- send_message v2 (adds mentions)
drop function if exists public.send_message(text, text, text, text, uuid, text, text, text, int, int);
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

-- ---------------------------------------------------------------- atomic reactions
-- One reaction per user per message (same behaviour as before). Row-locked so two people
-- reacting at once can no longer overwrite each other.
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

-- ---------------------------------------------------------------- unread counts
-- p_reads: { "<groupId>": "<last read ISO timestamp or ''>" }. Counts others' messages after that
-- moment (capped at 100 per group), plus how many of them mention the caller.
create or replace function public.unread_counts(p_reads jsonb)
returns table (group_id text, unread int, mentioned int)
language sql
stable
security invoker
set search_path = public
as $$
  with me as (select (select auth.jwt() ->> 'sub') as id)
  select r.key as group_id,
         count(m.id)::int as unread,
         (count(m.id) filter (where (select id from me) = any (m.mentions)))::int as mentioned
  from jsonb_each_text(coalesce(p_reads, '{}'::jsonb)) r
  left join lateral (
    select id, mentions
    from public.messages
    where messages.group_id = r.key
      and messages.created_at > coalesce(nullif(r.value, '')::timestamptz, 'epoch'::timestamptz)
      and messages.sender_id <> (select id from me)
      and messages.kind = 'user'
      and messages.deleted_at is null
    order by messages.created_at desc
    limit 100
  ) m on true
  group by r.key
$$;

-- ---------------------------------------------------------------- server-side push trigger
-- Settings live in a schema the API can't reach. Until both rows exist the trigger does nothing,
-- so running this migration changes no behaviour by itself.
create schema if not exists private;
create table if not exists private.app_settings (
  key text primary key,
  value text not null
);
alter table private.app_settings enable row level security;
revoke all on schema private from anon, authenticated;
revoke all on private.app_settings from anon, authenticated;

create extension if not exists pg_net with schema extensions;

create or replace function private.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if new.kind <> 'user' then
    return new;
  end if;
  select value into v_url from private.app_settings where key = 'chat_webhook_url';
  select value into v_secret from private.app_settings where key = 'chat_webhook_secret';
  if v_url is null or v_secret is null then
    return new;
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('type', 'INSERT', 'record', to_jsonb(new)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    timeout_milliseconds := 8000
  );
  return new;
exception when others then
  -- a push problem must never block the message itself
  return new;
end;
$$;

drop trigger if exists messages_notify_after_insert on public.messages;
create trigger messages_notify_after_insert
  after insert on public.messages
  for each row execute function private.notify_new_message();

-- Rollback (if ever needed):
--   drop trigger if exists messages_notify_after_insert on public.messages;
--   drop function if exists private.notify_new_message();
--   drop function if exists public.unread_counts(jsonb), public.toggle_reaction(uuid, text);
--   (restore send_message from the previous migration file)
--   alter table public.messages drop column if exists kind, drop column if exists pinned_at,
--     drop column if exists pinned_by, drop column if exists mentions;
