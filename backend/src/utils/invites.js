import crypto from "crypto";

// Invite links: https://invite.groupthatapp.com/join/<token>. Each group has one active
// token at a time, plus a short code people can type in the app.

export const INVITE_BASE_URL = 'https://invite.groupthatapp.com';
export const APP_STORE_URL = 'https://apps.apple.com/app/groupthat/id6756112941';
export const APP_STORE_ID = '6756112941';
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.dallinhull.groupthat';
export const ANDROID_PACKAGE = 'com.dallinhull.groupthat';

// No 0/O, 1/I/L, so a code read aloud or off a screen can't be mistyped.
export const INVITE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const TOKEN_RE = /^[A-Za-z0-9_-]{1,128}$/;
const CODE_RE = new RegExp(`^[${INVITE_CODE_ALPHABET}]{6}$`);

export const generateInviteCode = () => {
  const bytes = crypto.randomBytes(6);
  let code = '';
  for (const b of bytes) code += INVITE_CODE_ALPHABET[b % INVITE_CODE_ALPHABET.length];
  return code;
};

export const generateInviteToken = () => crypto.randomBytes(16).toString('hex');

export const normalizeInviteCode = (s) => String(s ?? '').trim().toUpperCase();
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
