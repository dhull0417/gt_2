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
  },
  { timestamps: true }
);

const Event = mongoose.model("Event", eventSchema);

export default Event;