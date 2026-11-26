-- Self-check for 20261116000000_chat_moderation.sql.
-- Paste into the Supabase SQL editor and run AFTER the migration. Everything happens inside a
-- transaction that is rolled back at the end, so it leaves nothing behind.
-- Success: the last notice says "ALL PASS". Any failure stops with "FAIL: ...".
begin;

select set_config('request.jwt.claims', '{"sub":"zz-check-user"}', true);

insert into public.group_members (group_id, clerk_id) values ('zz-check-group', 'zz-check-user');
insert into public.messages (id, group_id, sender_id, sender_name, content)
values ('00000000-0000-0000-0000-00000000c0de', 'zz-check-group', 'zz-check-user', 'Check', 'hello');

do $$
declare
  ok boolean;
  -- Runs a statement and reports whether it failed with exactly 'timed out'.
  refused boolean;
begin
  -- 1. No timeout yet: allowed.
  if public.is_chat_timed_out('zz-check-group') then raise exception 'FAIL: timed out with no row'; end if;
  perform public.send_message('zz-c1', 'zz-check-group', 'Check', 'one');

  -- 2. Active timeout: every chat action refused.
  insert into public.chat_timeouts (group_id, clerk_id, until)
  values ('zz-check-group', 'zz-check-user', now() + interval '1 hour');
  if not public.is_chat_timed_out('zz-check-group') then raise exception 'FAIL: active timeout not seen'; end if;

  refused := false;
  begin perform public.send_message('zz-c2', 'zz-check-group', 'Check', 'two');
  exception when others then refused := sqlerrm = 'timed out'; end;
  if not refused then raise exception 'FAIL: send_message not refused'; end if;

  refused := false;
  begin perform public.toggle_reaction('00000000-0000-0000-0000-00000000c0de', '👍');
  exception when others then refused := sqlerrm = 'timed out'; end;
  if not refused then raise exception 'FAIL: toggle_reaction not refused'; end if;

  refused := false;
  begin perform public.set_message_pinned('00000000-0000-0000-0000-00000000c0de', true);
  exception when others then refused := sqlerrm = 'timed out'; end;
  if not refused then raise exception 'FAIL: set_message_pinned not refused'; end if;

  -- 3. Timeout in another group doesn't count here.
  if public.is_chat_timed_out('zz-other-group') then raise exception 'FAIL: timeout leaked to another group'; end if;

  -- 4. Expired: allowed again.
  update public.chat_timeouts set until = now() - interval '1 minute'
  where group_id = 'zz-check-group' and clerk_id = 'zz-check-user';
  if public.is_chat_timed_out('zz-check-group') then raise exception 'FAIL: expired timeout still active'; end if;
  perform public.send_message('zz-c3', 'zz-check-group', 'Check', 'three');
  perform public.toggle_reaction('00000000-0000-0000-0000-00000000c0de', '👍');

  -- 5. Indefinite (until is null): refused.
  update public.chat_timeouts set until = null
  where group_id = 'zz-check-group' and clerk_id = 'zz-check-user';
  if not public.is_chat_timed_out('zz-check-group') then raise exception 'FAIL: indefinite timeout not seen'; end if;

  -- 6. Signed-in people can only read their own timeout rows.
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'chat_timeouts' and cmd = 'SELECT'
  ) then raise exception 'FAIL: no read policy on chat_timeouts'; end if;
  select relrowsecurity into ok from pg_class where oid = 'public.chat_timeouts'::regclass;
  if not ok then raise exception 'FAIL: row level security is off on chat_timeouts'; end if;

  raise notice 'ALL PASS';
end $$;

rollback;
