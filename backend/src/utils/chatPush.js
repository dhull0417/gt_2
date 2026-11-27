import crypto from 'crypto';
import { isMutedFor } from './groupMute.js';

// Constant-time string compare so the webhook secret can't be guessed byte by byte.
export const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a ?? ''));
  const bb = Buffer.from(String(b ?? ''));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
};

// Chat GIFs are stored as chat/<groupId>/<clientId>.gif; the file name is what marks them
// (same rule as mobile/utils/chatGif.ts). Ignores the ?t= cache-buster.
const isGifUrl = (url) => typeof url === 'string' && /\.gif$/i.test(url.split(/[?#]/)[0]);

// What the notification says for a message row coming from the database trigger.
export const messagePreview = (record) => {
  const text = typeof record?.content === 'string' ? record.content.trim() : '';
  if (text) return text.slice(0, 500);
  if (!record?.image_url) return '';
  return isGifUrl(record.image_url) ? 'GIF' : '📷 Photo';
};

/**
 * Splits a group's members into who gets a normal chat push and who was @mentioned.
 * Mentioned members are always notified (like GroupMe, a mention cuts through a
 * mute); everyone else respects mutes. The sender is never notified.
 *
 * members: [{ clerkId, expoPushToken, expoPushTokens, groupMutes, mutedGroups, mutedUntilNextMeetup, notificationPrefs }]
 */
export const pickRecipients = (members, { senderClerkId, mentions = [], groupId }) => {
  const mentioned = new Set((Array.isArray(mentions) ? mentions : []).map(String));
  const muted = (u) => isMutedFor(u, groupId, 'chat');

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
