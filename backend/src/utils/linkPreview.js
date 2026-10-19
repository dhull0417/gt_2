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

const resolveSafe = async (hostname) => {
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error('blocked address');
    return { address: hostname, family: net.isIPv6(hostname) ? 6 : 4 };
  }
  const addrs = await dns.promises.lookup(hostname, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error('blocked address');
  return addrs[0];
};

const requestOnce = (url, pinned) =>
  new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      url,
      {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; GroupThatLinkPreview/1.0)',
          Accept: 'text/html,application/xhtml+xml',
        },
        // Pin the connection to the address we already vetted.
        lookup: (_host, _opts, cb) => cb(null, pinned.address, pinned.family),
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ redirect: res.headers.location });
        }
        const type = String(res.headers['content-type'] || '');
        if (status !== 200 || !/text\/html|application\/xhtml/i.test(type)) {
          res.resume();
          return resolve({ body: null });
        }
        let size = 0;
        const chunks = [];
        res.on('data', (c) => {
          size += c.length;
          chunks.push(c);
          if (size >= MAX_BYTES) {
            res.destroy();
            resolve({ body: Buffer.concat(chunks).toString('utf8') });
          }
        });
        res.on('end', () => resolve({ body: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', () => resolve({ body: chunks.length ? Buffer.concat(chunks).toString('utf8') : null }));
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
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

export const fetchPreview = async (rawUrl) => {
  let url = normalizeUrl(rawUrl);
  if (!url) return null;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const pinned = await resolveSafe(url.hostname.replace(/^\[|\]$/g, ''));
    const out = await requestOnce(url, pinned);
    if (out.redirect) {
      const next = normalizeUrl(new URL(out.redirect, url).toString());
      if (!next) return null;
      url = next;
      continue;
    }
    return out.body ? parsePreview(out.body, url.toString()) : null;
  }
  return null;
};
