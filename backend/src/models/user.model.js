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
        username: {
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
        /**
         * Project 4: Mute Feature
         * Array of Group IDs for which the user has disabled chat notifications.
         */
        mutedGroups: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Group",
            },
        ],
        /**
         * Project 4: Push Notifications
         * Storing the unique Expo Push Token for this user's device
         * to allow the backend to send real-time alerts.
         */
        expoPushToken: {
            type: String,
            required: false,
        },
    },
    { timestamps: true}
);

const User = mongoose.model("User", userSchema);

export default User;