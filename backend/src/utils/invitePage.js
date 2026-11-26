// The page behind https://invite.groupthatapp.com/join/<token>. The phone's OS opens the app
// instead when it's installed (Universal Links / App Links), so this page is mostly seen by people
// who don't have GroupThat yet:
//   Android  -> straight to Google Play, carrying the invite as the install referrer
//   iOS      -> one "Get GroupThat" tap that copies the invite link, then the App Store
//               (the app reads it from the clipboard on first launch)
//   desktop  -> both store buttons and the invite code (open the link on a phone to join)
//   in-app browsers (Instagram, Messenger...) block automatic jumps, so they get buttons.
import {
  APP_STORE_URL, APP_STORE_ID, PLAY_STORE_URL, ANDROID_PACKAGE, DEAD_INVITE_MESSAGES,
  INVITE_BASE_URL, inviteLinkFor, playStoreUrl, formatInviteCode,
} from "./invites.js";

const IN_APP_BROWSER_RE = /FBAN|FBAV|FB_IAB|FBIOS|Messenger|Instagram|Snapchat|musical_ly|Bytedance|Line\/|LinkedInApp|GSA\//i;
const BOT_RE = /bot|crawler|spider|facebookexternalhit|Facebot|WhatsApp|TelegramBot|Slackbot|Discordbot|LinkedInBot|Embedly|SkypeUriPreview|Google-PageRenderer|preview/i;
const DEFAULT_OG_IMAGE = `${INVITE_BASE_URL}/og-image.png`;
export const IN_APP_HINT = 'Not opening? Tap the \u2022\u2022\u2022 menu and choose \u201cOpen in Safari\u201d or \u201cOpen in Chrome\u201d.';

export const deviceInfo = (ua = '') => {
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  return {
    isIOS, isAndroid,
    inApp: IN_APP_BROWSER_RE.test(ua),
    // iPadOS Safari says "Macintosh"; the page's script corrects that using touch support.
    platform: isIOS ? 'ios' : isAndroid ? 'android' : 'desktop',
  };
};

export const isLinkPreviewBot = (ua = '') => BOT_RE.test(ua);

export const shareUrlFor = (token, meetupId) => `${inviteLinkFor(token)}${meetupId ? `?m=${encodeURIComponent(meetupId)}` : ''}`;

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
// JSON that is safe inside a <script> block.
const js = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

const STYLE = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #F9FAFB; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; color: #111827; }
  .card { background: #fff; border-radius: 24px; padding: 36px 28px; text-align: center; max-width: 380px; width: 100%; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
  .avatar { width: 96px; height: 96px; border-radius: 24px; object-fit: cover; margin: 0 auto 18px; display: block; background: #EEF2FF; }
  .logo { width: 160px; height: 80px; object-fit: contain; margin: 0 auto 18px; display: block; }
  .eyebrow { font-size: 14px; color: #6B7280; margin-bottom: 6px; }
  h1 { font-size: 22px; font-weight: 700; line-height: 1.3; margin-bottom: 6px; word-wrap: break-word; }
  .sub { font-size: 15px; color: #6B7280; line-height: 1.5; margin-bottom: 24px; }
  .btn { display: block; padding: 16px; border-radius: 14px; font-size: 16px; font-weight: 600; text-decoration: none; margin-bottom: 12px; }
  .btn-primary { background: #4A90E2; color: #fff; }
  .btn-ios { background: #000; color: #fff; }
  .btn-android { background: #01875F; color: #fff; }
  .btn-link { background: none; color: #4A90E2; font-size: 15px; font-weight: 500; padding: 8px; }
  .note { font-size: 13px; color: #6B7280; line-height: 1.45; margin: 4px 0 14px; }
  .code { font-size: 13px; color: #9CA3AF; margin-top: 10px; }
  .code b { color: #374151; letter-spacing: 2px; font-family: ui-monospace, Menlo, monospace; }
  .hint { font-size: 13px; color: #9CA3AF; line-height: 1.4; margin: 6px 0 0; }
  .section { display: none; }
  .section.show { display: block; }
`;

const head = ({ title, description, image, url, banner }) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${esc(url)}">
  <meta property="og:site_name" content="GroupThat">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:image" content="${esc(image)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${esc(image)}">
  <meta name="theme-color" content="#ffffff">
${banner ? `  <meta name="apple-itunes-app" content="app-id=${APP_STORE_ID}, app-argument=${esc(banner)}">\n` : ''}  <style>${STYLE}</style>
</head>`;

const deadPage = ({ status, inviterName }, device) => {
  const message = DEAD_INVITE_MESSAGES[status] ?? DEAD_INVITE_MESSAGES.missing;
  const who = inviterName ? esc(inviterName) : 'the person who sent it';
  return `${head({ title: 'This invite isn\u2019t active', description: message, image: DEFAULT_OG_IMAGE, url: INVITE_BASE_URL })}
<body>
  <div class="card">
    <img class="logo" src="/logo.png" alt="GroupThat">
    <h1>This invite isn\u2019t active</h1>
    <p class="sub">${esc(message)} Ask ${who} for a new link.</p>
    ${device.isAndroid ? '' : `<a class="btn btn-ios" href="${APP_STORE_URL}">Download on the App Store</a>`}
    ${device.isIOS ? '' : `<a class="btn btn-android" href="${esc(PLAY_STORE_URL)}">Get it on Google Play</a>`}
  </div>
</body>
</html>`;
};

/**
 * @param invite { token, status, code, groupName, groupImage, memberCount, inviterName, meetup: {name}|null, meetupId, referrerId }
 * @param device result of deviceInfo(userAgent)
 */
export const renderInvitePage = (invite, device) => {
  if (invite.status !== 'active') return deadPage(invite, device);

  const { token, code, groupName, groupImage, memberCount, inviterName, meetup, meetupId } = invite;
  const link = shareUrlFor(token, meetup ? meetupId : null);
  const playHref = playStoreUrl({ token, meetupId: meetup ? meetupId : null });
  const deepLink = `groupthat://join/${token}${meetup && meetupId ? `?m=${encodeURIComponent(meetupId)}` : ''}`;
  const intentUri = `intent://join/${token}${meetup && meetupId ? `?m=${encodeURIComponent(meetupId)}` : ''}#Intent;scheme=groupthat;package=${ANDROID_PACKAGE};S.browser_fallback_url=${encodeURIComponent(playHref)};end`;

  const what = meetup ? `${meetup.name} with ${groupName}` : groupName;
  const title = inviterName ? `${inviterName} invited you to join ${what} on GroupThat` : `You're invited to join ${what} on GroupThat`;
  const members = memberCount ? `${memberCount} member${memberCount === 1 ? '' : 's'}` : '';
  const description = `${members ? `${members} \u00b7 ` : ''}Plan meetups, RSVP and chat with your group on GroupThat.`;

  const avatar = groupImage ? `<img class="avatar" src="${esc(groupImage)}" alt="">` : `<img class="logo" src="/logo.png" alt="GroupThat">`;
  const codeLine = code ? `<p class="code">Or open GroupThat and enter code <b>${esc(formatInviteCode(code))}</b></p>` : '';
  const hint = device.inApp ? `<p class="hint">${esc(IN_APP_HINT)}</p>` : '';

  return `${head({ title, description, image: groupImage || DEFAULT_OG_IMAGE, url: link, banner: link })}
<body>
  <div class="card" data-initial="${device.platform}">
    ${avatar}
    <p class="eyebrow">${inviterName ? `${esc(inviterName)} invited you to join` : 'You\u2019re invited to join'}</p>
    <h1>${esc(meetup ? meetup.name : groupName)}</h1>
    <p class="sub">${meetup ? `with ${esc(groupName)}${members ? ' \u00b7 ' : ''}` : ''}${esc(members)}</p>

    <div class="section${device.platform === 'ios' ? ' show' : ''}" id="ios">
      <a id="ios-get" class="btn btn-primary" href="${APP_STORE_URL}">Get GroupThat \u2014 it\u2019s free</a>
      <p class="note">After installing, open GroupThat and tap <b>Allow Paste</b> when asked \u2014 that\u2019s how it finds your invite.</p>
      <a id="ios-open" class="btn btn-link" href="${esc(deepLink)}">I already have the app \u2014 open it</a>
    </div>

    <div class="section${device.platform === 'android' ? ' show' : ''}" id="android">
      <a id="android-get" class="btn btn-android" href="${esc(playHref)}">Get it on Google Play</a>
      <a id="android-open" class="btn btn-link" href="${esc(intentUri)}">I already have the app \u2014 open it</a>
    </div>

    <div class="section${device.platform === 'desktop' ? ' show' : ''}" id="desktop">
      <p class="note">Open this link on your phone to join, or get the app and enter the code below.</p>
      <a class="btn btn-ios" href="${APP_STORE_URL}">Download on the App Store</a>
      <a class="btn btn-android" href="${esc(PLAY_STORE_URL)}">Get it on Google Play</a>
    </div>

    ${codeLine}
    ${hint}
  </div>

  <script>
    const token = ${js(token)};
    const link = ${js(link)};
    const intentUri = ${js(intentUri)};
    const inApp = ${js(!!device.inApp)};
    let platform = ${js(device.platform)};

    // iPadOS Safari reports itself as a Mac; touch support gives it away.
    if (platform === 'desktop' && /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1) {
      platform = 'ios';
      document.querySelectorAll('.section').forEach((el) => el.classList.toggle('show', el.id === 'ios'));
    }

    const track = (type) => {
      try {
        const body = JSON.stringify({ token, type, platform });
        if (navigator.sendBeacon) navigator.sendBeacon('/api/invites/events', new Blob([body], { type: 'text/plain' }));
      } catch (e) {}
    };

    // Copy inside the tap itself; Safari only allows clipboard writes during a user gesture.
    const copyLink = () => {
      let ok = false;
      try {
        const ta = document.createElement('textarea');
        ta.value = link; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, link.length);
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (e) {}
      try { if (navigator.clipboard) navigator.clipboard.writeText(link).catch(() => {}); } catch (e) {}
      return ok;
    };

    const iosGet = document.getElementById('ios-get');
    iosGet.addEventListener('click', (ev) => {
      ev.preventDefault();
      copyLink();
      track('store_tap');
      setTimeout(() => { window.location.href = iosGet.href; }, 150);
    });
    document.getElementById('ios-open').addEventListener('click', () => track('open_app_tap'));
    document.getElementById('android-get').addEventListener('click', () => track('store_tap'));
    document.getElementById('android-open').addEventListener('click', () => track('open_app_tap'));

    // Android in a real browser: open the app if installed, otherwise go straight to Play
    // (the intent's fallback URL carries the invite as the install referrer).
    if (platform === 'android' && !inApp) {
      setTimeout(() => { window.location.href = intentUri; }, 50);
    }
  </script>
</body>
</html>`;
};
