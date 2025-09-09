import mongoose from "mongoose";

const eventSchema = new mongoose.Schema(
  {
    // A reference to the parent group that this event belongs to
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
    },
    // The name of the event, copied from the group name for easy display
    name: {
      type: String,
      required: true,
    },
    // The specific date of this event instance
    date: {
      type: Date,
      required: true,
    },
    // The time of the event, copied from the group's schedule
    time: {
      type: String,
      required: true,
    },
    // A list of users who are invited to this event (copied from the group members)
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    // A list of users who have not yet responded to the RSVP
    undecided: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    // A list of users who have RSVP'd "I'm in"
    in: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    // A list of users who have RSVP'd "I'm out"
    out: [
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