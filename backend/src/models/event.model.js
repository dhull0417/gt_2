import mongoose from "mongoose";

const eventSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
  name: { type: String, required: true },
  date: { type: Date, required: true },
  time: { type: String, required: true },
  timezone: { type: String, required: true },
  location: { type: String, trim: true, default: "" },
  status: { type: String, enum: ['scheduled', 'cancelled'], default: 'scheduled' },
  isOverride: { type: Boolean, default: false },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  undecided: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  in: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  out: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  waitlist: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  capacity: { type: Number, default: 0 },
}, { timestamps: true });

const Event = mongoose.model("Event", eventSchema);

export default Event;