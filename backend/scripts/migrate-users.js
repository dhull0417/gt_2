import mongoose from "mongoose";
import dotenv from "dotenv";
import { clerkClient } from "@clerk/clerk-sdk-node";
import User from "../src/models/user.model.js";

dotenv.config({ path: './.env' });

const migrateUsers = async () => {
    if (!process.env.MONGO_URI || !process.env.CLERK_SECRET_KEY) {
        throw new Error("MONGO_URI and CLERK_SECRET_KEY must be set in .env file");
    }

    try {
        console.log("Connecting to database...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to DB successfully.");

        const usersInDB = await User.find({});
        console.log(`Found ${usersInDB.length} users to migrate.`);

        for (const user of usersInDB) {
            try {
                console.log(`Processing user with clerkId: ${user.clerkId}`);

                // Step 1: Fetch from Clerk and add/update the username
                const clerkUser = await clerkClient.users.getUser(user.clerkId);
                if (clerkUser.username) {
                    await User.updateOne(
                        { _id: user._id },
                        { $set: { username: clerkUser.username } }
                    );
                    console.log(`Successfully set username for user ${user._id}`);
                } else {
                    console.warn(`User with clerkId ${user.clerkId} has no username in Clerk. Skipping username update.`);
                }

                // --- THIS IS THE FIX ---
                // Step 2: Explicitly remove the old fields in a separate command
                await User.updateOne(
                    { _id: user._id },
                    {
                        $unset: {
                            bio: "",
                            location: "",
                            followers: "",
                            following: "",
                        }
                    }
                );
                console.log(`Successfully removed old fields for user ${user._id}`);

            } catch (error) {
                console.error(`Failed to process user ${user._id}:`, error.message);
            }
        }

        console.log("User migration completed successfully!");
    } catch (error) {
        console.error("An error occurred during the migration process:", error);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected from database.");
    }
};

// Run the migration
migrateUsers();