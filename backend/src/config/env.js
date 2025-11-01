import dotenv from "dotenv"
import { StreamChat } from "stream-chat";

dotenv.config();

// This allows us to use all of these env variables by only calling the ENV object.
//
export const ENV = {
    PORT:process.env.PORT,
    NODE_ENV:process.env.NODE_ENV,
    MONGO_URI:process.env.MONGO_URI,
    CLERK_PUBLISHABLE_KEY:process.env.CLERK_PUBLISHABLE_KEY,
    CLOUDINARY_CLOUD_NAME:process.env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY:process.env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET:process.env.CLOUDINARY_API_SECRET,
    ARCJET_KEY:process.env.ARCJET_KEY,
    STREAM_API_KEY:process.env.STREAM_API_KEY,
    STREAM_API_SECRET:process.env.STREAM_API_SECRET,
    SERVER_CLIENT:StreamChat.getInstance(
        process.env.STREAM_API_KEY, 
        process.env.STREAM_API_SECRET
    )
};