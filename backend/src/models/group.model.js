import mongoose from "mongoose";

const recurrenceSchema = new mongoose.Schema({
    frequency: { type: String, required: true, enum: ['weekly', 'monthly'] },
    interval: { type: Number, required: true, default: 1 },
    daysOfWeek: { type: [Number] }, // e.g., [4] for Thursday (Sun=0, Mon=1...)
    daysOfMonth: { type: [Number] }, // e.g., [7, 15, 26]
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
      ref: "User", // This references your User model
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
  eventStartDate: {
    type: Date,
    required: true,
  },
  recurrence: {
    type: recurrenceSchema,
    required: true, 
  },
});

const Group = mongoose.model("Group", groupSchema);

export default Group;