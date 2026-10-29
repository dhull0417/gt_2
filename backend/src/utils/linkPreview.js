import dns from 'dns';
import net from 'net';
import http from 'http';
import https from 'https';

// Fetches a web page and extracts title / description / image for a chat link card.
// Because the server fetches whatever URL a user sends, this is built to be SSRF-safe:
// only http(s) on default-ish ports, every hostname is resolved first and refused if
// ANY address is private/loopback/link-local, the connection is pinned to the checked
// address (no second DNS lookup an attacker could change), redirects are followed by
// hand and re-checked, and time and size are capped.

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 4000;
// Whole lookup, redirects included, must finish well inside the app's request timeout.
const TOTAL_BUDGET_MS = 6000;
const MAX_REDIRECTS = 3;

export const isPrivateIp = (ip) => {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::' || v === '::1') return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') ||
      v.startsWith('fea') || v.startsWith('feb') || v.startsWith('ff');
  }
  return true; // not an IP we understand → refuse
};

const decodeEntities = (s) =>
  s
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

const metaContent = (html, keys) => {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const key of keys) {
    for (const tag of tags) {
      const name = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
      if (name !== key) continue;
      const content = tag.match(/\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'/i);
      const value = content?.[1] ?? content?.[2];
      if (value && value.trim()) return decodeEntities(value.trim());
    }
  }
  return null;
};

export const parsePreview = (html, pageUrl) => {
  const head = html.slice(0, MAX_BYTES);
  const titleTag = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = metaContent(head, ['og:title', 'twitter:title']) || (titleTag ? decodeEntities(titleTag.trim().replace(/\s+/g, ' ')) : null);
  const description = metaContent(head, ['og:description', 'twitter:description', 'description']);
  const siteName = metaContent(head, ['og:site_name']) || new URL(pageUrl).hostname.replace(/^www\./, '');
  let image = metaContent(head, ['og:image', 'og:image:url', 'twitter:image']);
  if (image) {
    try {
      const abs = new URL(image, pageUrl);
      image = abs.protocol === 'http:' || abs.protocol === 'https:' ? abs.toString() : null;
    } catch {
      image = null;
    }
  }
  if (!title && !description && !image) return null;
  return {
    url: pageUrl,
    title: title ? title.slice(0, 200) : null,
    description: description ? description.slice(0, 300) : null,
    image,
    siteName: siteName.slice(0, 80),
  };
};

// Vetted addresses, IPv4 first: serverless hosts (Vercel/AWS Lambda) often have no IPv6 route out,
// and Node returns DNS answers in resolver order, which can put an unreachable IPv6 address first.
export const orderAddresses = (addrs) => [...addrs].sort((a, b) => (a.family === b.family ? 0 : a.family === 4 ? -1 : 1));

const resolveSafe = async (hostname) => {
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new PreviewError('blocked address');
    return [{ address: hostname, family: net.isIPv6(hostname) ? 6 : 4 }];
  }
  let addrs;
  try {
    addrs = await dns.promises.lookup(hostname, { all: true });
  } catch (err) {
    throw new PreviewError(`dns ${err.code || err.message}`);
  }
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new PreviewError('blocked address');
  return orderAddresses(addrs);
};

export class PreviewError extends Error {}

// Makes the socket connect only to addresses we already vetted instead of resolving the name again.
// Node 20+ calls lookup with { all: true } and expects an array (it then races them); the older
// form expects a single (address, family).
export const makePinnedLookup = (addresses) => {
  const list = Array.isArray(addresses) ? addresses : [addresses];
  return (_host, opts, cb) => {
    const callback = typeof opts === 'function' ? opts : cb;
    const wantsAll = typeof opts === 'object' && opts !== null && opts.all;
    if (wantsAll) callback(null, list.map((a) => ({ address: a.address, family: a.family })));
    else callback(null, list[0].address, list[0].family);
  };
};

const requestOnce = (url, addresses, timeoutMs) =>
  new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    let settled = false;
    const done = (fn, v) => { if (!settled) { settled = true; clearTimeout(timer); fn(v); } };
    const req = lib.request(
      url,
      {
        method: 'GET',
        headers: {
          // Many sites only serve their preview tags to known link-preview crawlers.
          'User-Agent': 'Mozilla/5.0 (compatible; GroupThatLinkPreview/1.0; +https://groupthatapp.com) facebookexternalhit/1.1',
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
          'Accept-Encoding': 'identity',
          'Accept-Language': 'en-US,en;q=0.8',
        },
        lookup: makePinnedLookup(addresses),
      },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return done(resolve, { redirect: res.headers.location });
        }
        const type = String(res.headers['content-type'] || '');
        if (status < 200 || status >= 300) {
          res.resume();
          return done(reject, new PreviewError(`http ${status}`));
        }
        if (type && !/text\/html|application\/xhtml/i.test(type)) {
          res.resume();
          return done(reject, new PreviewError(`not html (${type.split(';')[0]})`));
        }
        let size = 0;
        const chunks = [];
        const finish = () => done(resolve, { body: Buffer.concat(chunks).toString('utf8') });
        res.on('data', (c) => {
          size += c.length;
          chunks.push(c);
          if (size >= MAX_BYTES) { finish(); res.destroy(); }
        });
        res.on('end', finish);
        res.on('error', () => (chunks.length ? finish() : done(reject, new PreviewError('read error'))));
      }
    );
    // Hard deadline for the whole request (connect + response), not just socket idle time.
    const timer = setTimeout(() => { req.destroy(); done(reject, new PreviewError('timeout')); }, timeoutMs);
    req.on('error', (err) => done(reject, new PreviewError(err.code || err.message)));
    req.end();
  });

export const normalizeUrl = (raw) => {
  let u;
  try {
    u = new URL(String(raw));
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  if (u.port && !['80', '443', '8080', '8443'].includes(u.port)) return null;
  return u;
};

/**
 * Returns the preview, or throws PreviewError with a short reason ("timeout", "http 403",
 * "no preview tags", "dns ENOTFOUND", ...) so failures show up in the logs.
 */
export const fetchPreview = async (rawUrl, { budgetMs = TOTAL_BUDGET_MS } = {}) => {
  let url = normalizeUrl(rawUrl);
  if (!url) throw new PreviewError('invalid url');
  const deadline = Date.now() + budgetMs;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new PreviewError('timeout');
    const addresses = await resolveSafe(url.hostname.replace(/^\[|\]$/g, ''));
    const out = await requestOnce(url, addresses, Math.min(TIMEOUT_MS, deadline - Date.now()));
    if (out.redirect) {
      const next = normalizeUrl(new URL(out.redirect, url).toString());
      if (!next) throw new PreviewError('bad redirect');
      url = next;
      continue;
    }
    const preview = out.body ? parsePreview(out.body, url.toString()) : null;
    if (!preview) throw new PreviewError('no preview tags');
    return preview;
  }
  throw new PreviewError('too many redirects');
};
