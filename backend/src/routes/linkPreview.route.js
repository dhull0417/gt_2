import express from 'express';
import { protectRoute } from '../middleware/auth.middleware.js';
import { fetchPreview } from '../utils/linkPreview.js';

const router = express.Router();

// Small in-memory cache. On serverless it only lives as long as the instance,
// which is fine: it just avoids refetching the same popular link repeatedly.
const CACHE_TTL_MS = 60 * 60 * 1000;
const FAILURE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 200;
const cache = new Map();

router.get('/', protectRoute, async (req, res) => {
  const url = String(req.query.url || '');
  if (!url || url.length > 2000) return res.status(400).json({ message: 'url required' });
  // Never let the phone's HTTP layer cache an answer: a "no preview" must be retried later.
  res.set('Cache-Control', 'no-store');

  const hit = cache.get(url);
  if (hit && hit.expires > Date.now()) return res.json({ preview: hit.preview });

  let preview = null;
  let reason;
  try {
    preview = await fetchPreview(url);
  } catch (err) {
    // Unreachable, blocked, slow, no tags — the app just shows the plain link. Logged so the
    // reason is visible in the Vercel function logs.
    reason = err?.message || String(err);
    console.warn('Link preview failed for', url, '-', reason);
  }
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  // Failures are only remembered briefly so a fixed or slow site gets another try.
  cache.set(url, { preview, expires: Date.now() + (preview ? CACHE_TTL_MS : FAILURE_TTL_MS) });
  res.json(reason ? { preview, reason } : { preview });
});

export default router;
