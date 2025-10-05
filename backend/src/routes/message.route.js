import express from "express";
import { getMessages } from "../controllers/message.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/:groupId", protectRoute, getMessages);

export default router;