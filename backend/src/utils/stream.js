import { StreamChat } from "stream-chat";

const STREAM_API_KEY = process.env.STREAM_API_KEY;
const STREAM_API_SECRET = process.env.STREAM_API_SECRET;
const serverClient = StreamChat.getInstance(STREAM_API_KEY, STREAM_API_SECRET);

export const syncStreamUser = async (user) => {
  if (!user) return;
  try {
    console.log("Syncing Stream user:", user._id, user.firstName, user.lastName);

    await serverClient.upsertUser({
      id: user._id.toString(),
      name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
      image: user.profilePicture || "",
    });

    console.log("✅ Synced Stream user:", user._id);
  } catch (err) {
    console.error("❌ Stream user sync failed:", err);
  }
};
