import crypto from "crypto";

// Invite links: https://invite.groupthatapp.com/join/<token>. Each group has one active
// token at a time, plus a short code people can type in the app.

const PRODUCTION_INVITE_BASE_URL = 'https://invite.groupthatapp.com';

/**
 * Address put in invite links. Production uses invite.groupthatapp.com; another server (staging)
 * sets INVITE_BASE_URL to its own address, so links from dev builds open that server's invite page
 * (and iMessage/WhatsApp build the preview card from it). Only a plain https origin is accepted.
 */
export const inviteBaseUrl = (value) => {
  const v = String(value ?? '').trim().replace(/\/+$/, '');
  return /^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(v) ? v : PRODUCTION_INVITE_BASE_URL;
};

export const INVITE_BASE_URL = inviteBaseUrl(process.env.INVITE_BASE_URL);
export const APP_STORE_URL = 'https://apps.apple.com/app/groupthat/id6756112941';
export const APP_STORE_ID = '6756112941';
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.dallinhull.groupthat';
export const ANDROID_PACKAGE = 'com.dallinhull.groupthat';

// No 0/O, 1/I/L, so a code read aloud or off a screen can't be mistyped.
export const INVITE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const TOKEN_RE = /^[A-Za-z0-9_-]{1,128}$/;
// 8 characters, so a code isn't mistaken for a 6-digit email/SMS verification code.
// Codes made before the switch were 6 characters; they still resolve until the group's
// invite screen next loads and swaps them for an 8-character one (see ensureCode).
export const INVITE_CODE_LENGTH = 8;
const LEGACY_INVITE_CODE_LENGTH = 6;
const CODE_RE = new RegExp(`^(?:[${INVITE_CODE_ALPHABET}]{${INVITE_CODE_LENGTH}}|[${INVITE_CODE_ALPHABET}]{${LEGACY_INVITE_CODE_LENGTH}})$`);

/** True when a stored code is from before the switch to 8 characters. */
export const isLegacyInviteCode = (code) => typeof code === 'string' && code.length !== INVITE_CODE_LENGTH;

export const generateInviteCode = () => {
  const bytes = crypto.randomBytes(INVITE_CODE_LENGTH);
  let code = '';
  for (const b of bytes) code += INVITE_CODE_ALPHABET[b % INVITE_CODE_ALPHABET.length];
  return code;
};

export const generateInviteToken = () => crypto.randomBytes(16).toString('hex');

export const normalizeInviteCode = (s) => String(s ?? '').toUpperCase().replace(/[\s-]/g, '');
/** "K7P2QXMR" -> "K7P2 QXMR" for display; the space is ignored when typed back in. */
export const formatInviteCode = (code) => {
  const c = String(code ?? '');
  return c.length === INVITE_CODE_LENGTH ? `${c.slice(0, 4)} ${c.slice(4)}` : c;
};
export const isInviteCode = (s) => typeof s === 'string' && CODE_RE.test(normalizeInviteCode(s));

/** 'missing' | 'revoked' | 'expired' | 'maxed' | 'active' */
export const inviteStatus = (invite, now = new Date()) => {
  if (!invite) return 'missing';
  if (invite.revokedAt) return 'revoked';
  if (invite.expiresAt && new Date(invite.expiresAt) <= now) return 'expired';
  if (invite.maxUses != null && (invite.uses ?? 0) >= invite.maxUses) return 'maxed';
  return 'active';
};

export const DEAD_INVITE_MESSAGES = {
  missing: 'This invite link is invalid or has expired.',
  revoked: 'This invite link is no longer active.',
  expired: 'This invite link is no longer active.',
  maxed: 'This invite link has reached its limit.',
};

/** What Google Play hands back to the app on first launch (Install Referrer API). */
export const playReferrer = ({ token, meetupId } = {}) => {
  if (!token) return '';
  return meetupId ? `gt_invite=${token}&gt_m=${meetupId}` : `gt_invite=${token}`;
};

export const playStoreUrl = (opts = {}) => {
  const ref = playReferrer(opts);
  return ref ? `${PLAY_STORE_URL}&referrer=${encodeURIComponent(ref)}` : PLAY_STORE_URL;
};

export const inviteLinkFor = (token) => `${INVITE_BASE_URL}/join/${token}`;
