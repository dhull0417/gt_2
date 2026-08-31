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
    },
    type: {
        type: String,
        required: true,
        enum: [
            'group-invite', 'invite-accepted', 'invite-declined', 'group-added', 'group-updated',
            'meetup-rsvp-in', 'meetup-rsvp-out', 'meetup-waitlist-join', 'waitlist-promotion',
            'meetup-rsvp-admin-in', 'meetup-rsvp-admin-out',
            'meetup-created', 'meetup-updated', 'meetup-cancelled',
            'meetup-rsvp-reminder', 'meetup-rsvp-open', 'meetup-starting-soon',
            'poll-created', 'poll-closed',
        ],
    },
    group: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Group',
    },
    meetup: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Meetup',
    },
    poll: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Poll',
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
    // extra context for a more specific message, e.g. { changedFields: ['time', 'location'] }
    meta: {
        type: mongoose.Schema.Types.Mixed,
    },
}, { timestamps: true });

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;