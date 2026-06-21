import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import upload from "../middleware/upload.middleware.js";
import cloudinary from "../config/cloudinary.js";

const router = express.Router();

router.post("/chat-image", protectRoute, upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No image provided" });

  try {
    const b64 = req.file.buffer.toString("base64");
    const dataUri = `data:${req.file.mimetype};base64,${b64}`;

    const result = await cloudinary.uploader.upload(dataUri, {
      folder: "chat_images",
      resource_type: "image",
      transformation: [{ width: 1200, crop: "limit", quality: "auto:good" }],
    });

    res.json({ url: result.secure_url });
  } catch (err) {
    console.error("Cloudinary upload error:", err);
    res.status(500).json({ message: "Image upload failed" });
  }
});

export default router;
