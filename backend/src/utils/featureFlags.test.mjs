import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flags } from './featureFlags.js';

test('switches are off unless set to exactly "true"', () => {
  assert.equal(flags.premiumWaitlist({}), false);
  assert.equal(flags.premiumWaitlist({ PREMIUM_WAITLIST_ENFORCED: 'false' }), false);
  assert.equal(flags.premiumWaitlist({ PREMIUM_WAITLIST_ENFORCED: '1' }), false);
  assert.equal(flags.premiumWaitlist({ PREMIUM_WAITLIST_ENFORCED: 'true' }), true);
  assert.equal(flags.muteAllPushes({ MUTE_ALL_PUSHES_ENABLED: ' TRUE ' }), true);
  assert.equal(flags.chatSystemMessages({ CHAT_SYSTEM_MESSAGES_ENABLED: 'true' }), true);
  assert.equal(flags.pushChannels({}), false);
});
