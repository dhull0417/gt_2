import mongoose from "mongoose";

const pollOptionSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true, maxlength: 100 },
  voters: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
}, { _id: true });

const pollSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  prompt: { type: String, required: true, trim: true, maxlength: 100 },
  allowMultiple: { type: Boolean, default: false },
  options: {
    type: [pollOptionSchema],
    validate: {
      validator: (options) => options.length >= 2 && options.length <= 10,
      message: "A poll must have between 2 and 10 response options.",
    },
  },
  status: { type: String, enum: ['active', 'expired', 'cancelled'], default: 'active' },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

const Poll = mongoose.model("Poll", pollSchema);

export default Poll;
