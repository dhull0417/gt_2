// Posts a centered "system" line ("Sam joined the group") into a group's chat.
//
// Chat messages live in Supabase, not Mongo. System lines are written by this
// server with the Supabase service-role key, which bypasses row-level security.
// That key must only ever be set here on the backend (Vercel env vars) — never in
// the mobile app. When the env vars are missing this is a silent no-op, so the
// feature is simply off until it is configured and nothing else is affected.
//
// Always awaited by callers: on Vercel, work left running after the response is
// sent can be frozen or dropped.

const SYSTEM_SENDER_ID = 'system';
const SYSTEM_SENDER_NAME = 'GroupThat';

export const isSystemMessagingConfigured = (env = process.env) =>
  Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);

export const buildSystemRow = (groupId, text) => ({
  group_id: String(groupId),
  sender_id: SYSTEM_SENDER_ID,
  sender_name: SYSTEM_SENDER_NAME,
  content: String(text).slice(0, 500),
  kind: 'system',
});

export const postSystemMessage = async (groupId, text, { env = process.env, fetchImpl = fetch } = {}) => {
  if (!groupId || !text || !isSystemMessagingConfigured(env)) return false;
  try {
    const base = env.SUPABASE_URL.replace(/\/+$/, '');
    const res = await fetchImpl(`${base}/rest/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(buildSystemRow(groupId, text)),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error('System message insert failed:', res.status, await res.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (err) {
    console.error('System message error:', err?.message || err);
    return false;
  }
};
