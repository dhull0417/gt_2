import test from 'node:test';
import assert from 'node:assert/strict';
import { postSystemMessage, buildSystemRow, isSystemMessagingConfigured } from './systemMessage.js';

test('no-op when Supabase env vars are missing', async () => {
  let called = false;
  const ok = await postSystemMessage('g1', 'hi', { env: {}, fetchImpl: async () => { called = true; } });
  assert.equal(ok, false);
  assert.equal(called, false);
  assert.equal(isSystemMessagingConfigured({}), false);
});

test('posts a kind=system row with the service key', async () => {
  let seen;
  const env = { SUPABASE_URL: 'https://x.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: 'svc' };
  const ok = await postSystemMessage('g1', 'Sam joined the group', {
    env,
    fetchImpl: async (url, init) => { seen = { url, init }; return { ok: true }; },
  });
  assert.equal(ok, true);
  assert.equal(seen.url, 'https://x.supabase.co/rest/v1/messages');
  assert.equal(seen.init.headers.Authorization, 'Bearer svc');
  const body = JSON.parse(seen.init.body);
  assert.deepEqual(body, buildSystemRow('g1', 'Sam joined the group'));
  assert.equal(body.kind, 'system');
});

test('never throws when the request fails', async () => {
  const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc' };
  assert.equal(await postSystemMessage('g1', 'x', { env, fetchImpl: async () => { throw new Error('boom'); } }), false);
  assert.equal(await postSystemMessage('g1', 'x', { env, fetchImpl: async () => ({ ok: false, status: 500, text: async () => 'bad' }) }), false);
});
