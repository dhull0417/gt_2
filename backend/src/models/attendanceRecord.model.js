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
  capacity: { type: Number, default: 0 },
  guests: { type: Number, default: 0 },
}, { timestamps: true });

export default mongoose.model("AttendanceRecord", attendanceRecordSchema);
