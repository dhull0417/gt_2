import mongoose from "mongoose";

const inviteTokenSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true, index: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});

const InviteToken = mongoose.model("InviteToken", inviteTokenSchema);

export default InviteToken;
