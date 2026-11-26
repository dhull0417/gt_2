import mongoose from "mongoose";

// An invite sent to a contact who isn't on GroupThat yet. When someone signs up (or verifies)
// with that phone number or email, they get an ordinary group-invite notification.
const pendingInviteSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
  inviter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  phoneNumber: { type: String, index: true }, // E.164, as stored on users
  email: { type: String, index: true },       // lowercased
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true });

pendingInviteSchema.index({ groupId: 1, phoneNumber: 1 }, { unique: true, partialFilterExpression: { phoneNumber: { $type: 'string' } } });
pendingInviteSchema.index({ groupId: 1, email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });

const PendingInvite = mongoose.model("PendingInvite", pendingInviteSchema);

export default PendingInvite;
