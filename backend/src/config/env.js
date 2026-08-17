import dotenv from "dotenv"

dotenv.config();

export const ENV = {
    PORT:process.env.PORT,
    NODE_ENV:process.env.NODE_ENV,
    MONGO_URI:process.env.MONGO_URI,
    CLERK_PUBLISHABLE_KEY:process.env.CLERK_PUBLISHABLE_KEY,
    ARCJET_KEY:process.env.ARCJET_KEY,
};