import test from 'node:test';
import assert from 'node:assert/strict';
import { renderInvitePage, deviceInfo, isLinkPreviewBot, shareUrlFor } from './invitePage.js';

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36',
  insta: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
};
const TOKEN = 'a'.repeat(32);
const base = (over = {}) => ({
  token: TOKEN, status: 'active', code: 'K7P2QX', groupName: 'Hikers', groupImage: 'https://res.cloudinary.com/x/h.jpg',
  memberCount: 12, inviterName: 'Ana', meetup: null, meetupId: null, ...over,
});

test('deviceInfo spots iOS, Android, in-app browsers and desktop', () => {
  assert.equal(deviceInfo(UA.iphone).platform, 'ios');
  assert.equal(deviceInfo(UA.android).platform, 'android');
  assert.equal(deviceInfo(UA.insta).inApp, true);
  assert.equal(deviceInfo(UA.desktop).platform, 'desktop');
});

test('link preview bots are recognised (so they are not counted as views)', () => {
  assert.equal(isLinkPreviewBot('facebookexternalhit/1.1 Facebot Twitterbot/1.0'), true);
  assert.equal(isLinkPreviewBot('WhatsApp/2.23'), true);
  assert.equal(isLinkPreviewBot(UA.iphone), false);
});

test('shareUrlFor keeps the meetup in the link that gets copied and handed to the stores', () => {
  assert.equal(shareUrlFor(TOKEN), `https://invite.groupthatapp.com/join/${TOKEN}`);
  assert.equal(shareUrlFor(TOKEN, '64b000000000000000000001'), `https://invite.groupthatapp.com/join/${TOKEN}?m=64b000000000000000000001`);
});

test('personalized preview, Smart App Banner and invite code', () => {
  const html = renderInvitePage(base(), deviceInfo(UA.iphone));
  assert.match(html, /<meta property="og:title" content="Ana invited you to join Hikers on GroupThat">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/res\.cloudinary\.com\/x\/h\.jpg">/);
  assert.match(html, /<meta name="apple-itunes-app" content="app-id=6756112941, app-argument=https:\/\/invite\.groupthatapp\.com\/join\/a{32}">/);
  assert.match(html, /K7P2QX/);
  assert.match(html, /12 members/);
});

test('iOS: one button that copies the invite and opens the App Store; no automatic custom-scheme jump', () => {
  const html = renderInvitePage(base(), deviceInfo(UA.iphone));
  assert.match(html, /id="ios-get" class="btn btn-primary" href="https:\/\/apps\.apple\.com\/app\/groupthat\/id6756112941"/);
  assert.match(html, /Allow Paste/);
  assert.doesNotMatch(html, /location\.href = deepLink/);
  assert.match(html, /data-initial="ios"/);
});

test('Android: Play link and intent fallback carry the invite as the install referrer', () => {
  const html = renderInvitePage(base({ meetupId: 'm1', meetup: { name: 'Sat Hike' } }), deviceInfo(UA.android));
  const ref = encodeURIComponent(`gt_invite=${TOKEN}&gt_m=m1`);
  assert.ok(html.includes(`details?id=com.dallinhull.groupthat&amp;referrer=${ref}`), 'play button has referrer');
  assert.ok(html.includes(encodeURIComponent(`https://play.google.com/store/apps/details?id=com.dallinhull.groupthat&referrer=${ref}`)), 'intent fallback has referrer');
  assert.match(html, /data-initial="android"/);
  assert.match(html, /Sat Hike/);
});

test('in-app browsers get buttons and the "open in Safari/Chrome" hint, no auto redirect', () => {
  const html = renderInvitePage(base(), deviceInfo(UA.insta));
  assert.match(html, /Open in Safari/);
  assert.match(html, /const inApp = true/);
});

test('desktop shows both stores and the invite code, and no QR code', () => {
  const html = renderInvitePage(base(), deviceInfo(UA.desktop));
  assert.match(html, /data-initial="desktop"/);
  assert.match(html, /Open this link on your phone/);
  assert.match(html, /K7P2QX/);
  assert.doesNotMatch(html, /qr/i);
});

test('names from the database are escaped (no HTML/script injection)', () => {
  const html = renderInvitePage(base({ groupName: '</title><script>alert(1)</script>', inviterName: '"><img src=x>', meetup: { name: '<b>x</b>' }, meetupId: 'm1' }), deviceInfo(UA.iphone));
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(html, /"><img src=x>/);
  assert.doesNotMatch(html, /<b>x<\/b>/);
  assert.match(html, /&lt;\/title&gt;&lt;script&gt;/);
});

test('dead links explain why and ask for a new one', () => {
  const html = renderInvitePage({ token: TOKEN, status: 'maxed', inviterName: 'Ana' }, deviceInfo(UA.iphone));
  assert.match(html, /This invite link has reached its limit\./);
  assert.match(html, /Ask Ana for a new link/);
  assert.doesNotMatch(html, /apple-itunes-app/);
  const unknown = renderInvitePage({ token: TOKEN, status: 'missing' }, deviceInfo(UA.android));
  assert.match(unknown, /Ask the person who sent it for a new link/);
});
