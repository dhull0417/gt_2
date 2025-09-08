import mongoose from "mongoose";

// A schema for the recurring schedule, matching the frontend.
const scheduleSchema = new mongoose.Schema({
  frequency: { 
    type: String, 
    required: true, 
    enum: ['weekly', 'monthly'] 
  },
  // A number: 0-6 for weekly, 1-31 for monthly
  day: { 
    type: Number, 
    required: true 
  }, 
}, { _id: false });

const groupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  time: {
    type: String,
    required: true,
  },
  // --- ADDED: Optional schedule field ---
  schedule: {
    type: scheduleSchema,
    required: false, // This makes the field optional
  },
  members: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
}, { timestamps: true }); // Using timestamps is a good practice

const Group = mongoose.model("Group", groupSchema);

export default Group;
