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

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  
  /**
   * schedule is now optional. 
   * If the user selects "No" to "Set Schedule Now?", this object is not created.
   * Invites and Chat will still function as the Group document itself exists.
   */
  schedule: {
    startDate: { type: Date }, // Selected from the calendar card after routines are set
    routines: [routineSchema], // Support for "Multiple Rules" (max 5)
  },

  timezone: { type: String, required: true }, // Global timezone as requested
  
  defaultLocation: { type: String, trim: true, default: "" },
  defaultCapacity: { type: Number, default: 0 },
  
  visibilityLeadDays: { type: Number, min: 0 }, 
  rsvpLeadDays: { type: Number, min: 0 }, 
  rsvpLeadTime: { type: String, default: "09:00 AM" },
  
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
}, { timestamps: true });

const Group = mongoose.model("Group", groupSchema);

export default Group;