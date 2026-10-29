import crypto from 'crypto';

// Constant-time string compare so the webhook secret can't be guessed byte by byte.
export const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a ?? ''));
  const bb = Buffer.from(String(b ?? ''));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
};

// What the notification says for a message row coming from the database trigger.
export const messagePreview = (record) => {
  const text = typeof record?.content === 'string' ? record.content.trim() : '';
  if (text) return text.slice(0, 500);
  return record?.image_url ? '📷 Photo' : '';
};

/**
 * Splits a group's members into who gets a normal chat push and who was @mentioned.
 * Mentioned members are always notified (like GroupMe, a mention cuts through a
 * mute); everyone else respects mutes. The sender is never notified.
 *
 * members: [{ clerkId, expoPushToken, expoPushTokens, mutedGroups, mutedUntilNextMeetup, notificationPrefs }]
 */
export const pickRecipients = (members, { senderClerkId, mentions = [], groupId }) => {
  const gid = String(groupId);
  const mentioned = new Set((Array.isArray(mentions) ? mentions : []).map(String));
  const muted = (u) =>
    (u.mutedGroups || []).some((id) => String(id) === gid) ||
    (u.mutedUntilNextMeetup || []).some((id) => String(id) === gid);

  const normal = [];
  const mention = [];
  for (const u of members) {
    const hasToken = !!u.expoPushToken || (u.expoPushTokens || []).length > 0;
    if (!hasToken || u.clerkId === senderClerkId) continue;
    // A member who switched chat pushes off in Settings gets none (mentions included).
    if (u.notificationPrefs && u.notificationPrefs.chat === false) continue;
    if (mentioned.has(u.clerkId)) mention.push(u);
    else if (!muted(u)) normal.push(u);
  }
  return { normal, mention };
};
