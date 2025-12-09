import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    type: {
        type: String,
        required: true,
        // 👇 UPDATED: Added 'group-added' to the list
        enum: ['group-invite', 'invite-accepted', 'invite-declined', 'group-added'],
    },
    group: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Group',
    },
    status: {
        type: String,
        required: true,
        enum: ['pending', 'accepted', 'declined', 'read'],
        default: 'pending',
    },
    read: {
        type: Boolean,
        default: false,
    },
}, { timestamps: true });

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;