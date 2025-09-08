import mongoose from "mongoose";

// The scheduleSchema is not currently used by groupSchema, but is kept for future reference.
const scheduleSchema = new mongoose.Schema({
    frequency: { type: String, required: true, enum: ['weekly', 'monthly'] },
    day: { type: Number, required: true }, 
    time: { type: String, required: true }, 
}, { _id: false });

const groupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  // Add the new time field
  time: {
    type: String,
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
});

const Group = mongoose.model("Group", groupSchema);

export default Group;