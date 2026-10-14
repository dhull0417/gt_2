import express from "express";
import { unsubscribePage, unsubscribeAction } from "../controllers/email.controller.js";

// Public routes (no login): the signed link in each email is the credential.
const router = express.Router();

router.get("/unsubscribe", unsubscribePage);
router.post("/unsubscribe", unsubscribeAction);

export default router;
