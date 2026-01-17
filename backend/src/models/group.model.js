import mongoose from "mongoose";

const scheduleSchema = new mongoose.Schema({
  frequency: {
    type: String,
    // Supports various recurrence patterns including one-off events
    enum: ['daily', 'weekly', 'biweekly', 'monthly', 'custom', 'once'], 
    default: 'weekly'
  },
  days: [{ type: Number }], // Used for Weekly (0-6) or Monthly (1-31)
  
  // Stores Custom Routine logic for complex patterns
  rules: [{
    type: { 
      type: String, 
      enum: ['byDay', 'byDate'] 
    },
    occurrence: { type: String, enum: ['1st', '2nd', '3rd', '4th', '5th', 'Last'] },
    day: Number, // 0-6
    dates: [Number] 
  }]
}, { _id: false });

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  time: { type: String },
  schedule: { type: scheduleSchema, required: false },
  timezone: { type: String },
  
  /**
   * Default maximum capacity for events generated for this group.
   * A value of 0 indicates that capacity is "Unlimited" by default.
   * Owners can update this in the group settings to apply a limit to future events.
   */
  defaultCapacity: { 
    type: Number, 
    default: 0 
  },
  
  eventsToDisplay: { 
    type: Number, 
    default: 1, 
    min: 1, 
    max: 14 
  },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

const Group = mongoose.model("Group", groupSchema);

export default Group;