// Which app version is calling. The app sends X-App-Version from 1.4.0 on; the builds that are
// live in the stores today (1.3.x and older) send nothing. "No header" (or anything below
// MODERN_MIN_VERSION) is therefore a legacy client, which keeps the behaviour it was built for.

export const MODERN_MIN_VERSION = '1.4.0';

/** "1.4.2" -> [1, 4, 2]; null when it doesn't look like a version. */
export const parseVersion = (value) => {
  const m = /^(\d{1,4})\.(\d{1,4})(?:\.(\d{1,4}))?/.exec(String(value ?? '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] || 0)] : null;
};

export const compareVersions = (a, b) => {
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) < (b[i] || 0) ? -1 : 1;
  }
  return 0;
};

export const isLegacyVersion = (value) => {
  const parsed = parseVersion(value);
  if (!parsed) return true;
  return compareVersions(parsed, parseVersion(MODERN_MIN_VERSION)) < 0;
};

const headerOf = (req) => {
  const raw = req?.headers?.['x-app-version'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 20) : null;
};

export const clientInfo = (req, _res, next) => {
  const version = headerOf(req);
  req.clientInfo = { version, isLegacy: isLegacyVersion(version) };
  next();
};

/** True for app builds from before version reporting (the 1.3.x builds in the stores today). */
export const isLegacyClient = (req) =>
  req?.clientInfo ? req.clientInfo.isLegacy : isLegacyVersion(headerOf(req));
