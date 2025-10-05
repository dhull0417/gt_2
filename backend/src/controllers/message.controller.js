import asyncHandler from "express-async-handler";
import Message from "../models/message.model.js";
import { getAuth } from "@clerk/express";

// Get all messages for a specific group
export const getMessages = asyncHandler(async (req, res) => {
    const { groupId } = req.params;

    const messages = await Message.find({ group: groupId })
        .populate("sender", "firstName lastName profilePicture username")
        .sort({ createdAt: "asc" });

    res.status(200).json(messages);
});