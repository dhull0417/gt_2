import test from 'node:test';
import assert from 'node:assert/strict';
import { safeEqual, messagePreview, pickRecipients } from './chatPush.js';

test('safeEqual', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'abcd'), false);
  assert.equal(safeEqual(undefined, 'x'), false);
});

test('messagePreview falls back to Photo', () => {
  assert.equal(messagePreview({ content: '  hi ' }), 'hi');
  assert.equal(messagePreview({ content: '', image_url: 'u' }), '📷 Photo');
  assert.equal(messagePreview({ content: '' }), '');
});

test('pickRecipients: skips sender/no token, honours mutes, mentions cut through', () => {
  const g = 'g1';
  const m = (clerkId, extra = {}) => ({ clerkId, expoPushToken: 'ExponentPushToken[x]', ...extra });
  const members = [
    m('sender'),
    m('a'),
    m('b', { mutedGroups: ['g1'] }),
    m('c', { mutedUntilNextMeetup: ['g1'] }),
    m('d', { mutedGroups: ['g1'] }),
    { clerkId: 'e' },
  ];
  const r = pickRecipients(members, { senderClerkId: 'sender', mentions: ['d', 'e', 'sender'], groupId: g });
  assert.deepEqual(r.normal.map((u) => u.clerkId), ['a']);
  assert.deepEqual(r.mention.map((u) => u.clerkId), ['d']);
});
