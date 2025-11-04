import { StreamChat } from "stream-chat";
import dotenv from "dotenv";
dotenv.config();

const streamClient = StreamChat.getInstance(
  process.env.STREAM_API_KEY,
  process.env.STREAM_API_SECRET
);

/**
 * Ensures a user's name and image are synced with Stream.
 */
export const syncStreamUser = async (user) => {
  if (!user || !user._id) return;

  try {
    await streamClient.upsertUser({
      id: user._id.toString(),
      name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
      image: user.profilePicture || undefined,
    });
  } catch (err) {
    console.error("Stream user sync failed:", err.message);
  }
};

export default streamClient;
