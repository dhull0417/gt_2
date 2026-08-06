import mongoose from "mongoose";
import {ENV} from "./env.js"

// TEMP (A/B test): migrate-mongo import + warnIfMigrationsPending removed to isolate
// whether they're the cause of the Vercel MongooseServerSelectionError. Restore after test.

export const connectDB = async () => {
    try {
// Log the environment variable (but obscure the sensitive parts for security)
        const uri = process.env.MONGO_URI;
        if (uri) {
        console.log("MongoDB URI loaded. Host:", uri.split('@')[1].split('/')[0]);
        } else {
        console.error("MongoDB URI is not set!");
        // You can even exit here if it's a critical dependency
        process.exit(1);
        }

        console.log(process.env.MONGODB_URI)
        await mongoose.connect(ENV.MONGO_URI)
        console.log("Connected to DB successfully")
    } catch (error) {
        console.error("Error connecting to MongoDB:", error);
        //Only 0 will work, but 1 will kick you out
        process.exit(1);
    }


}