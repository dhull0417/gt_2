import express from "express";
import {
    createPoll,
    getPolls,
    votePoll,
    cancelPoll,
} from "../controllers/poll.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/", protectRoute, getPolls);
router.post("/", protectRoute, createPoll);
router.post("/:pollId/vote", protectRoute, votePoll);
router.patch("/:pollId/cancel", protectRoute, cancelPoll);

export default router;
