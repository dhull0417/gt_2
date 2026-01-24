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
  // Stores the day/date and time pairs. 
  // If user selects "Same time for all", this array will have entries with identical times.
  // If user selects "No", each entry will have its specific time.
  dayTimes: [dayTimeSchema],
  
  // Configuration for the 'Ordinal' frequency
  ordinalConfig: {
    occurrence: { type: String, enum: ['1st', '2nd', '3rd', '4th', '5th', 'Last'] },
    day: { type: Number } // 0-6
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
  
  generationLeadDays: { type: Number, default: 2, min: 0 },
  generationLeadTime: { type: String, default: "09:00 AM" },
  
  // Used by the JIT job to determine how many events to keep in the "pipeline"
  eventsToDisplay: { 
    type: Number, 
    default: 1, 
    min: 1, 
    max: 14 
  },

  members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  moderators: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
}, { timestamps: true });

const Group = mongoose.model("Group", groupSchema);

export default Group;