import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isConfigured, storagePathFromUrl, purgeGroupChat, scrubUserChat, addChatMembers, removeChatMember,
} from './supabaseAdmin.js';

const env = { SUPABASE_URL: 'https://x.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: 'svc' };

test('everything is a no-op without configuration', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; };
  assert.equal(isConfigured({}), false);
  assert.equal(await purgeGroupChat('g1', { env: {}, fetchImpl }), false);
  assert.equal(await scrubUserChat('u1', { env: {}, fetchImpl }), false);
  assert.equal(await addChatMembers('g1', ['u1'], { env: {}, fetchImpl }), false);
  assert.equal(called, false);
});

test('storagePathFromUrl extracts the object path and ignores other buckets', () => {
  const url = 'https://x.supabase.co/storage/v1/object/public/chat-images/chat/g1/a%20b.jpg?t=123';
  assert.equal(storagePathFromUrl(url, 'chat-images'), 'chat/g1/a b.jpg');
  assert.equal(storagePathFromUrl(url, 'group-images'), null);
  assert.equal(storagePathFromUrl(undefined, 'chat-images'), null);
});

test('purgeGroupChat removes photos then messages', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body });
    if (url.includes('select=image_url')) {
      return { ok: true, json: async () => [{ image_url: 'https://x.supabase.co/storage/v1/object/public/chat-images/chat/a.jpg?t=1' }] };
    }
    return { ok: true, json: async () => ({}), text: async () => '' };
  };
  assert.equal(await purgeGroupChat('g1', { env, fetchImpl }), true);
  assert.deepEqual(calls.map((c) => c.method), ['GET', 'DELETE', 'DELETE']);
  assert.equal(JSON.parse(calls[1].body).prefixes[0], 'chat/a.jpg');
  assert.match(calls[2].url, /\/rest\/v1\/messages\?group_id=eq\.g1$/);
});

test('scrubUserChat blanks the person\'s messages', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body });
    return { ok: true, json: async () => [], text: async () => '' };
  };
  assert.equal(await scrubUserChat('user_1', { env, fetchImpl }), true);
  const patch = calls.find((c) => c.method === 'PATCH');
  assert.ok(patch);
  assert.equal(JSON.parse(patch.body).content, '');
  assert.equal(JSON.parse(patch.body).sender_name, 'Deleted user');
});

test('failures are logged, never thrown', async () => {
  const fetchImpl = async () => ({ ok: false, status: 500, text: async () => 'nope' });
  const origError = console.error;
  console.error = () => {};
  try {
    assert.equal(await removeChatMember('g1', 'u1', { env, fetchImpl }), false);
  } finally {
    console.error = origError;
  }
});
