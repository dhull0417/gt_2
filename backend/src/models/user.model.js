import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
    {
        clerkId: {
            type: String,
            required: true,
            unique: true,
        },
        email: {
            type: String,
            required: false,
            unique: true,
            sparse: true,
        },
        phoneNumber: {
             type: String,
             required: false,
             unique: true,
             sparse: true,
        },
        firstName: {
            type: String,
        },
        lastName: {
            type: String,
        },
        zipCode: {
            type: String,
            default: '',
        },
        hasSeenWelcome: {
            type: Boolean,
            default: false,
        },
        profilePicture: {
            type: String,
            default: "",
        },
        bannerImage: {
            type: String,
            default: "",
        },
        groups: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Group",
            },
        ],
        // group ids where chat notifications are muted
        mutedGroups: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Group",
            },
        ],
        mutedUntilNextMeetup: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Group",
            },
        ],
        // per-group last-read timestamp (keyed by group id); unread when
        // lastMessage.createdAt is newer than this (or missing)
        lastReadAt: {
            type: Map,
            of: Date,
            default: {},
        },
        // Expo push token for this device
        expoPushToken: {
            type: String,
            required: false,
        },
        // OS permission state per type, for granted-user counts.
        // 'undetermined' = never asked or no record yet.
        permissions: {
            type: {
                notifications: { type: String, enum: ['granted', 'denied', 'undetermined'], default: 'undetermined' },
                location: { type: String, enum: ['granted', 'denied', 'undetermined'], default: 'undetermined' },
                photoLibrary: { type: String, enum: ['granted', 'denied', 'undetermined'], default: 'undetermined' },
            },
            default: {},
        },
        calendarToken: {
            type: String,
            required: false,
            unique: true,
            sparse: true,
            default: function() {
                // timestamp + random base36 strings
                return Date.now().toString(36) + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            }
        },
    },
    { timestamps: true}
);

const User = mongoose.model("User", userSchema);

export default User;