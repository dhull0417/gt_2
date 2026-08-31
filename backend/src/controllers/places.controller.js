import asyncHandler from "express-async-handler";
import { ENV } from "../config/env.js";

const AUTOCOMPLETE_FIELD_MASK = "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat";
const DETAILS_FIELD_MASK = "id,formattedAddress,location,displayName";

// getPlacesAutocomplete: search-as-you-type; sessionToken pairs with getPlaceDetails for billing.
// Bias radius nudges toward the searcher without excluding farther results (e.g. a Zoom link).
const LOCATION_BIAS_RADIUS_METERS = 20000;

export const getPlacesAutocomplete = asyncHandler(async (req, res) => {
    const { input, sessionToken, lat, lng } = req.query;
    if (!input || !sessionToken) {
        return res.status(400).json({ error: "input and sessionToken are required." });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const locationBias = Number.isFinite(latitude) && Number.isFinite(longitude)
        ? { circle: { center: { latitude, longitude }, radius: LOCATION_BIAS_RADIUS_METERS } }
        : undefined;

    const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": ENV.GOOGLE_PLACES_API_KEY,
            "X-Goog-FieldMask": AUTOCOMPLETE_FIELD_MASK,
        },
        body: JSON.stringify({ input, sessionToken, ...(locationBias && { locationBias }) }),
    });

    if (!response.ok) {
        return res.status(502).json({ error: "Could not fetch location suggestions." });
    }

    const data = await response.json();
    const suggestions = (data.suggestions || [])
        .map(s => s.placePrediction)
        .filter(Boolean)
        .map(p => ({
            placeId: p.placeId,
            mainText: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
            secondaryText: p.structuredFormat?.secondaryText?.text ?? "",
        }));

    res.status(200).json(suggestions);
});

// Resolves a placeId to an address + coordinates; ends the autocomplete billing session.
export const getPlaceDetails = asyncHandler(async (req, res) => {
    const { placeId, sessionToken } = req.query;
    if (!placeId || !sessionToken) {
        return res.status(400).json({ error: "placeId and sessionToken are required." });
    }

    const response = await fetch(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}`,
        {
            headers: {
                "X-Goog-Api-Key": ENV.GOOGLE_PLACES_API_KEY,
                "X-Goog-FieldMask": DETAILS_FIELD_MASK,
            },
        }
    );

    if (!response.ok) {
        return res.status(502).json({ error: "Could not fetch location details." });
    }

    const data = await response.json();
    res.status(200).json({
        address: data.formattedAddress ?? "",
        lat: data.location?.latitude ?? null,
        lng: data.location?.longitude ?? null,
        name: data.displayName?.text ?? "",
    });
});
