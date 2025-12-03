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
    },
    { timestamps: true}
);

const User = mongoose.model("User", userSchema);

export default User;