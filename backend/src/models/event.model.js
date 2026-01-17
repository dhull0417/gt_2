import mongoose from "mongoose";

const eventSchema = new mongoose.Schema(
  {
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    time: {
      type: String,
      required: true,
    },
    timezone: {
      type: String,
      required: true,
    },
    // New: Tracks if an event has been cancelled by an owner/moderator
    status: { 
      type: String, 
      enum: ['scheduled', 'cancelled'], 
      default: 'scheduled' 
    },
    // New: The maximum number of attendees allowed for this specific instance
    capacity: { 
      type: Number, 
      default: 0 // 0 represents no limit
    },
    isOverride: {
      type: Boolean,
      default: false,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    undecided: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    in: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    out: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    // New: Queue for users who tried to RSVP 'in' while the event was at capacity
    waitlist: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  { timestamps: true }
);

const Event = mongoose.model("Event", eventSchema);

export default Event;