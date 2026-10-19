-- Phase 1: idempotent chat sends + query indexes.
-- Additive and backward compatible: app versions that still insert directly keep working.
-- Run this BEFORE shipping the app build that calls send_message().

alter table public.messages add column if not exists client_id text;

-- Plain (non-partial) unique index so ON CONFLICT can infer it; existing rows have NULL client_id and never collide.
create unique index if not exists messages_sender_client_id_key
  on public.messages (sender_id, client_id);

-- Matches the chat feed query: where group_id = ? order by created_at desc limit N
create index if not exists messages_group_created_idx
  on public.messages (group_id, created_at desc, id desc);

-- Covers the reply_to_id foreign key (performance advisor)
create index if not exists messages_reply_to_id_idx
  on public.messages (reply_to_id) where reply_to_id is not null;

-- Same rule as before, but auth.jwt() is evaluated once per statement instead of once per row
drop policy if exists "allow insert" on public.messages;
create policy "allow insert" on public.messages
  for insert to public
  with check (((select auth.jwt()) ->> 'sub') = sender_id);

-- Idempotent send: a retry with the same client_id returns the already-saved row instead of inserting again.
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
  p_image_height int default null
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
    image_url, image_width, image_height
  ) values (
    p_client_id, p_group_id, v_sender, p_sender_name, coalesce(p_content, ''),
    p_reply_to_id, p_reply_to_content, p_reply_to_sender,
    p_image_url, p_image_width, p_image_height
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

-- Rollback (if ever needed):
--   drop function if exists public.send_message(text,text,text,text,uuid,text,text,text,int,int);
--   drop index if exists public.messages_sender_client_id_key, public.messages_group_created_idx, public.messages_reply_to_id_idx;
--   alter table public.messages drop column if exists client_id;
--   (the insert policy is functionally identical to the old one)
