import mongoose from "mongoose";

const scheduleSchema = new mongoose.Schema({
  frequency: { frequency: {
      type: String,
      enum: ['daily', 'weekly', 'biweekly', 'monthly', 'custom'], 
      default: 'weekly'
    },},
    days: [{ 
    type: Number, 
  }], 
}, { _id: false });

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  time: { type: String },
  schedule: { type: scheduleSchema, required: false },
  timezone: { type: String },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

const Group = mongoose.model("Group", groupSchema);

export default Group;