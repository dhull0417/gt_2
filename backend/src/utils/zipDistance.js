// Zip code → approximate location (center of the Census ZIP Code Tabulation Area), used to
// seat riders with nearby drivers. Data: src/data/zipCentroids.json, built by
// src/scripts/buildZipTable.js. Straight-line distance only; PO-box and business-only zips
// aren't in the table and come back as unknown (null).
import { createRequire } from 'node:module';

// A literal require path so Vercel's file tracing bundles the data file with the function.
const require = createRequire(import.meta.url);
const EARTH_RADIUS_MILES = 3958.8;

let table = null;

/** Replace the table (tests) or pass null to go back to the bundled file on next use. */
export const loadZipTable = (custom) => {
  table = custom ?? null;
};

const getTable = () => {
  if (!table) table = require('../data/zipCentroids.json');
  return table;
};

/** First five digits of a US zip ("84101-1234" → "84101"), or null. */
export const zipKey = (raw) => {
  const m = /^(\d{5})(?:-\d{4})?$/.exec(String(raw ?? '').trim());
  return m ? m[1] : null;
};

/** [lat, lng] for a zip, or null when unknown. */
export const coordsForZip = (raw) => {
  const key = zipKey(raw);
  if (!key) return null;
  return getTable()[key] ?? null;
};

const rad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance in miles between two [lat, lng] points. */
export const milesBetween = ([lat1, lng1], [lat2, lng2]) => {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(a)));
};
