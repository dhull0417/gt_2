import express from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import Jimp from "jimp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logoBuffer = fs.readFileSync(path.join(__dirname, '../public/logo.png'));

let ogImageBuffer = null;
async function buildOgImage() {
  if (ogImageBuffer) return ogImageBuffer;
  const logo = await Jimp.read(logoBuffer);
  const targetH = Math.round(630 * 0.55);
  const scale = targetH / logo.bitmap.height;
  logo.resize(Math.round(logo.bitmap.width * scale), targetH);
  const canvas = new Jimp(1200, 630, 0xffffffff);
  canvas.composite(logo, Math.round((1200 - logo.bitmap.width) / 2), Math.round((630 - logo.bitmap.height) / 2));
  ogImageBuffer = await canvas.getBufferAsync(Jimp.MIME_PNG);
  return ogImageBuffer;
}

import userRoutes from "./routes/user.route.js";
import groupRoutes from "./routes/group.route.js";
import meetupRoutes from "./routes/meetup.route.js";
import pollRoutes from "./routes/poll.route.js";
import healthRoutes from "./routes/health.route.js";
import jobRoutes from "./routes/job.route.js";
import notificationRoutes from "./routes/notification.route.js";
import placesRoutes from "./routes/places.route.js";
import chatRoutes from "./routes/chat.route.js";
import linkPreviewRoutes from "./routes/linkPreview.route.js";
import tournamentRoutes from "./routes/tournament.route.js";

import { ENV } from "./config/env.js";
import { connectDB } from "./config/db.js";
import { clientInfo } from "./middleware/clientInfo.middleware.js";
import revenuecatRoutes from "./routes/revenuecat.route.js";
import emailRoutes from "./routes/email.route.js";
import { resendWebhook, goPage } from "./controllers/email.controller.js";
import User from "./models/user.model.js";
import Group from "./models/group.model.js";
import Meetup from "./models/meetup.model.js";
import QRCode from "qrcode";
import inviteRoutes from "./routes/invite.route.js";
import { findInvite, recordInviteEvent } from "./controllers/invite.controller.js";
import { inviteStatus, TOKEN_RE as INVITE_TOKEN_RE, APP_STORE_URL as INVITE_APP_STORE_URL, PLAY_STORE_URL as INVITE_PLAY_STORE_URL } from "./utils/invites.js";
import { renderInvitePage, deviceInfo as inviteDeviceInfo, isLinkPreviewBot, IN_APP_HINT } from "./utils/invitePage.js";
import { rateLimit } from "./utils/rateLimit.js";

const app = express();

app.use(cors());
// Resend webhook needs the raw body for signature verification, so it is mounted before express.json().
app.post("/api/email/webhook/resend", express.raw({ type: "*/*" }), resendWebhook);
app.use(express.json());
app.use(clerkMiddleware());
// Tags each request with the calling app version (older store builds send none; see the middleware).
app.use(clientInfo);
app.get('/logo.png', (req, res) => {
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(logoBuffer);
});

app.get('/og-image.png', async (req, res) => {
  const buf = await buildOgImage();
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(buf);
});

app.get("/", (req, res) => res.send("Hello from server"));

app.use("/api/health", healthRoutes);
app.use("/api/users", userRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/meetups", meetupRoutes);
app.use("/api/polls", pollRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/places", placesRoutes);
app.use("/api/revenuecat", revenuecatRoutes);
app.use("/api/email", emailRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/link-preview", linkPreviewRoutes);
app.use("/api/tournaments", tournamentRoutes);
app.use("/api/invites", inviteRoutes);
app.get("/go/:dest", goPage);
app.get("/go/:dest/:id", goPage);

// --- Public web routes ---

const APP_STORE_URL = INVITE_APP_STORE_URL;
const PLAY_STORE_URL = INVITE_PLAY_STORE_URL;

// /download (the old "step 1" link in invite texts) still uses these.
const deviceInfo = (ua = '') => {
  const d = inviteDeviceInfo(ua);
  return { ...d, iosStoreHref: APP_STORE_URL, androidStoreHref: PLAY_STORE_URL };
};

// iOS Universal Links verification file
app.get('/.well-known/apple-app-site-association', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json({
    applinks: {
      details: [{
        appIDs: ['9P29PK6A6D.com.dallinhull.groupthat'],
        components: [
          { '/': '/join/*' },
          { '/': '/go/*' }, // email buttons (lifecycle emails, calendar events)
        ],
      }],
    },
  });
});

// Android App Links verification file
// sha256_cert_fingerprints: Play Console > Setup > App signing > App signing key certificate > SHA-256.
// ANDROID_CERT_FINGERPRINTS (comma-separated) adds more, e.g. the upload key used by EAS preview builds,
// so links open the app on test devices too.
const PLAY_SIGNING_FINGERPRINT = '2A:DC:47:BB:9C:A3:00:CD:22:CF:18:B6:32:93:47:7A:34:F0:A6:39:8B:90:16:D3:F4:0C:5A:3A:81:7B:94:1C';
export const androidFingerprints = (extra = process.env.ANDROID_CERT_FINGERPRINTS) => [
  ...new Set([PLAY_SIGNING_FINGERPRINT, ...String(extra || '').split(',').map((f) => f.trim().toUpperCase()).filter((f) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f))]),
];
app.get('/.well-known/assetlinks.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: 'com.dallinhull.groupthat',
      sha256_cert_fingerprints: androidFingerprints(),
    },
  }]);
});

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

// Invite landing page; shown only when the app isn't installed (the OS opens the app otherwise).
app.get('/join/:token', rateLimit({ name: 'invite-page', limit: 60 }), async (req, res, next) => {
  try {
    const { token } = req.params;
    // Tokens are url-safe random strings; reject anything else so it can never be reflected into the page.
    if (!INVITE_TOKEN_RE.test(token)) return res.status(404).send('Invite link not found.');
    const ua = String(req.headers['user-agent'] || '');
    const device = inviteDeviceInfo(ua);
    const meetupId = OBJECT_ID_RE.test(String(req.query.m || '')) ? String(req.query.m) : null;
    const referrerId = OBJECT_ID_RE.test(String(req.query.r || '')) ? String(req.query.r) : null;

    const invite = await findInvite(token);
    const status = inviteStatus(invite);
    const group = invite ? await Group.findById(invite.groupId).select('name image members').lean() : null;
    const inviter = group && referrerId && (group.members || []).some((m) => String(m) === referrerId)
      ? await User.findById(referrerId).select('firstName').lean()
      : null;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (status !== 'active' || !group) {
      return res.status(status === 'missing' || !group ? 404 : 410).send(renderInvitePage({ token, status: group ? status : 'missing', inviterName: inviter?.firstName }, device));
    }

    const meetup = meetupId
      ? await Meetup.findOne({ _id: meetupId, group: group._id, status: { $ne: 'cancelled' } }).select('name').lean()
      : null;

    if (!isLinkPreviewBot(ua)) {
      const source = req.query.s === 'qr' ? 'qr' : 'link';
      await recordInviteEvent({ groupId: group._id, token: invite.token, type: 'view', platform: device.platform, source });
    }

    res.send(renderInvitePage({
      token: invite.token, status, code: invite.code, groupName: group.name, groupImage: group.image || null,
      memberCount: (group.members || []).length, inviterName: inviter?.firstName || null,
      meetup, meetupId: meetup ? meetupId : null, referrerId,
    }, device));
  } catch (err) { next(err); }
});

// QR code for an invite link (shown on the desktop page and in the app's invite screen).
app.get('/qr/:file', rateLimit({ name: 'invite-qr', limit: 60 }), async (req, res, next) => {
  try {
    const m = /^([A-Za-z0-9_-]{1,128})\.png$/.exec(req.params.file);
    if (!m) return res.status(404).send('Not found');
    const referrerId = OBJECT_ID_RE.test(String(req.query.r || '')) ? String(req.query.r) : null;
    const target = `https://invite.groupthatapp.com/join/${m[1]}?s=qr${referrerId ? `&r=${referrerId}` : ''}`;
    const png = await QRCode.toBuffer(target, { type: 'png', width: 600, margin: 2, errorCorrectionLevel: 'M' });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(png);
  } catch (err) { next(err); }
});

// OG preview image — returned as SVG for link preview cards
app.get('/og-image.svg', (req, res) => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="white"/>
  <rect x="460" y="115" width="280" height="280" rx="64" fill="#4A90E2" opacity="0.12"/>
  <g transform="translate(490,145) scale(9.3)">
    <path fill="#4A90E2" d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
  </g>
  <text x="600" y="468" font-family="Arial,Helvetica,sans-serif" font-size="72" font-weight="700" fill="#111827" text-anchor="middle">GroupThat</text>
  <text x="600" y="530" font-family="Arial,Helvetica,sans-serif" font-size="30" fill="#6B7280" text-anchor="middle">Organize your group, not your calendar</text>
</svg>`);
});

// General app download page — auto-redirects based on device OS
app.get('/download', (req, res) => {
  const { isIOS, isAndroid, inApp, iosStoreHref, androidStoreHref } = deviceInfo(req.headers['user-agent']);
  // Real browsers: send straight to the store. In-app browsers block this redirect (white screen),
  // so they fall through to the page below, where a tap on a button gets through.
  if (!inApp && isIOS) return res.redirect(302, APP_STORE_URL);
  if (!inApp && isAndroid) return res.redirect(302, PLAY_STORE_URL);

  // Desktop / unknown / in-app browser — show the branded landing page
  const OG_IMAGE = 'https://invite.groupthatapp.com/og-image.png';
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GroupThat — Organize your group, not your calendar</title>
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://invite.groupthatapp.com/download">
  <meta property="og:site_name" content="GroupThat">
  <meta property="og:title" content="GroupThat — Organize your group, not your calendar">
  <meta property="og:description" content="The easiest way to coordinate meetups with your group. Plan meetups, chat and RSVP in one place.">
  <meta property="og:image" content="${OG_IMAGE}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:type" content="image/png">
  <meta name="theme-color" content="#ffffff">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="GroupThat">
  <meta name="twitter:description" content="The easiest way to coordinate meetups with your group.">
  <meta name="twitter:image" content="${OG_IMAGE}">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #F9FAFB; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 32px; }
    .card { background: white; border-radius: 24px; padding: 48px 32px; text-align: center; max-width: 360px; width: 100%; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .logo { width: 80px; height: 80px; background: #4A90E2; border-radius: 20px; margin: 0 auto 24px; display: flex; align-items: center; justify-content: center; }
    .logo svg { width: 44px; height: 44px; fill: white; }
    h1 { font-size: 24px; font-weight: 700; color: #111827; margin-bottom: 8px; }
    .tagline { font-size: 15px; color: #6B7280; line-height: 1.5; margin-bottom: 32px; }
    .btn { display: block; padding: 16px; border-radius: 14px; font-size: 16px; font-weight: 600; text-decoration: none; margin-bottom: 12px; }
    .btn-ios { background: #000; color: white; }
    .btn-android { background: #01875F; color: white; }
    .btn-open { background: #F3F4F6; color: #111827; }
    .hint { font-size: 13px; color: #9CA3AF; line-height: 1.4; margin: 8px 0 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
    </div>
    <h1>GroupThat</h1>
    <p class="tagline">The easiest way to coordinate meetups with your group — plan meetups, chat and RSVP in one place.</p>
    ${isAndroid ? '' : `<a class="btn btn-ios" href="${iosStoreHref}">Download on the App Store</a>`}
    ${isIOS ? '' : `<a class="btn btn-android" href="${androidStoreHref}">Get it on Google Play</a>`}
    ${inApp ? `<p class="hint">${IN_APP_HINT}</p>` : ''}
  </div>
</body>
</html>`);
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  // Don't leak internal error text (DB / library messages) in production.
  const message = ENV.NODE_ENV === "production" ? "Internal server error" : (err.message || "Internal server error");
  const clientError = err.status && err.status >= 400 && err.status < 500;
  res.status(clientError ? err.status : 500).json({ error: clientError ? (err.message || "Bad request") : message });
});

const startServer = async () => {
  try {
    await connectDB();
    if (ENV.NODE_ENV !== "production") {
      app.listen(ENV.PORT, () => console.log("Server is up and running on PORT:", ENV.PORT));
    }
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
};

startServer();

export default app;