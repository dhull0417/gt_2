import mongoose from "mongoose";

/**
 * PROJECT 7: Advanced Scheduling Schema
 * dayTimeSchema: Stores specific pairs of [Day or Date] and [Time].
 * This supports the "Individual times for each day" requirement.
 */
const dayTimeSchema = new mongoose.Schema({
  day: { type: Number, required: false },   // 0-6 for weekdays (Weekly/Biweekly/Daily)
  date: { type: Number, required: false },  // 1-31 for monthly dates
  time: { type: String, required: true },   // e.g., "06:00 PM"
  // Biweekly-only: the chosen first occurrence for this specific day, so two
  // days in the same routine can be phase-offset from each other (e.g.
  // Tuesdays starting one week, Fridays starting the next).
  startDate: { type: Date, required: false },
}, { _id: false });

/**
 * routineSchema: The building block for "Multiple Rules".
 * A group can have up to 5 of these.
 */
const routineSchema = new mongoose.Schema({
  frequency: {
    type: String,
    enum: ['daily', 'weekly', 'biweekly', 'monthly', 'ordinal'],
    required: true
  },
  dayTimes: [dayTimeSchema],
  rules: [{
    type: { type: String },
    occurrence: { type: String },
    day: { type: Number }
  }],
  ordinalConfig: {
    occurrence: { type: String, enum: ['1st', '2nd', '3rd', '4th', '5th', 'Last'] },
    day: { type: Number }
  }
}, { _id: false });

/**
 * namedScheduleSchema: one recurring series on a group (e.g. "Sunday Dinner").
 * A group can have several, each with its own routines/location/capacity/RSVP
 * window, sharing the group's members, chat, and timezone.
 * `active: false` = soft-deleted; its past/generated meetups stay intact, cancelled not deleted.
 */
const namedScheduleSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  startDate: { type: Date }, // Selected from the calendar card after routines are set
  routines: [routineSchema], // Support for "Multiple Rules" (max 5)

  defaultLocation: { type: String, trim: true, default: "" },
  defaultCapacity: { type: Number, default: 0 },

  generationLeadDays: { type: Number, min: 0, default: null },
  generationLeadTime: { type: String, default: "09:00 AM" },
  generationDeadlineDays: { type: Number, min: 0, default: null },
  generationDeadlineTime: { type: String, default: "09:00 AM" },
  nextGenerationAt: { type: Date },

  active: { type: Boolean, default: true },
}, { timestamps: true });

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  image: { type: String, default: "" },

  /**
   * A group can have zero or more named schedules; invites/chat work regardless.
   * Capped at 5 active schedules, enforced in createSchedule (Mongoose can't express it).
   */
  schedules: [namedScheduleSchema],

  timezone: { type: String, required: true }, // Global timezone, shared by every schedule

  // Fallback location/capacity for one-off meetups not tied to any named schedule.
  defaultLocation: { type: String, trim: true, default: "" },
  defaultCapacity: { type: Number, default: 0 },

  // Used by the JIT job to determine how many meetups to keep in the "pipeline"
  meetupsToDisplay: {
    type: Number,
    default: 1,
    min: 1,
    max: 50
  },

  members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  moderators: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  lastMessage: {
    text: { type: String },
    user: { name: { type: String } },
    createdAt: { type: Date },
  },
  isDM: { type: Boolean, default: false },
  dmParticipants: [{
    userId: { type: String },
    name: { type: String },
    _id: false,
  }],
}, { timestamps: true });

const Group = mongoose.model("Group", groupSchema);

export default Group;