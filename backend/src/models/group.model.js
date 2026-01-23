import mongoose from "mongoose";

const scheduleSchema = new mongoose.Schema({
  frequency: {
    type: String,
    enum: ['daily', 'weekly', 'biweekly', 'monthly', 'custom', 'once'], 
    default: 'weekly'
  },
  days: [{ type: Number }],
  date: { type: String }, 
  rules: [{
    type: { 
      type: String, 
      enum: ['byDay', 'byDate'] 
    },
    occurrence: { type: String, enum: ['1st', '2nd', '3rd', '4th', '5th', 'Last'] },
    day: Number, 
    dates: [Number] 
  }]
}, { _id: false });

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  time: { type: String },
  defaultLocation: { type: String, trim: true, default: "" },
  schedule: { type: scheduleSchema, required: false },
  timezone: { type: String },
  defaultCapacity: { 
    type: Number, 
    default: 0 
  },
  /**
   * PROJECT 6: Just-in-Time Generation Refinement
   * generationLeadDays: How many days BEFORE the event to create it.
   * generationLeadTime: The specific time of day on that lead day to trigger.
   * Example: days=3, time="12:00 PM" -> Event created 3 days before at Noon.
   */
  generationLeadDays: {
    type: Number,
    default: 2,
    min: 0 // 0 would mean same day
  },
  generationLeadTime: {
    type: String,
    default: "09:00 AM"
  },
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