import mongoose from "mongoose";

const scheduleSchema = new mongoose.Schema({
  frequency: {
    type: String,
    // Added 'biweekly' and 'custom' here to match frontend
    enum: ['daily', 'weekly', 'biweekly', 'monthly', 'custom', 'once'], 
    default: 'weekly'
  },
  days: [{ type: Number }], // Used for Weekly (0-6) or Monthly (1-31)
  
  // 👇 NEW: This stores your Custom Routine logic
  rules: [{
    type: { 
      type: String, 
      enum: ['byDay', 'byDate'] 
    },
    // For "byDay" (e.g., "Every 2nd Tuesday")
    occurrence: { type: String, enum: ['1st', '2nd', '3rd', '4th', '5th', 'Last'] },
    day: Number, // 0-6
    
    // For "byDate" (e.g., "Every 15th")
    dates: [Number] 
  }]
}, { _id: false });

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  time: { type: String },
  schedule: { type: scheduleSchema, required: false },
  timezone: { type: String },
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