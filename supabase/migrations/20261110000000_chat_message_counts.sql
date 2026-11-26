-- Stats awards ("Chatty Cathy"): chat messages per sender in one group.
-- Called only by the backend with the service-role key (utils/supabaseAdmin.js
-- chatMessageCounts). Additive and safe to run any time; until it exists the award is hidden.
create or replace function public.chat_message_counts(p_group_id text)
returns table (sender_id text, messages bigint)
language sql stable security invoker set search_path = public as $$
  select m.sender_id, count(*) from public.messages m
  where m.group_id = p_group_id and m.kind = 'user' and m.deleted_at is null
  group by m.sender_id
$$;

revoke all on function public.chat_message_counts(text) from public, anon, authenticated;
grant execute on function public.chat_message_counts(text) to service_role;

-- Rollback: drop function if exists public.chat_message_counts(text);
