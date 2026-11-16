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

// ---- chat message counts (stats awards) ----
import { chatMessageCounts } from './supabaseAdmin.js';

test('chatMessageCounts returns null when not configured', async () => {
  let called = false;
  assert.equal(await chatMessageCounts('g1', { env: {}, fetchImpl: async () => { called = true; } }), null);
  assert.equal(called, false);
});

test('chatMessageCounts maps rows to counts', async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, init };
    return { ok: true, json: async () => [{ sender_id: 'c-a', messages: 40 }, { sender_id: 'c-b', messages: '7' }] };
  };
  const counts = await chatMessageCounts('g1', { env, fetchImpl });
  assert.equal(seen.url, 'https://x.supabase.co/rest/v1/rpc/chat_message_counts');
  assert.equal(seen.init.method, 'POST');
  assert.deepEqual(JSON.parse(seen.init.body), { p_group_id: 'g1' });
  assert.deepEqual([...counts], [['c-a', 40], ['c-b', 7]]);
});

test('chatMessageCounts returns null on HTTP error', async () => {
  const fetchImpl = async () => ({ ok: false, status: 404, text: async () => 'missing function' });
  assert.equal(await chatMessageCounts('g1', { env, fetchImpl }), null);
});

// --- chat moderation -------------------------------------------------------
import {
  setChatTimeoutRow, deleteChatTimeoutRow, deleteGroupChatTimeouts, deleteUserChatTimeouts,
  getChatMessage, modDeleteChatMessage, latestChatMessageId, clearOwnerChatTimeout,
} from './supabaseAdmin.js';

const recorder = (respond = () => ({ ok: true, json: async () => [], text: async () => '' })) => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : undefined, headers: init.headers });
    return respond(url, init);
  };
  return { calls, fetchImpl };
};
const fail500 = () => ({ ok: false, status: 500, text: async () => 'boom' });

test('chat moderation calls are no-ops without configuration', async () => {
  const { calls, fetchImpl } = recorder();
  assert.equal(await setChatTimeoutRow('g1', 'u1', null, { env: {}, fetchImpl }), false);
  assert.equal(await deleteChatTimeoutRow('g1', 'u1', { env: {}, fetchImpl }), false);
  assert.equal(await deleteGroupChatTimeouts('g1', { env: {}, fetchImpl }), false);
  assert.equal(await deleteUserChatTimeouts('u1', { env: {}, fetchImpl }), false);
  assert.equal(calls.length, 0);
});

test('setChatTimeoutRow upserts one row; indefinite sends until null', async () => {
  const { calls, fetchImpl } = recorder();
  const until = new Date('2026-11-16T16:00:00Z');
  assert.equal(await setChatTimeoutRow('g1', 'u1', until, { env, fetchImpl }), true);
  assert.equal(await setChatTimeoutRow('g1', 'u1', null, { env, fetchImpl }), true);
  assert.equal(calls[0].method, 'POST');
  assert.match(calls[0].url, /\/rest\/v1\/chat_timeouts\?on_conflict=group_id,clerk_id$/);
  assert.match(calls[0].headers.Prefer, /resolution=merge-duplicates/);
  assert.deepEqual(calls[0].body, [{ group_id: 'g1', clerk_id: 'u1', until: '2026-11-16T16:00:00.000Z' }]);
  assert.deepEqual(calls[1].body, [{ group_id: 'g1', clerk_id: 'u1', until: null }]);
});

test('setChatTimeoutRow and deleteChatTimeoutRow throw on failure (callers roll back)', async () => {
  const { fetchImpl } = recorder(fail500);
  await assert.rejects(setChatTimeoutRow('g1', 'u1', null, { env, fetchImpl }));
  await assert.rejects(deleteChatTimeoutRow('g1', 'u1', { env, fetchImpl }));
});

test('deleteChatTimeoutRow deletes the one row', async () => {
  const { calls, fetchImpl } = recorder();
  assert.equal(await deleteChatTimeoutRow('g1', 'u1', { env, fetchImpl }), true);
  assert.equal(calls[0].method, 'DELETE');
  assert.match(calls[0].url, /chat_timeouts\?group_id=eq\.g1&clerk_id=eq\.u1$/);
});

test('group and user timeout cleanup log instead of throwing', async () => {
  const { calls, fetchImpl } = recorder();
  assert.equal(await deleteGroupChatTimeouts('g1', { env, fetchImpl }), true);
  assert.equal(await deleteUserChatTimeouts('u1', { env, fetchImpl }), true);
  assert.match(calls[0].url, /chat_timeouts\?group_id=eq\.g1$/);
  assert.match(calls[1].url, /chat_timeouts\?clerk_id=eq\.u1$/);
  const orig = console.error; console.error = () => {};
  try {
    assert.equal(await deleteGroupChatTimeouts('g1', { env, fetchImpl: recorder(fail500).fetchImpl }), false);
  } finally { console.error = orig; }
});

test('getChatMessage returns the row or null', async () => {
  const row = { id: 'm1', group_id: 'g1', sender_id: 'u1', image_url: null, deleted_at: null, created_at: '2026-11-16T15:00:00Z' };
  const { calls, fetchImpl } = recorder(() => ({ ok: true, json: async () => [row] }));
  assert.deepEqual(await getChatMessage('m1', { env, fetchImpl }), row);
  assert.match(calls[0].url, /\/rest\/v1\/messages\?select=id,group_id,sender_id,image_url,deleted_at,created_at&id=eq\.m1$/);
  const empty = recorder(() => ({ ok: true, json: async () => [] }));
  assert.equal(await getChatMessage('m2', { env, fetchImpl: empty.fetchImpl }), null);
  await assert.rejects(getChatMessage('m1', { env, fetchImpl: recorder(fail500).fetchImpl }));
});

test('modDeleteChatMessage removes the photo then blanks the message', async () => {
  const { calls, fetchImpl } = recorder();
  await modDeleteChatMessage({ id: 'm1', image_url: 'https://x.supabase.co/storage/v1/object/public/chat-images/chat/g1/p.jpg' }, { env, fetchImpl });
  assert.deepEqual(calls.map((c) => c.method), ['DELETE', 'PATCH']);
  assert.deepEqual(calls[0].body, { prefixes: ['chat/g1/p.jpg'] });
  assert.match(calls[1].url, /\/rest\/v1\/messages\?id=eq\.m1$/);
  const b = calls[1].body;
  assert.equal(b.content, '');
  assert.equal(b.image_url, null);
  assert.equal(b.reply_to_content, null);
  assert.deepEqual(b.mentions, []);
  assert.ok(!Number.isNaN(Date.parse(b.deleted_at)));
});

test('modDeleteChatMessage without a photo only patches, and throws on failure', async () => {
  const { calls, fetchImpl } = recorder();
  await modDeleteChatMessage({ id: 'm1', image_url: null }, { env, fetchImpl });
  assert.deepEqual(calls.map((c) => c.method), ['PATCH']);
  await assert.rejects(modDeleteChatMessage({ id: 'm1' }, { env, fetchImpl: recorder(fail500).fetchImpl }));
});

test('latestChatMessageId asks for the newest user message in the group', async () => {
  const { calls, fetchImpl } = recorder(() => ({ ok: true, json: async () => [{ id: 'm7' }] }));
  assert.equal(await latestChatMessageId('g1', { env, fetchImpl }), 'm7');
  assert.match(calls[0].url, /\/rest\/v1\/messages\?select=id&group_id=eq\.g1&kind=eq\.user&order=created_at\.desc&limit=1$/);
  const empty = recorder(() => ({ ok: true, json: async () => [] }));
  assert.equal(await latestChatMessageId('g1', { env, fetchImpl: empty.fetchImpl }), null);
});

test('clearOwnerChatTimeout retries once, then reports failure without throwing', async () => {
  let n = 0;
  const flaky = async () => (++n === 1 ? { ok: false, status: 503, text: async () => 'busy' } : { ok: true, text: async () => '' });
  const orig = console.error; console.error = () => {};
  try {
    assert.equal(await clearOwnerChatTimeout('g1', 'u1', { env, fetchImpl: flaky }), true);
    assert.equal(n, 2);
    assert.equal(await clearOwnerChatTimeout('g1', 'u1', { env, fetchImpl: recorder(fail500).fetchImpl }), false);
  } finally { console.error = orig; }
});
