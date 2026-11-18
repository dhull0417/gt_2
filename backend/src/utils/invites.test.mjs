import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INVITE_CODE_ALPHABET, generateInviteCode, isInviteCode, normalizeInviteCode,
  inviteStatus, playReferrer, playStoreUrl, PLAY_STORE_URL, DEAD_INVITE_MESSAGES,
} from './invites.js';

test('generateInviteCode makes 6 characters from the unambiguous alphabet', () => {
  assert.equal(INVITE_CODE_ALPHABET, 'ABCDEFGHJKMNPQRSTUVWXYZ23456789');
  for (let i = 0; i < 200; i++) {
    const code = generateInviteCode();
    assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  }
});

test('isInviteCode accepts codes in any case and rejects tokens and junk', () => {
  assert.equal(isInviteCode('K7P2QX'), true);
  assert.equal(isInviteCode('k7p2qx'), true);
  assert.equal(isInviteCode(' k7p2qx '), true);
  assert.equal(isInviteCode('K7P2Q0'), false); // 0 is not in the alphabet
  assert.equal(isInviteCode('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4'), false);
  assert.equal(isInviteCode(''), false);
  assert.equal(isInviteCode(undefined), false);
  assert.equal(normalizeInviteCode(' k7p2qx '), 'K7P2QX');
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
