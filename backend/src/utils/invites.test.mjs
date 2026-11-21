import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH, generateInviteCode, isInviteCode, isLegacyInviteCode, normalizeInviteCode, formatInviteCode,
  inviteStatus, playReferrer, playStoreUrl, PLAY_STORE_URL, DEAD_INVITE_MESSAGES, inviteBaseUrl,
} from './invites.js';

test('generateInviteCode makes 8 characters from the unambiguous alphabet', () => {
  assert.equal(INVITE_CODE_ALPHABET, 'ABCDEFGHJKMNPQRSTUVWXYZ23456789');
  assert.equal(INVITE_CODE_LENGTH, 8);
  for (let i = 0; i < 200; i++) {
    const code = generateInviteCode();
    assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    assert.equal(isLegacyInviteCode(code), false);
  }
  assert.equal(isLegacyInviteCode('K7P2QX'), true);
});

test('isInviteCode accepts codes in any case and rejects tokens and junk', () => {
  assert.equal(isInviteCode('K7P2QXMR'), true);
  assert.equal(isInviteCode('k7p2qxmr'), true);
  assert.equal(isInviteCode('K7P2QX'), true); // 6-character codes from before still work
  assert.equal(isInviteCode('K7P2QXM'), false);
  assert.equal(isInviteCode('K7P2QXMRA'), false);
  assert.equal(isInviteCode('123456'), false); // a 6-digit verification code is not an invite code
  assert.equal(isInviteCode(' k7p2qx '), true);
  assert.equal(isInviteCode('K7P2Q0'), false); // 0 is not in the alphabet
  assert.equal(isInviteCode('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4'), false);
  assert.equal(isInviteCode(''), false);
  assert.equal(isInviteCode(undefined), false);
  assert.equal(normalizeInviteCode(' k7p2qx '), 'K7P2QX');
  assert.equal(normalizeInviteCode('k7p2 qxmr'), 'K7P2QXMR');
  assert.equal(isInviteCode('K7P2-QXMR'), true);
  assert.equal(formatInviteCode('K7P2QXMR'), 'K7P2 QXMR');
  assert.equal(formatInviteCode('K7P2QX'), 'K7P2QX');
});

test('inviteStatus reports why an invite is dead, checking revoked, expired, then maxed', () => {
  const now = new Date('2026-11-16T12:00:00Z');
  assert.equal(inviteStatus(null, now), 'missing');
  assert.equal(inviteStatus({ expiresAt: null, uses: 0 }, now), 'active');
  assert.equal(inviteStatus({ expiresAt: new Date('2026-11-17T00:00:00Z') }, now), 'active');
  assert.equal(inviteStatus({ expiresAt: new Date('2026-11-16T11:59:59Z') }, now), 'expired');
  assert.equal(inviteStatus({ revokedAt: new Date('2026-11-01'), expiresAt: new Date('2026-11-01') }, now), 'revoked');
  assert.equal(inviteStatus({ maxUses: 10, uses: 9 }, now), 'active');
  assert.equal(inviteStatus({ maxUses: 10, uses: 10 }, now), 'maxed');
  assert.equal(inviteStatus({ maxUses: null, uses: 500 }, now), 'active');
  assert.equal(DEAD_INVITE_MESSAGES.revoked, 'This invite link is no longer active.');
  assert.equal(DEAD_INVITE_MESSAGES.expired, 'This invite link is no longer active.');
  assert.equal(DEAD_INVITE_MESSAGES.maxed, 'This invite link has reached its limit.');
  assert.equal(DEAD_INVITE_MESSAGES.missing, 'This invite link is invalid or has expired.');
});

test('playReferrer carries the token and the meetup; playStoreUrl encodes it', () => {
  assert.equal(playReferrer({ token: 'abc' }), 'gt_invite=abc');
  assert.equal(playReferrer({ token: 'abc', meetupId: '64b000000000000000000001' }), 'gt_invite=abc&gt_m=64b000000000000000000001');
  assert.equal(
    playStoreUrl({ token: 'abc', meetupId: 'm1' }),
    `${PLAY_STORE_URL}&referrer=gt_invite%3Dabc%26gt_m%3Dm1`
  );
  assert.equal(playStoreUrl({}), PLAY_STORE_URL);
});

test('inviteBaseUrl: production address by default; a server can use its own (e.g. staging)', () => {
  assert.equal(inviteBaseUrl(undefined), 'https://invite.groupthatapp.com');
  assert.equal(inviteBaseUrl(''), 'https://invite.groupthatapp.com');
  assert.equal(inviteBaseUrl('https://gt-2-git-staging-x.vercel.app/'), 'https://gt-2-git-staging-x.vercel.app');
  assert.equal(inviteBaseUrl(' https://staging.example.com '), 'https://staging.example.com');
  // Anything that isn't a plain https origin is ignored.
  assert.equal(inviteBaseUrl('http://insecure.example.com'), 'https://invite.groupthatapp.com');
  assert.equal(inviteBaseUrl('https://example.com/path'), 'https://invite.groupthatapp.com');
  assert.equal(inviteBaseUrl('javascript:alert(1)'), 'https://invite.groupthatapp.com');
});
