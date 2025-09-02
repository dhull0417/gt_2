import mongoose from "mongoose";

// A schema is a set of database objects (tables and views) but only contains the object structures, not the actual data in those objects
// You may have multiple schemas in one database, and your schema will likely have multiple tables and other objects.
// We are essentially determining the columns of a user table and bringing structure to a non-SQL Mongo database
const userSchema = new mongoose.Schema(
    {
        // Individual auth id
        clerkId: {
            type: String,
            required: true,
            unique: true,
        },

        email: {
            type: String,
            required: true,
            unique: true,
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

        bio: {
            type: String,
            default: "",
            maxLength: 160,
        },

        location: {
            type: String,
            default: "",
        },

        followers: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            }
        ],

        following: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            }
        ],
    },
    // Timestamps: true allows the user to get the most updated fields automatically
    { timestamps: true}
);

const User = mongoose.model("User", userSchema);

export default User;