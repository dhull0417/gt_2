import express from "express";
import { getPlacesAutocomplete, getPlaceDetails } from "../controllers/places.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/autocomplete", protectRoute, getPlacesAutocomplete);
router.get("/details", protectRoute, getPlaceDetails);

export default router;
