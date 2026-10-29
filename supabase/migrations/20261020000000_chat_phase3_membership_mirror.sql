-- Phase 3a (SAFE TO RUN ANY TIME): a copy of "who is in which group" for chat security rules.
-- Requires 20261019010000_chat_phase2_features.sql to have been run first (it adds the pin columns and the private schema).
-- Purely additive. Nothing reads it yet, so running this changes no behaviour.
--
-- After running:
--   1. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the backend (the system-message feature uses them too).
--   2. Deploy the backend (it now keeps this table in sync on create / join / leave / remove / delete).
--   3. Run once:  node src/scripts/syncChatMembership.js   (backfills existing groups)
--   4. Ship the app build, wait for most people to update, THEN run 20261020010000_chat_phase3_lockdown.sql.

create table if not exists public.group_members (
  group_id text not null,
  clerk_id text not null,
  primary key (group_id, clerk_id)
);
create index if not exists group_members_clerk_idx on public.group_members (clerk_id);

alter table public.group_members enable row level security;

-- Signed-in people may see only their own rows. Only the backend (service role) writes.
drop policy if exists "read own memberships" on public.group_members;
create policy "read own memberships" on public.group_members
  for select to authenticated
  using (clerk_id = (select auth.jwt() ->> 'sub'));

-- Used by the security rules below. security definer so it can read the table regardless of the caller's own access.
create or replace function public.is_group_member(p_group_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id
      and clerk_id = (select auth.jwt() ->> 'sub')
  );
$$;
revoke all on function public.is_group_member(text) from public;
grant execute on function public.is_group_member(text) to authenticated;


-- Pin / unpin: any member of the group may pin (like GroupMe).
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

-- Rollback:
--   drop function if exists public.set_message_pinned(uuid, boolean);
--   drop function if exists public.is_group_member(text);
--   drop table if exists public.group_members;
