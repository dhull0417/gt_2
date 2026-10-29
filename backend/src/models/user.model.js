import mongoose from "mongoose";
import crypto from "crypto";

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
        // Premium subscription entitlement. Written ONLY by the server (the
        // RevenueCat webhook / admin tooling), never from client input; see
        // utils/premium.js. Users created before this field existed simply
        // have no `premium` key, which hasPremium() treats as free.
        premium: {
            type: {
                active: { type: Boolean, default: false },
                expiresAt: { type: Date, default: null },
                store: { type: String, default: null },      // app_store | play_store | manual
                productId: { type: String, default: null },
                updatedAt: { type: Date, default: null },
            },
            default: {},
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
        // group ids pinned to the top of the member's Groups list
        pinnedGroups: [
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
        // Expo push token for the most recently used device
        expoPushToken: {
            type: String,
            required: false,
        },
        // Every device the member is signed in on (max 5), so all of them get pushes.
        // `expoPushToken` above always holds the latest one for older code paths.
        expoPushTokens: {
            type: [String],
            default: [],
        },
        // What the member wants pushes for. Missing = everything on. Chat has its
        // own switch because it is by far the busiest.
        notificationPrefs: {
            type: {
                chat: { type: Boolean, default: true },
                rsvps: { type: Boolean, default: true },
                reminders: { type: Boolean, default: true },
                polls: { type: Boolean, default: true },
                quietHours: {
                    type: {
                        enabled: { type: Boolean, default: false },
                        start: { type: String, default: "10:00 PM" },
                        end: { type: String, default: "08:00 AM" },
                    },
                    default: {},
                },
            },
            default: {},
        },
        // Which app versions this person uses (from GET /api/users/me), to know when it is safe to
        // turn on the cutover switches: appVersion = newest version-reporting app seen;
        // legacyAppSeenAt = last time an app from before version reporting (1.3.x) was used.
        appVersion: { type: String, default: null },
        appVersionSeenAt: { type: Date, default: null },
        legacyAppSeenAt: { type: Date, default: null },
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
        // IANA timezone from the device (e.g. "America/Denver"); used to send
        // lifecycle emails inside the recipient's 9am-7pm window.
        timezone: {
            type: String,
            default: null,
        },
        // Lifecycle email state. Server-owned: never accept from client input.
        // Users without `enrolledAt` (everyone who signed up before launch) are never emailed.
        lifecycle: {
            type: {
                enrolledAt: { type: Date, default: null },
                firstGroupAt: { type: Date, default: null },
                // groups this user has ever created (a counter, so deleting a group doesn't undo it)
                groupsCreated: { type: Number, default: 0 },
                joinedViaGroup: { type: mongoose.Schema.Types.ObjectId, ref: "Group", default: null },
            },
            default: {},
        },
        emailPrefs: {
            type: {
                marketingOptOut: { type: Boolean, default: false },
                marketingOptOutAt: { type: Date, default: null },
                // hard bounce or spam complaint: send nothing further
                suppressed: { type: Boolean, default: false },
            },
            default: {},
        },
        calendarToken: {
            type: String,
            required: false,
            unique: true,
            sparse: true,
            default: function() {
                // unguessable url-safe token
                return crypto.randomBytes(24).toString('hex');
            }
        },
    },
    { timestamps: true}
);

const User = mongoose.model("User", userSchema);

export default User;