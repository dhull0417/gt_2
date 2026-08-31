import mongoose from "mongoose";
import User from "../models/user.model.js";

const meetupSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
  // schedule this was generated from (Group.schedules[i]._id); null for one-off meetups
  schedule: { type: mongoose.Schema.Types.ObjectId, default: null },
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
  // generating routine's frequency (null for one-off); drives RSVP-reminder
  // stages and the display cap.
  frequency: { type: String, enum: ['daily', 'weekly', 'biweekly', 'monthly', 'ordinal'], default: null },
  rsvpOpenDate: { type: Date },
  rsvpCloseDate: { type: Date },
  rsvpNotified: { type: Boolean, default: false },
  // startsAt value the 30-min reminder was last sent for; comparing to the
  // current startsAt (not a boolean) auto-handles reschedules.
  reminderNotifiedFor: { type: Date, default: null },
  // stage keys (e.g. '4d', '24h') from RSVP_REMINDER_STAGES already sent.
  // reset on reschedule in updateMeetup to re-arm off the new startsAt.
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