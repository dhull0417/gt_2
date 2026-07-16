import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import Poll from "../models/poll.model.js";
import Group from "../models/group.model.js";
import User from "../models/user.model.js";
import { getAuth } from "@clerk/express";
import { canManageGroup } from "./group.controller.js";
import { notifyUsers } from "../utils/push.notifications.js";

const POLL_POPULATE = [
    { path: 'group', select: 'name owner moderators' },
    { path: 'creator', select: 'firstName lastName username profilePicture clerkId' },
    { path: 'options.voters', select: 'firstName lastName username profilePicture clerkId' },
];

/**
 * @desc    Create a new poll (Owner/Moderator Only)
 * @route   POST /api/polls
 */
export const createPoll = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { groupId, prompt, options, allowMultiple, expiresAt } = req.body;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
        return res.status(400).json({ error: "Invalid Group ID." });
    }

    const requester = await User.findOne({ clerkId }).lean();
    const group = await Group.findById(groupId);
    if (!requester || !group) return res.status(404).json({ error: "Resource not found." });

    if (!canManageGroup(requester._id, group)) {
        return res.status(403).json({ error: "Permission denied." });
    }

    if (!prompt || !prompt.trim() || prompt.trim().length > 100) {
        return res.status(400).json({ error: "Prompt is required and must be 100 characters or fewer." });
    }

    const cleanedOptions = Array.isArray(options)
        ? options.map(text => (typeof text === 'string' ? text.trim() : '')).filter(Boolean)
        : [];

    if (cleanedOptions.length < 2 || cleanedOptions.length > 10) {
        return res.status(400).json({ error: "A poll must have between 2 and 10 response options." });
    }

    if (!expiresAt || new Date(expiresAt) <= new Date()) {
        return res.status(400).json({ error: "Poll expiration must be set to a future date and time." });
    }

    const poll = await Poll.create({
        group: group._id,
        creator: requester._id,
        prompt: prompt.trim(),
        allowMultiple: !!allowMultiple,
        options: cleanedOptions.map(text => ({ text, voters: [] })),
        expiresAt: new Date(expiresAt),
    });

    const membersToNotify = await User.find({ _id: { $in: group.members, $ne: requester._id } });
    if (membersToNotify.length > 0) {
        await notifyUsers(membersToNotify, {
            title: "New Poll",
            body: poll.prompt,
            data: { pollId: poll._id.toString(), groupId: group._id.toString(), type: 'poll_created' }
        });
    }

    const populatedPoll = await Poll.findById(poll._id).populate(POLL_POPULATE);
    res.status(201).json({ message: "Poll created successfully.", poll: populatedPoll });
});

/**
 * @desc    Get all polls for a group
 * @route   GET /api/polls?groupId=...
 */
export const getPolls = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { groupId } = req.query;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
        return res.status(400).json({ error: "Invalid Group ID." });
    }

    const requester = await User.findOne({ clerkId }).lean();
    const group = await Group.findById(groupId).lean();
    if (!requester || !group) return res.status(404).json({ error: "Resource not found." });

    const isMember = group.members?.some(m => m.toString() === requester._id.toString());
    if (!isMember) return res.status(403).json({ error: "Permission denied." });

    const polls = await Poll.find({ group: groupId, status: { $ne: 'cancelled' } })
        .populate(POLL_POPULATE)
        .sort({ createdAt: -1 });

    res.status(200).json(polls);
});

/**
 * @desc    Vote (or change vote) on an active poll
 * @route   POST /api/polls/:pollId/vote
 */
export const votePoll = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { pollId } = req.params;
    const { optionIds } = req.body;

    if (!mongoose.Types.ObjectId.isValid(pollId)) {
        return res.status(400).json({ error: "Invalid Poll ID." });
    }

    const requester = await User.findOne({ clerkId }).lean();
    const poll = await Poll.findById(pollId).populate('group');
    if (!requester || !poll) return res.status(404).json({ error: "Resource not found." });

    const isMember = poll.group.members?.some(m => m.toString() === requester._id.toString());
    if (!isMember) return res.status(403).json({ error: "Permission denied." });

    if (poll.status !== 'active' || new Date(poll.expiresAt) <= new Date()) {
        return res.status(400).json({ error: "This poll is no longer accepting responses." });
    }

    const validIds = new Set(poll.options.map(o => o._id.toString()));
    const selectedIds = Array.isArray(optionIds) ? [...new Set(optionIds)] : [];

    if (selectedIds.length === 0 || !selectedIds.every(id => validIds.has(id))) {
        return res.status(400).json({ error: "Select at least one valid response option." });
    }

    if (!poll.allowMultiple && selectedIds.length > 1) {
        return res.status(400).json({ error: "This poll only allows a single response option." });
    }

    poll.options.forEach(option => option.voters.pull(requester._id));
    poll.options.forEach(option => {
        if (selectedIds.includes(option._id.toString())) {
            option.voters.push(requester._id);
        }
    });

    await poll.save();

    const updatedPoll = await Poll.findById(pollId).populate(POLL_POPULATE);
    res.status(200).json({ message: "Vote submitted successfully.", poll: updatedPoll });
});

/**
 * @desc    Cancel an active poll (Owner/Moderator Only)
 * @route   PATCH /api/polls/:pollId/cancel
 */
export const cancelPoll = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { pollId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(pollId)) {
        return res.status(400).json({ error: "Invalid Poll ID." });
    }

    const requester = await User.findOne({ clerkId }).lean();
    const poll = await Poll.findById(pollId).populate('group');
    if (!requester || !poll) return res.status(404).json({ error: "Resource not found." });

    if (!canManageGroup(requester._id, poll.group)) {
        return res.status(403).json({ error: "Permission denied." });
    }

    if (poll.status !== 'active') {
        return res.status(400).json({ error: "Only an active poll can be cancelled." });
    }

    poll.status = 'cancelled';
    await poll.save();

    res.status(200).json({ message: "Poll cancelled successfully." });
});
