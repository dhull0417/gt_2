import mongoose from "mongoose";
import {ENV} from "./env.js"
import { config as migrateMongoConfig, status as migrationStatus } from "migrate-mongo";
import migrateConfig from "../../migrate-mongo-config.cjs";

const warnIfMigrationsPending = async () => {
    try {
        migrateMongoConfig.set(migrateConfig);
        const pending = (await migrationStatus(mongoose.connection.db))
            .filter((m) => m.appliedAt === "PENDING");
        if (pending.length > 0) {
            console.warn(
                `⚠️  ${pending.length} pending database migration(s): ${pending.map((m) => m.fileName).join(", ")}. Run "npm run migrate:up".`
            );
        }
    } catch (err) {
        console.warn("Could not check migration status:", err.message);
    }
};

export const connectDB = async () => {
    try {
// log host only, hide credentials
        const uri = process.env.MONGO_URI;
        if (uri) {
        console.log("MongoDB URI loaded. Host:", uri.split('@')[1].split('/')[0]);
        } else {
        console.error("MongoDB URI is not set!");
        process.exit(1);
        }

        console.log(process.env.MONGODB_URI)
        await mongoose.connect(ENV.MONGO_URI)
        console.log("Connected to DB successfully")
        await warnIfMigrationsPending();
    } catch (error) {
        console.error("Error connecting to MongoDB:", error);
        //Only 0 will work, but 1 will kick you out
        process.exit(1);
    }


}