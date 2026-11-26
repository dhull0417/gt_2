import mongoose from "mongoose";

// Invite funnel: landing page views, store taps, joins. Kept 180 days.
export const INVITE_EVENT_TYPES = ['view', 'store_tap', 'open_app_tap', 'join', 'join_requested'];
export const INVITE_SOURCES = ['link', 'install_referrer', 'clipboard', 'code', 'qr', 'contact', 'unknown'];

const inviteEventSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true, index: true },
  token: { type: String },
  type: { type: String, enum: INVITE_EVENT_TYPES, required: true },
  platform: { type: String, enum: ['ios', 'android', 'desktop', 'unknown'], default: 'unknown' },
  source: { type: String, enum: INVITE_SOURCES, default: 'unknown' },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  createdAt: { type: Date, default: Date.now, index: { expires: 60 * 60 * 24 * 180 } },
});

const InviteEvent = mongoose.model("InviteEvent", inviteEventSchema);

export default InviteEvent;
