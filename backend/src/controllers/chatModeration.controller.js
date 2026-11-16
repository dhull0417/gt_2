// Chat moderation: owners/moderators delete anyone's message and time people out of a group's chat.
// Roles are checked here against Mongo; Supabase only enforces what we write to it.
// Spec: docs/specs/2026-11-16-chat-moderation-design.md
import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import { getAuth } from "@clerk/express";
import Group from "../models/group.model.js";
import User from "../models/user.model.js";
import { canManageGroup, canManageMember } from "./group.controller.js";
import { notifyAndPersist } from "../utils/push.notifications.js";
import {
    isConfigured, setChatTimeoutRow, deleteChatTimeoutRow, getChatMessage, modDeleteChatMessage, latestChatMessageId,
} from "../utils/supabaseAdmin.js";
import { isTimeoutDuration, timeoutUntil, pruneExpired, timeoutPushBody, activeTimeout } from "../utils/chatTimeout.js";

const NOT_SET_UP = { error: "Chat moderation is not set up." };
const SYNC_FAILED = { error: "Could not update the chat. Try again." };
const sameId = (a, b) => String(a) === String(b);

// Loads requester + group and checks the rules shared by every route. Returns { error } or { requester, group }.
const loadContext = async (req, res) => {
    const { groupId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(groupId)) return { status: 400, body: { error: "Invalid ID." } };
    if (!isConfigured()) return { status: 503, body: NOT_SET_UP };
    const { userId: clerkId } = getAuth(req);
    const requester = await User.findOne({ clerkId }).select("_id clerkId firstName").lean();
    const group = await Group.findById(groupId).select("+chatTimeouts");
    if (!requester || !group) return { status: 404, body: { error: "Resource not found." } };
    if (group.isDM) return { status: 400, body: { error: "Not available in direct messages." } };
    return { requester, group };
};

// Same rules for setting and ending a timeout. Returns { status, body } on failure or { target }.
const checkTimeoutTarget = async (req, requester, group) => {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) return { status: 400, body: { error: "Invalid ID." } };
    if (sameId(userId, requester._id)) return { status: 400, body: { error: "You can't time yourself out." } };
    if (!canManageGroup(requester._id, group)) return { status: 403, body: { error: "Permission denied." } };
    // The whole user: the push needs their tokens and notification settings.
    const target = await User.findById(userId).lean();
    if (!target || !group.members.some((m) => sameId(m, target._id))) {
        return { status: 404, body: { error: "That person isn't in this group." } };
    }
    if (!canManageMember(requester._id, target._id, group)) {
        return { status: 403, body: { error: "Moderators can't time out the owner or other moderators." } };
    }
    return { target };
};

// Writes `next` to Mongo, then runs `sync` (the Supabase copy). If the copy fails the Mongo change is
// undone, so the two never disagree about who is timed out.
const saveTimeouts = async (group, next, sync) => {
    const previous = group.chatTimeouts.map((e) => (e.toObject ? e.toObject() : { ...e }));
    group.chatTimeouts = next;
    await group.save();
    try {
        await sync();
        return true;
    } catch (err) {
        console.error("[chatModeration] Supabase sync failed, rolling back:", err?.message || err);
        group.chatTimeouts = previous;
        await group.save();
        return false;
    }
};

export const setChatTimeout = asyncHandler(async (req, res) => {
    const { duration } = req.body || {};
    const ctx = await loadContext(req, res);
    if (ctx.status) return res.status(ctx.status).json(ctx.body);
    const { requester, group } = ctx;
    if (!isTimeoutDuration(duration)) return res.status(400).json({ error: "Pick a timeout length." });
    const check = await checkTimeoutTarget(req, requester, group);
    if (check.status) return res.status(check.status).json(check.body);
    const { target } = check;

    const now = new Date();
    const until = timeoutUntil(duration, now);
    const next = [
        ...pruneExpired(group.chatTimeouts, now).filter((e) => !sameId(e.user, target._id)),
        { user: target._id, until, by: requester._id, createdAt: now },
    ];
    const ok = await saveTimeouts(group, next, () => setChatTimeoutRow(String(group._id), target.clerkId, until));
    if (!ok) return res.status(502).json(SYNC_FAILED);

    try {
        await notifyAndPersist([target], {
            title: group.name,
            body: timeoutPushBody(duration),
            data: { groupId: group._id.toString(), type: "chat-timeout" },
            type: "chat-timeout",
            // No sender: the timed-out person is never told which moderator did it.
            group: group._id,
            meta: { duration },
        });
    } catch (err) { console.error("[chatModeration] timeout push failed:", err); }

    res.status(200).json({ userId: String(target._id), until: until ? until.toISOString() : null });
});

export const clearChatTimeout = asyncHandler(async (req, res) => {
    const ctx = await loadContext(req, res);
    if (ctx.status) return res.status(ctx.status).json(ctx.body);
    const { requester, group } = ctx;
    const check = await checkTimeoutTarget(req, requester, group);
    if (check.status) return res.status(check.status).json(check.body);
    const { target } = check;

    const next = pruneExpired(group.chatTimeouts).filter((e) => !sameId(e.user, target._id));
    const ok = await saveTimeouts(group, next, () => deleteChatTimeoutRow(String(group._id), target.clerkId));
    if (!ok) return res.status(502).json(SYNC_FAILED);
    res.status(200).json({ userId: String(target._id), until: null });
});

export const modDeleteMessage = asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const ctx = await loadContext(req, res);
    if (ctx.status) return res.status(ctx.status).json(ctx.body);
    const { requester, group } = ctx;
    if (!canManageGroup(requester._id, group)) return res.status(403).json({ error: "Permission denied." });
    // A timed-out moderator can't change chat messages either.
    if (activeTimeout(group.chatTimeouts, requester._id)) {
        return res.status(403).json({ error: "You're timed out of this chat." });
    }

    let message;
    try {
        message = await getChatMessage(messageId);
    } catch (err) {
        console.error("[chatModeration] message lookup failed:", err?.message || err);
        return res.status(502).json(SYNC_FAILED);
    }
    // A message id from another group is treated exactly like a missing one.
    if (!message || !sameId(message.group_id, group._id)) return res.status(404).json({ error: "Message not found." });
    if (message.deleted_at) return res.status(200).json({ message: "Deleted." });

    try {
        await modDeleteChatMessage(message);
    } catch (err) {
        console.error("[chatModeration] delete failed:", err?.message || err);
        return res.status(502).json(SYNC_FAILED);
    }

    // If it was the newest message, the Groups list preview shouldn't keep showing its text.
    // (lastMessage's own timestamp is when the app reported the send, so it can't be matched reliably.)
    try {
        const last = group.lastMessage;
        if (last?.createdAt && (await latestChatMessageId(String(group._id))) === message.id) {
            await Group.updateOne(
                { _id: group._id, "lastMessage.createdAt": last.createdAt },
                { $set: { "lastMessage.text": "Message deleted" } }
            );
        }
    } catch (err) { console.error("[chatModeration] preview update failed:", err?.message || err); }
    res.status(200).json({ message: "Deleted." });
});
