import asyncHandler from "express-async-handler";
import { Webhook } from "svix";
import User from "../models/user.model.js";
import { ENV } from "../config/env.js";
import { processDueEmails, verifyUnsubscribe } from "../utils/email/lifecycle.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

const page = (title, bodyHtml) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${esc(title)}</title>
<style>
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F9FAFB;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:32px}
  .card{background:#fff;border-radius:24px;padding:40px 28px;text-align:center;max-width:380px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  h1{font-size:22px;color:#111827;margin:0 0 8px} p{font-size:15px;color:#6B7280;line-height:1.5;margin:0 0 24px}
  .btn{display:block;width:100%;box-sizing:border-box;padding:16px;border:0;border-radius:14px;font-size:16px;font-weight:600;text-decoration:none;color:#fff;background:#4A90E2;margin-bottom:12px;cursor:pointer}
  .ios{background:#000}.android{background:#01875F}
</style></head><body><div class="card">${bodyHtml}</div></body></html>`;

/**
 * @desc    Run the lifecycle email job (called by cron-job.org every ~5 minutes).
 *          Add ?dryRun=1 to see who WOULD be emailed without sending or recording anything.
 * @route   POST /api/jobs/send-lifecycle-emails
 */
export const runLifecycleJob = asyncHandler(async (req, res) => {
  const dryRun = req.query.dryRun === "1" || req.body?.dryRun === true;
  const result = await processDueEmails({ dryRun });
  res.status(200).json(result);
});

// ---------- unsubscribe ----------

const unsubTarget = (req) => ({ id: String(req.query.u || ""), sig: String(req.query.t || "") });

/** GET shows a confirm button (not auto-unsubscribe: mail scanners prefetch links). */
export const unsubscribePage = (req, res) => {
  const { id, sig } = unsubTarget(req);
  if (!verifyUnsubscribe(id, sig)) {
    return res.status(400).send(page("Invalid link", `<h1>This link isn't valid</h1><p>Open the app to manage your notifications.</p>`));
  }
  res.send(page("Unsubscribe", `<h1>Unsubscribe from tips?</h1>
<p>You'll stop getting tips like these. We'll still email you about your meetups.</p>
<form method="POST" action="/api/email/unsubscribe?u=${esc(id)}&t=${esc(sig)}"><button class="btn" type="submit">Unsubscribe</button></form>`));
};

/** POST handles both the confirm button and mail apps' one-click unsubscribe (RFC 8058). */
export const unsubscribeAction = asyncHandler(async (req, res) => {
  const { id, sig } = unsubTarget(req);
  if (!verifyUnsubscribe(id, sig)) return res.status(400).send(page("Invalid link", `<h1>This link isn't valid</h1>`));
  await User.updateOne(
    { _id: id },
    { $set: { "emailPrefs.marketingOptOut": true, "emailPrefs.marketingOptOutAt": new Date() } }
  );
  res.send(page("Unsubscribed", `<h1>You're unsubscribed</h1><p>No more tips like these. We'll still email you about your meetups.</p>`));
});

// ---------- Resend webhook (bounces and spam complaints) ----------

/**
 * @desc    Stop emailing addresses that bounce permanently or mark us as spam.
 * @route   POST /api/email/webhook/resend   (mounted with express.raw in server.js)
 */
export const resendWebhook = asyncHandler(async (req, res) => {
  if (!ENV.RESEND_WEBHOOK_SECRET) return res.status(500).json({ error: "Webhook not configured." });

  let event;
  try {
    event = new Webhook(ENV.RESEND_WEBHOOK_SECRET).verify(req.body.toString("utf8"), {
      "svix-id": req.headers["svix-id"],
      "svix-timestamp": req.headers["svix-timestamp"],
      "svix-signature": req.headers["svix-signature"],
    });
  } catch {
    return res.status(400).json({ error: "Invalid signature." });
  }

  const recipients = (event?.data?.to || []).map((a) => String(a).toLowerCase());
  const permanentBounce = event.type === "email.bounced" && String(event.data?.bounce?.type || "").toLowerCase() === "permanent";
  const complaint = event.type === "email.complained";

  if ((permanentBounce || complaint) && recipients.length) {
    const set = { "emailPrefs.suppressed": true };
    if (complaint) { set["emailPrefs.marketingOptOut"] = true; set["emailPrefs.marketingOptOutAt"] = new Date(); }
    await User.updateMany({ email: { $in: recipients.map((r) => new RegExp(`^${r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")) } }, { $set: set });
  }
  res.status(200).json({ received: true });
});

// ---------- email button landing: /go/:dest[/:id] ----------

// Same store links as the invite landing page in server.js.
const APP_STORE_URL = "https://apps.apple.com/app/groupthat/id6756112941";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.dallinhull.groupthat";

const DEST_PATHS = {
  meetups: "",
  open: "",
  groups: "groups",
  "create-group": "create-group",
  premium: "profile", // TODO: point at the paywall screen if/when it has its own route
};

/** Opens the app at a screen, or sends people to the store if it isn't installed. */
export const goPage = (req, res) => {
  const { dest, id } = req.params;
  let path = DEST_PATHS[dest];
  if (dest === "group" && /^[a-f0-9]{24}$/i.test(id || "")) path = `group-details/${id}`;
  if (path === undefined) return res.redirect(302, "https://groupthatapp.com");

  const deepLink = `groupthat://${path}`;
  const intentUri = `intent://${path}#Intent;scheme=groupthat;package=com.dallinhull.groupthat;S.browser_fallback_url=${encodeURIComponent(PLAY_STORE_URL)};end`;

  res.setHeader("Content-Type", "text/html");
  res.send(page("Opening GroupThat", `
<div id="opening"><h1>Opening GroupThat...</h1><p>One moment.</p></div>
<div id="download" style="display:none"><h1>Get GroupThat</h1><p>Download the app to continue.</p>
<a class="btn ios" id="ios-btn" href="${APP_STORE_URL}">Download on the App Store</a>
<a class="btn android" id="android-btn" href="${PLAY_STORE_URL}">Get it on Google Play</a></div>
<script>
  var ua = navigator.userAgent, isAndroid = /Android/.test(ua);
  var deepLink = ${JSON.stringify(deepLink)}, intentUri = ${JSON.stringify(intentUri)};
  if (isAndroid) {
    setTimeout(function(){ window.location.href = intentUri; }, 25);
  } else {
    document.getElementById('android-btn').style.display = 'none';
    var show = setTimeout(function(){ document.getElementById('opening').style.display='none'; document.getElementById('download').style.display='block'; }, 2000);
    document.addEventListener('visibilitychange', function(){ if (document.hidden) clearTimeout(show); });
    window.addEventListener('blur', function(){ clearTimeout(show); });
    setTimeout(function(){ window.location.href = deepLink; }, 25);
  }
</script>`));
};
