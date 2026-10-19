import express from 'express';
import { protectRoute } from '../middleware/auth.middleware.js';
import { fetchPreview } from '../utils/linkPreview.js';

const router = express.Router();

// Small in-memory cache. On serverless it only lives as long as the instance,
// which is fine: it just avoids refetching the same popular link repeatedly.
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX = 200;
const cache = new Map();

router.get('/', protectRoute, async (req, res) => {
  const url = String(req.query.url || '');
  if (!url || url.length > 2000) return res.status(400).json({ message: 'url required' });

  const hit = cache.get(url);
  if (hit && hit.expires > Date.now()) {
    res.set('Cache-Control', 'private, max-age=3600');
    return res.json({ preview: hit.preview });
  }

  try {
    const preview = await fetchPreview(url);
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(url, { preview, expires: Date.now() + CACHE_TTL_MS });
    res.set('Cache-Control', 'private, max-age=3600');
    res.json({ preview });
  } catch (err) {
    // Unreachable, blocked, slow — the app just shows the plain link. Logged so a deployed
    // problem is visible in the Vercel function logs instead of failing silently.
    console.warn('Link preview failed for', url, '-', err?.message || err);
    res.json({ preview: null });
  }
});

export default router;
