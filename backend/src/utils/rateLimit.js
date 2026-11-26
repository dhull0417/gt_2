// Small fixed-window rate limiter kept in memory. On Vercel each server instance keeps its
// own counts, so this is a speed bump against scripted abuse, not an exact quota.

const MAX_KEYS = 10_000;

export const createLimiter = ({ limit, windowMs = 60_000, now = Date.now }) => {
  const hits = new Map(); // key -> { start, count }
  return (key) => {
    const t = now();
    let entry = hits.get(key);
    if (!entry || t - entry.start >= windowMs) {
      if (hits.size >= MAX_KEYS) hits.clear();
      entry = { start: t, count: 0 };
      hits.set(key, entry);
    }
    entry.count += 1;
    const allowed = entry.count <= limit;
    return { allowed, retryAfterSec: allowed ? 0 : Math.max(1, Math.ceil((entry.start + windowMs - t) / 1000)) };
  };
};

export const clientIp = (req) => {
  const fwd = req?.headers?.['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return first || req?.ip || 'unknown';
};

/** Express middleware: at most `limit` requests per IP per window for this route name. */
export const rateLimit = ({ name, limit, windowMs = 60_000 }) => {
  const hit = createLimiter({ limit, windowMs });
  return (req, res, next) => {
    const { allowed, retryAfterSec } = hit(`${name}:${clientIp(req)}`);
    if (allowed) return next();
    res.set('Retry-After', String(retryAfterSec));
    return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });
  };
};
