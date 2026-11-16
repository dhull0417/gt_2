// Server-side helpers for the Supabase project that stores chat (messages + images).
//
// Everything here uses the service-role key, which bypasses row-level security and
// must only ever live in the backend's environment (never in the mobile app). When
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY aren't set every function is a quiet
// no-op that resolves to false, so these features are simply off until configured.
//
// Callers always await these: on Vercel, work left running after the response is
// sent can be frozen or dropped. Failures are logged, never thrown, because the
// Mongo change that triggered them has already been made.

export const isConfigured = (env = process.env) =>
  Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);

const headers = (env, extra = {}) => ({
  'Content-Type': 'application/json',
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  ...extra,
});

const base = (env) => env.SUPABASE_URL.replace(/\/+$/, '');

const call = async (env, fetchImpl, path, init = {}) => {
  const res = await fetchImpl(`${base(env)}${path}`, {
    ...init,
    headers: headers(env, init.headers),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${init.method || 'GET'} ${path} -> ${res.status} ${text}`.slice(0, 300));
  }
  return res;
};

const enc = encodeURIComponent;

/** "https://x.supabase.co/storage/v1/object/public/chat-images/chat/a.jpg?t=1" -> "chat/a.jpg" (or null). */
export const storagePathFromUrl = (url, bucket) => {
  if (typeof url !== 'string') return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const path = decodeURIComponent(url.slice(idx + marker.length).split('?')[0]);
  return path || null;
};

const removeObjects = async (env, fetchImpl, bucket, paths) => {
  for (let i = 0; i < paths.length; i += 100) {
    await call(env, fetchImpl, `/storage/v1/object/${bucket}`, {
      method: 'DELETE',
      body: JSON.stringify({ prefixes: paths.slice(i, i + 100) }),
    });
  }
};

const safely = async (label, fn) => {
  try {
    await fn();
    return true;
  } catch (err) {
    console.error(`[supabaseAdmin] ${label} failed:`, err?.message || err);
    return false;
  }
};

/** Deletes every chat message and photo belonging to a group (used when a group is deleted). */
export const purgeGroupChat = (groupId, { env = process.env, fetchImpl = fetch } = {}) => {
  if (!groupId || !isConfigured(env)) return Promise.resolve(false);
  return safely('purgeGroupChat', async () => {
    const gid = enc(`eq.${groupId}`);
    const res = await call(env, fetchImpl, `/rest/v1/messages?select=image_url&group_id=${gid}&image_url=not.is.null`);
    const rows = await res.json();
    const paths = rows.map((r) => storagePathFromUrl(r.image_url, 'chat-images')).filter(Boolean);
    if (paths.length) await removeObjects(env, fetchImpl, 'chat-images', paths);
    await call(env, fetchImpl, `/rest/v1/messages?group_id=${gid}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  });
};

/**
 * Erases a person's chat footprint (used when they delete their account): their photos are
 * removed from storage and their messages are blanked, keeping the rows so replies and
 * conversation flow in the group still make sense.
 */
export const scrubUserChat = (clerkId, { env = process.env, fetchImpl = fetch } = {}) => {
  if (!clerkId || !isConfigured(env)) return Promise.resolve(false);
  return safely('scrubUserChat', async () => {
    const who = enc(`eq.${clerkId}`);
    const res = await call(env, fetchImpl, `/rest/v1/messages?select=image_url&sender_id=${who}&image_url=not.is.null`);
    const rows = await res.json();
    const paths = rows.map((r) => storagePathFromUrl(r.image_url, 'chat-images')).filter(Boolean);
    if (paths.length) await removeObjects(env, fetchImpl, 'chat-images', paths);
    await call(env, fetchImpl, `/rest/v1/messages?sender_id=${who}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        content: '',
        image_url: null,
        sender_name: 'Deleted user',
        reply_to_content: null,
        reactions: {},
        mentions: [],
        deleted_at: new Date().toISOString(),
      }),
    });
  });
};

// --- group membership mirror (used by chat row-level security) ---------------
// Mongo is the source of truth for who is in which group; Postgres keeps a copy in
// public.group_members so security rules can check membership. See
// supabase/migrations/*_chat_phase3_*.sql.

/** Adds people to a group's mirror. `clerkIds` is a list of Clerk user ids. */
export const addChatMembers = (groupId, clerkIds, { env = process.env, fetchImpl = fetch } = {}) => {
  const ids = [...new Set((clerkIds || []).filter(Boolean))];
  if (!groupId || ids.length === 0 || !isConfigured(env)) return Promise.resolve(false);
  return safely('addChatMembers', () =>
    call(env, fetchImpl, '/rest/v1/group_members?on_conflict=group_id,clerk_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(ids.map((clerk_id) => ({ group_id: String(groupId), clerk_id }))),
    })
  );
};

export const removeChatMember = (groupId, clerkId, { env = process.env, fetchImpl = fetch } = {}) => {
  if (!groupId || !clerkId || !isConfigured(env)) return Promise.resolve(false);
  return safely('removeChatMember', () =>
    call(env, fetchImpl, `/rest/v1/group_members?group_id=${enc(`eq.${groupId}`)}&clerk_id=${enc(`eq.${clerkId}`)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    })
  );
};

export const removeAllChatMembers = (groupId, { env = process.env, fetchImpl = fetch } = {}) => {
  if (!groupId || !isConfigured(env)) return Promise.resolve(false);
  return safely('removeAllChatMembers', () =>
    call(env, fetchImpl, `/rest/v1/group_members?group_id=${enc(`eq.${groupId}`)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    })
  );
};

/** Removes one person from every group's mirror (account deletion). */
export const removeChatMemberEverywhere = (clerkId, { env = process.env, fetchImpl = fetch } = {}) => {
  if (!clerkId || !isConfigured(env)) return Promise.resolve(false);
  return safely('removeChatMemberEverywhere', () =>
    call(env, fetchImpl, `/rest/v1/group_members?clerk_id=${enc(`eq.${clerkId}`)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    })
  );
};

/**
 * Chat messages per sender in a group, for the Stats "Chatty Cathy" award:
 * Map<clerkId, count>. Counts user messages that weren't deleted (SQL function
 * chat_message_counts, migration 20261110000000). Resolves to null when Supabase isn't
 * configured or the call fails, so the award is simply left out.
 */
export const chatMessageCounts = async (groupId, { env = process.env, fetchImpl = fetch } = {}) => {
  if (!groupId || !isConfigured(env)) return null;
  try {
    const res = await call(env, fetchImpl, '/rest/v1/rpc/chat_message_counts', {
      method: 'POST',
      body: JSON.stringify({ p_group_id: String(groupId) }),
    });
    const rows = await res.json();
    return new Map(rows.map((r) => [r.sender_id, Number(r.messages) || 0]));
  } catch (err) {
    console.error('[supabaseAdmin] chatMessageCounts failed:', err?.message || err);
    return null;
  }
};

// --- chat moderation (docs/specs/2026-11-16-chat-moderation-design.md) -------
// Mongo's Group.chatTimeouts is the source of truth; public.chat_timeouts is the copy the
// database checks before letting someone send, react or pin. The single-row calls below THROW
// on failure, because the route rolls its Mongo change back so the two never disagree.

const notConfigured = (env) => !isConfigured(env);

/** Creates or replaces one person's timeout in one group. `until` null = indefinite. */
export const setChatTimeoutRow = async (groupId, clerkId, until, { env = process.env, fetchImpl = fetch } = {}) => {
  if (!groupId || !clerkId || notConfigured(env)) return false;
  await call(env, fetchImpl, '/rest/v1/chat_timeouts?on_conflict=group_id,clerk_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ group_id: String(groupId), clerk_id: clerkId, until: until ? new Date(until).toISOString() : null }]),
  });
  return true;
};

export const deleteChatTimeoutRow = async (groupId, clerkId, { env = process.env, fetchImpl = fetch } = {}) => {
  if (!groupId || !clerkId || notConfigured(env)) return false;
  await call(env, fetchImpl, `/rest/v1/chat_timeouts?group_id=${enc(`eq.${groupId}`)}&clerk_id=${enc(`eq.${clerkId}`)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
  return true;
};

/** Group deletion. */
export const deleteGroupChatTimeouts = (groupId, { env = process.env, fetchImpl = fetch } = {}) => {
  if (!groupId || notConfigured(env)) return Promise.resolve(false);
  return safely('deleteGroupChatTimeouts', () =>
    call(env, fetchImpl, `/rest/v1/chat_timeouts?group_id=${enc(`eq.${groupId}`)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    })
  );
};

/** Account deletion. */
export const deleteUserChatTimeouts = (clerkId, { env = process.env, fetchImpl = fetch } = {}) => {
  if (!clerkId || notConfigured(env)) return Promise.resolve(false);
  return safely('deleteUserChatTimeouts', () =>
    call(env, fetchImpl, `/rest/v1/chat_timeouts?clerk_id=${enc(`eq.${clerkId}`)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    })
  );
};

/** The fields a moderator delete needs, or null if there's no such message. Throws on failure. */
export const getChatMessage = async (messageId, { env = process.env, fetchImpl = fetch } = {}) => {
  if (!messageId || notConfigured(env)) return null;
  const res = await call(env, fetchImpl, `/rest/v1/messages?select=id,group_id,sender_id,image_url,deleted_at,created_at&id=${enc(`eq.${messageId}`)}`);
  const rows = await res.json();
  return rows[0] ?? null;
};

/**
 * A moderator delete: same result as the author deleting it (and the lockdown's scrub trigger),
 * done with the service role. The photo is removed first; if that fails it's logged and the message
 * is still blanked (its link is cleared, so nobody can open it from the chat). Throws if blanking fails.
 */
export const modDeleteChatMessage = async (message, { env = process.env, fetchImpl = fetch } = {}) => {
  const path = storagePathFromUrl(message?.image_url, 'chat-images');
  if (path) await safely('modDeleteChatMessage photo', () => removeObjects(env, fetchImpl, 'chat-images', [path]));
  await call(env, fetchImpl, `/rest/v1/messages?id=${enc(`eq.${message.id}`)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      deleted_at: new Date().toISOString(),
      content: '',
      image_url: null,
      reply_to_content: null,
      mentions: [],
    }),
  });
};

/** Id of the newest ordinary message in a group (deleted or not), or null. Throws on failure. */
export const latestChatMessageId = async (groupId, { env = process.env, fetchImpl = fetch } = {}) => {
  if (!groupId || notConfigured(env)) return null;
  const res = await call(env, fetchImpl, `/rest/v1/messages?select=id&group_id=${enc(`eq.${groupId}`)}&kind=eq.user&order=created_at.desc&limit=1`);
  const rows = await res.json();
  return rows[0]?.id ?? null;
};

/**
 * Ownership moved to someone: their chat timeout must go (nobody could ever lift a timed-out
 * owner's). Tried twice; a failure is logged loudly since the database would keep blocking them.
 */
export const clearOwnerChatTimeout = async (groupId, clerkId, opts = {}) => {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await deleteChatTimeoutRow(groupId, clerkId, opts);
      return true;
    } catch (err) {
      console.error(`[supabaseAdmin] clearOwnerChatTimeout attempt ${attempt} failed for group ${groupId}:`, err?.message || err);
    }
  }
  return false;
};
