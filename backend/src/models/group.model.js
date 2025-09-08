import mongoose from "mongoose";

// A simpler schema that directly matches our frontend data
const scheduleSchema = new mongoose.Schema({
    frequency: { type: String, required: true, enum: ['weekly', 'monthly'] },
    // A single number: 0-6 for weekly, 1-31 for monthly
    day: { type: Number, required: true }, 
    // The time of the meeting, e.g., "14:30"
    time: { type: String, required: true }, 
}, { _id: false });

const groupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
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
  createdAt: {
    type: Date,
    default: Date.now,
  },
  // We replace 'recurrence' and 'eventStartDate' with our new 'schedule' object
  schedule: {
    type: scheduleSchema,
    required: true, 
  },
});

const Group = mongoose.model("Group", groupSchema);

export default Group;