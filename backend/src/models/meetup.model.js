import mongoose from "mongoose";
import User from "../models/user.model.js";

const meetupSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
  name: { type: String, required: true },
  date: { type: Date, required: true },
  time: { type: String, required: true },
  timezone: { type: String, required: true },
  location: { type: String, trim: true, default: "" },
  status: { type: String, enum: ['scheduled', 'cancelled', 'expired'], default: 'scheduled' },
  isOverride: { type: Boolean, default: false },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  undecided: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  in: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  out: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  waitlist: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  capacity: { type: Number, default: 0 },
  // The routine frequency this instance was generated from (null for one-off
  // meetups). Drives both the staged RSVP-reminder schedule and the tab's
  // per-frequency display cap.
  frequency: { type: String, enum: ['daily', 'weekly', 'biweekly', 'monthly', 'ordinal'], default: null },
  rsvpOpenDate: { type: Date },
  rsvpCloseDate: { type: Date },
  rsvpNotified: { type: Boolean, default: false },
  // Set to the `startsAt` value the 30-min reminder was last sent for. Comparing
  // against the current `startsAt` (rather than a boolean) makes the reminder
  // naturally reactive to reschedules — no explicit reset needed on update.
  reminderNotifiedFor: { type: Date, default: null },
  // Stage keys (e.g. '4d', '24h') from RSVP_REMINDER_STAGES already sent for
  // this meetup. Reset on reschedule in updateMeetup so a moved meetup
  // re-arms reminders relative to its new startsAt.
  rsvpReminderStagesSent: { type: [String], default: [] },
  startsAt: { type: Date },
  guests: [{
    userId: { type: String },  // clerkId of the member who brought guests
    count: { type: Number, default: 0, min: 0 },
    _id: false,
  }],
}, { timestamps: true });

const Meetup = mongoose.model("Meetup", meetupSchema);

export default Meetup;