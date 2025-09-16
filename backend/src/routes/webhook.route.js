import express from "express";
import { clerkWebhook } from "../controllers/webhook.controller.js";

const router = express.Router();

// This route uses a raw body parser, as required by the Svix library
router.post("/clerk", express.raw({ type: "application/json" }), clerkWebhook);

export default router;