import express from "express";
import { findInvite, recordInviteEvent } from "../controllers/invite.controller.js";
import { inviteStatus } from "../utils/invites.js";
import { rateLimit } from "../utils/rateLimit.js";

const router = express.Router();

// Taps on the invite landing page (no sign-in: the person may not have the app yet).
export const PUBLIC_EVENT_TYPES = ['store_tap', 'open_app_tap'];
const PLATFORMS = ['ios', 'android', 'desktop', 'unknown'];

export const postInviteEvent = async (req, res) => {
  const { token, type, platform } = req.body ?? {};
  if (!PUBLIC_EVENT_TYPES.includes(type)) return res.status(400).json({ error: "Unknown event." });
  const invite = await findInvite(token);
  if (inviteStatus(invite) !== 'active') return res.status(204).end();
  await recordInviteEvent({
    groupId: invite.groupId, token: invite.token, type,
    platform: PLATFORMS.includes(platform) ? platform : 'unknown', source: 'link',
  });
  res.status(204).end();
};

router.post("/events", rateLimit({ name: "invite-events", limit: 30 }), express.text({ type: 'text/plain' }), (req, res, next) => {
  // navigator.sendBeacon sends text/plain; accept JSON in either form.
  if (typeof req.body === 'string') {
    try { req.body = JSON.parse(req.body); } catch { req.body = {}; }
  }
  Promise.resolve(postInviteEvent(req, res)).catch(next);
});

export default router;
