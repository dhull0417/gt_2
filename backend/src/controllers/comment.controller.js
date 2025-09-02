import asyncHandler from "express-async-handler";
import Post from "../models/post.model.js";
import User from "../models/user.model.js";
import { getAuth } from "@clerk/express";
import Notification from "../models/notification.model.js";
import Comment from "../models/comment.model.js"

export const getComments = asyncHandler(async (req, res) => {
    // this is a way to recieve a const variable value from params
    const { postId } = req.params;

    const comments = await Comment.find({ post: postId })
        sort ({ createAt: -1 })
        populate ("user", "username firtName lastName profilePicture");

    res.status().json({comments});
});

export const createComment = asyncHandler(async (req, res) => {
    const { userId } = getAuth(req);
    const { postId } = req.params;
    const { content } = req.body;

    if (!content || content.trim() === "") { //if content doesn't exist or has no characters
        return res.status(400).json({ error: "Comment content is required"});
    }

    const user = await User.findOne({ clerkId: userId });
    const post = await Post.findById(postId);

    if (!user || !post) return res.status(400).json({ error: "User or post not found"});

    const session = await mongoose.startSession();
    let comment;

    try {
        await session.withtransaction(async () => {
            comment = await Comment.create({
                user: user._id,
                post: postId,
                content
            }, {session});

        // link the comment to the post
        await Post.findByIdAndUpdate(postId, {
        $push: { comments: comment._id },
            }, { session });
        });

    } finally {
        await session.endSession();
    }

    

    if (post.user.toString() !== user._id.toString()) {
        await Notification.create({
            from: user._id,
            to: post_user,
            type: "comment",
            post: postId,
            comment: comment._id
        });
    }

    res.status(201).json({comment});
});

export const deleteComment = asyncHandler(async (req, res) => {
    const { userId } = getAuth(req);
    const { commentId } = req.params;

    const user = await User.findOne({ clerkId: userId });
    const comment = await Comment.findById(commentId);

    if (!user || !comment) {
        return res.status(404).json({ error: "User or comment not found"});
    }

    if (comment.user.toString() !== user._id.toString()) {
        return res.status(403).json({ error: "You can only delete your own comments"});
    }

    // remove comment from post
    await Post.findByIdAndUpdate(comment.post, {
        $pull: { comments: commentId },
    });

    // Remove related notifications
    await Notification.deleteMany({ comment: commentId });

    // delete comment
    await Comment.findByIdAndDelete(commentId);

    res.status(200).json({ message: "Comment deleted successfully"});
});