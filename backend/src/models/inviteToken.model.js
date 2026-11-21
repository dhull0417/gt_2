import mongoose from "mongoose";

// One active invite link per group (the newest one without revokedAt). Links no longer
// expire by default (expiresAt: null); older tokens that still have an expiresAt are made
// permanent the next time a member shares them. The TTL index only removes documents whose
// expiresAt is a date, so permanent tokens are kept.
const inviteTokenSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true, index: true },
  // 8-character code people can type into the app (older ones are 6) (see utils/invites.js).
  code: { type: String, unique: true, sparse: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  expiresAt: { type: Date, default: null, index: { expires: 0 } },
  revokedAt: { type: Date, default: null },
  // null = unlimited. `uses` counts people who actually joined (or asked to) through it.
  maxUses: { type: Number, min: 1, default: null },
  uses: { type: Number, default: 0 },
}, { timestamps: true });

const InviteToken = mongoose.model("InviteToken", inviteTokenSchema);

export default InviteToken;
