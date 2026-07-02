import express from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import userRoutes from "./routes/user.route.js";
import groupRoutes from "./routes/group.route.js";
import meetupRoutes from "./routes/meetup.route.js";
import jobRoutes from "./routes/job.route.js";
import notificationRoutes from "./routes/notification.route.js"; 
// Project 4: Import webhook routes
import webhookRoutes from "./routes/webhook.route.js";
import uploadRoutes from "./routes/upload.route.js";

import { ENV } from "./config/env.js";
import { connectDB } from "./config/db.js";
import { arcjetMiddleware } from "./middleware/arcjet.middleware.js";
import User from "./models/user.model.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use(clerkMiddleware());
app.use(express.static(path.join(__dirname, '../public')));
// app.use(arcjetMiddleware);

app.get("/", (req, res) => res.send("Hello from server"));

app.use("/api/users", userRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/meetups", meetupRoutes);
app.use("/api/jobs", jobRoutes); 
app.use("/api/notifications", notificationRoutes); 
// Project 4: Mount the webhook route
app.use("/api/webhooks", webhookRoutes);
app.use("/api/upload", uploadRoutes);

app.post("/api/debug/log", (req, res) => {
  console.log("[DEBUG]", JSON.stringify(req.body, null, 2));
  res.status(200).json({ received: true });
});

// ── Public web routes ─────────────────────────────────────────────────────────

const APP_STORE_URL = 'https://apps.apple.com/app/groupthat/id6756112941';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.dallinhull.groupthat';

// iOS Universal Links verification file
app.get('/.well-known/apple-app-site-association', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json({
    applinks: {
      details: [{
        appIDs: ['9P29PK6A6D.com.dallinhull.groupthat'],
        components: [
          { '/': '/join/*' },
          { '/': '/download' },
        ],
      }],
    },
  });
});

// Android App Links verification file
// Replace the sha256_cert_fingerprints value with your production signing cert fingerprint.
// Find it in: Google Play Console > Setup > App signing > App signing key certificate > SHA-256
app.get('/.well-known/assetlinks.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: 'com.dallinhull.groupthat',
      sha256_cert_fingerprints: [
        '2A:DC:47:BB:9C:A3:00:CD:22:CF:18:B6:32:93:47:7A:34:F0:A6:39:8B:90:16:D3:F4:0C:5A:3A:81:7B:94:1C',
      ],
    },
  }]);
});

// Group invite landing page — shown when the app is NOT installed.
// When the app IS installed, iOS/Android intercepts the URL before this page loads.
app.get('/join/:token', (req, res) => {
  const { token } = req.params;
  const deepLink = `groupthat://join/${token}`;

  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Join a group on GroupThat</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #F9FAFB; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 32px; }
    .card { background: white; border-radius: 24px; padding: 48px 32px; text-align: center; max-width: 360px; width: 100%; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .logo { width: 100px; height: 100px; margin: 0 auto 24px; }
    .logo img { width: 100px; height: 100px; border-radius: 22px; }
    h1 { font-size: 22px; font-weight: 700; color: #111827; margin-bottom: 8px; }
    p { font-size: 15px; color: #6B7280; line-height: 1.5; margin-bottom: 32px; }
    .spinner { width: 36px; height: 36px; border: 3px solid #E5E7EB; border-top-color: #4A90E2; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 20px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .btn { display: block; padding: 16px; border-radius: 14px; font-size: 16px; font-weight: 600; text-decoration: none; margin-bottom: 12px; }
    .btn-ios { background: #000; color: white; }
    .btn-android { background: #01875F; color: white; }
    .btn-both { background: #4A90E2; color: white; }
    #download { display: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <img src="/logo.png" alt="GroupThat" />
    </div>

    <div id="opening">
      <div class="spinner"></div>
      <h1>Opening GroupThat...</h1>
      <p>You've been invited to join a group.</p>
    </div>

    <div id="download">
      <h1>Get GroupThat</h1>
      <p>Download the app to join this group. After installing, tap your original link again to be added automatically.</p>
      <a class="btn btn-ios" id="ios-btn" href="${APP_STORE_URL}">Download on the App Store</a>
      <a class="btn btn-android" id="android-btn" href="${PLAY_STORE_URL}">Get it on Google Play</a>
    </div>
  </div>

  <script>
    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/.test(ua);
    const isAndroid = /Android/.test(ua);
    const deepLink = ${JSON.stringify(deepLink)};

    // Write the deep link to clipboard so the app can pick it up on first launch
    // (deferred deep link fallback for users who don't tap the link again after install)
    try { navigator.clipboard.writeText(deepLink).catch(() => {}); } catch(e) {}

    // Attempt to open the app via a hidden iframe instead of window.location.href.
    // If no app handles the custom scheme, the iframe fails silently — Safari would
    // show "address is invalid" if we used window.location.href directly.
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = deepLink;
    document.body.appendChild(iframe);

    // If the app opens successfully the browser goes into the background,
    // firing visibilitychange/blur. Cancel the store redirect in that case.
    const timer = setTimeout(() => {
      if (isIOS) {
        window.location.href = '${APP_STORE_URL}';
      } else if (isAndroid) {
        window.location.href = '${PLAY_STORE_URL}';
      }
    }, 1500);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearTimeout(timer);
    });
    window.addEventListener('blur', () => clearTimeout(timer));
  </script>
</body>
</html>`);
});

// OG preview image — returned as SVG for link preview cards
app.get('/og-image.svg', (req, res) => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#4A90E2"/>
  <rect x="460" y="155" width="280" height="280" rx="64" fill="white" opacity="0.15"/>
  <g transform="translate(490,185) scale(9.3)">
    <path fill="white" d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
  </g>
  <text x="600" y="498" font-family="Arial,Helvetica,sans-serif" font-size="72" font-weight="700" fill="white" text-anchor="middle">GroupThat</text>
  <text x="600" y="558" font-family="Arial,Helvetica,sans-serif" font-size="30" fill="rgba(255,255,255,0.8)" text-anchor="middle">Organize your group, not your calendar</text>
</svg>`);
});

// General app download page — auto-redirects based on device OS
app.get('/download', (req, res) => {
  const ua = req.headers['user-agent'] || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return res.redirect(302, APP_STORE_URL);
  if (/Android/i.test(ua)) return res.redirect(302, PLAY_STORE_URL);

  // Desktop / unknown — show the branded landing page
  const OG_IMAGE = 'https://invite.groupthatapp.com/og-image.svg';
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
  <meta property="og:description" content="The easiest way to coordinate meetups with your group. No group chats, no endless polls.">
  <meta property="og:image" content="${OG_IMAGE}">
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
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
    </div>
    <h1>GroupThat</h1>
    <p class="tagline">The easiest way to coordinate meetups with your group — no group chats, no endless polls.</p>
    <a class="btn btn-ios" href="${APP_STORE_URL}">Download on the App Store</a>
    <a class="btn btn-android" href="${PLAY_STORE_URL}">Get it on Google Play</a>
  </div>
</body>
</html>`);
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: err.message || "Internal server error" });
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