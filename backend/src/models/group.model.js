import mongoose from "mongoose";

const scheduleSchema = new mongoose.Schema({
  frequency: {
    type: String,
    enum: ['daily', 'weekly', 'biweekly', 'monthly', 'custom', 'once'], 
    default: 'weekly'
  },
  days: [{ type: Number }],
  /**
   * Project 4 Fix: Added 'date' field.
   * This is required for 'once' frequency (one-off events) so the date 
   * string persists after being saved to the database.
   */
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
  /**
   * Default Location: The location that all newly generated events 
   * will inherit unless overridden.
   */
  defaultLocation: { type: String, trim: true, default: "" },
  schedule: { type: scheduleSchema, required: false },
  timezone: { type: String },
  defaultCapacity: { 
    type: Number, 
    default: 0     // 0 means unlimited
  },
  eventsToDisplay: { 
    type: Number, 
    default: 1, 
    min: 1, 
    max: 14 
  },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  
  /**
   * moderators: Array of user IDs who have management permissions.
   * Moderators can invite members, remove standard members, and update schedules.
   */
  moderators: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  
}, { timestamps: true });

const Group = mongoose.model("Group", groupSchema);

export default Group;