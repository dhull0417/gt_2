import mongoose from "mongoose";

// A frozen copy of a finished meetup's RSVPs. Meetups are deleted 10 days after
// they expire, so this keeps the history that stats and exports are built from.
const attendanceRecordSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true, index: true },
  meetupId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  schedule: { type: mongoose.Schema.Types.ObjectId, default: null },
  name: { type: String, required: true },
  startsAt: { type: Date, required: true },
  members: [{ type: mongoose.Schema.Types.ObjectId }],
  in: [{ type: mongoose.Schema.Types.ObjectId }],
  out: [{ type: mongoose.Schema.Types.ObjectId }],
  // Still on the waitlist when it ended: they answered, but didn't get a spot (2026-11-10).
  waitlist: [{ type: mongoose.Schema.Types.ObjectId }],
  capacity: { type: Number, default: 0 },
  guests: { type: Number, default: 0 },
  // Stats awards (2026-11-10). No defaults, so records archived before then read as missing.
  rsvpLog: { type: [{ user: mongoose.Schema.Types.ObjectId, status: String, at: Date, _id: false }], default: undefined },
  rsvpOpenDate: { type: Date, default: null },
  rsvpCloseDate: { type: Date, default: null },
  tierOpens: { type: [{ user: mongoose.Schema.Types.ObjectId, opensAt: Date, _id: false }], default: undefined },
  guestsBy: { type: [{ user: mongoose.Schema.Types.ObjectId, count: Number, _id: false }], default: undefined },
  itemsBy: { type: [{ user: mongoose.Schema.Types.ObjectId, count: Number, _id: false }], default: undefined },
  seatsBy: { type: [{ user: mongoose.Schema.Types.ObjectId, seats: Number, _id: false }], default: undefined },
}, { timestamps: true });

export default mongoose.model("AttendanceRecord", attendanceRecordSchema);
