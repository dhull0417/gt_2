import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  getTournamentForMeetup, getTournament, createTournament, updateTournament, randomizeTournament,
  editTournament, reportResult, deleteTournament,
  getRankingLists, createRankingList, updateRankingList, deleteRankingList, getTournamentStats,
} from "../controllers/tournament.controller.js";

const router = express.Router();

router.get("/by-meetup/:meetupId", protectRoute, getTournamentForMeetup);
router.get("/rankings/:groupId", protectRoute, getRankingLists);
router.post("/rankings/:groupId", protectRoute, createRankingList);
router.put("/rankings/:groupId/:listId", protectRoute, updateRankingList);
router.delete("/rankings/:groupId/:listId", protectRoute, deleteRankingList);
router.get("/stats/:groupId", protectRoute, getTournamentStats);
router.post("/", protectRoute, createTournament);
router.get("/:id", protectRoute, getTournament);
router.put("/:id", protectRoute, editTournament);
router.post("/:id/update", protectRoute, updateTournament);
router.post("/:id/randomize", protectRoute, randomizeTournament);
router.put("/:id/matches/:matchId/result", protectRoute, reportResult);
router.delete("/:id", protectRoute, deleteTournament);

export default router;
