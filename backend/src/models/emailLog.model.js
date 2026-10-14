import mongoose from "mongoose";

// One row per lifecycle email a user was sent (or was claimed for sending).
// The unique (user, key) index is what makes each email exactly-once: the job
// inserts the row first and only sends if the insert wins.
// Indexes are created by migrate-mongo (autoIndex is off in production) — see
// migrations/20261003120000-lifecycle-email-indexes.cjs.
const emailLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  key: { type: String, required: true }, // U1..U4, O1..O3
  status: { type: String, enum: ["pending", "sent", "failed"], default: "pending" },
  providerId: { type: String, default: null }, // Resend email id
  error: { type: String, default: null },
  sentAt: { type: Date, default: null },
}, { timestamps: true });

export default mongoose.model("EmailLog", emailLogSchema);
