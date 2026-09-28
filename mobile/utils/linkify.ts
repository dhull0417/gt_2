// Splits chat text into plain / tappable segments (urls, emails, phones, street addresses).

export type LinkKind = 'url' | 'email' | 'phone' | 'address';
export interface Segment {
  text: string;
  kind: 'text' | LinkKind;
  // What to open/copy (normalized). Only set for link segments.
  value?: string;
}

const URL_RE = String.raw`(?:https?:\/\/|www\.)[^\s<>"]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|app|co|us|edu|gov|dev|me|ly|gg)\b(?:\/[^\s<>"]*)?`;
const EMAIL_RE = String.raw`[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}`;
const PHONE_RE = String.raw`(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b`;
const STREET_SUFFIX =
  'st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|ln|lane|way|ct|court|pl|place|pkwy|parkway|hwy|highway|cir|circle|trl|trail|ter|terrace';
// "123 N Main St", "4500 South State Street Apt 2, Salt Lake City, UT 84107"
const ADDRESS_RE = String.raw`\b\d{1,6}(?:\s+(?:[NSEW]|North|South|East|West|N\.|S\.|E\.|W\.))?(?:\s+[A-Za-z0-9.'-]+){1,4}?\s+(?:${STREET_SUFFIX})\b\.?(?:,?\s+(?:apt|suite|ste|unit|#)\s*[\w-]+)?(?:,?\s+[A-Za-z][A-Za-z .'-]{1,30},?\s+[A-Z]{2}\b(?:\s+\d{5}(?:-\d{4})?)?)?`;
// The master regex is case-insensitive, so "Salt La" could pass as a state; re-check the city/state tail case-sensitively.
const STREET_ONLY = new RegExp(`^\\d{1,6}(?:\\s+(?:[NSEW]|North|South|East|West|N\\.|S\\.|E\\.|W\\.))?(?:\\s+[A-Za-z0-9.'-]+){1,4}?\\s+(?:${STREET_SUFFIX})\\b\\.?(?:,?\\s+(?:apt|suite|ste|unit|#)\\s*[\\w-]+)?`, 'i');
const CITY_STATE_TAIL = /^,?\s+[A-Z][A-Za-z .'-]{1,30},?\s+[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/;

// Order matters: earlier alternatives win at the same position.
const MASTER = new RegExp(
  `(?<email>${EMAIL_RE})|(?<url>${URL_RE})|(?<address>${ADDRESS_RE})|(?<phone>${PHONE_RE})`,
  'gi'
);

const TRAILING_PUNCT = /[.,!?;:'")\]}]+$/;

function trimUrl(raw: string): string {
  let s = raw;
  // Drop trailing punctuation, but keep a ")" that balances a "(" inside the url.
  for (;;) {
    const m = s.match(TRAILING_PUNCT);
    if (!m) break;
    const last = s[s.length - 1];
    if (last === ')' && (s.match(/\(/g) || []).length >= (s.match(/\)/g) || []).length) break;
    s = s.slice(0, -1);
  }
  return s;
}

export function linkify(input: string): Segment[] {
  if (!input) return [];
  const out: Segment[] = [];
  let last = 0;
  MASTER.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MASTER.exec(input))) {
    let text = m[0];
    const g = m.groups || {};
    let kind: LinkKind = g.email ? 'email' : g.url ? 'url' : g.address ? 'address' : 'phone';
    if (kind === 'url') text = trimUrl(text);
    if (kind === 'address') {
      const core = STREET_ONLY.exec(text)?.[0];
      if (core && core.length < text.length && !CITY_STATE_TAIL.test(text.slice(core.length))) text = core;
      text = text.replace(/[.,]+$/, '');
    }
    if (!text) continue;
    // A bare-domain "url" glued to an email/word is not a link (e.g. "file.name.com" inside an email already handled).
    const start = m.index;
    if (start > last) out.push({ text: input.slice(last, start), kind: 'text' });

    let value = text;
    if (kind === 'url') value = /^https?:\/\//i.test(text) ? text : `https://${text}`;
    else if (kind === 'email') value = text;
    else if (kind === 'phone') value = text.replace(/[^\d+]/g, '');
    out.push({ text, kind, value });

    last = start + text.length;
    MASTER.lastIndex = last; // re-scan any trimmed trailing chars
  }
  if (last < input.length) out.push({ text: input.slice(last), kind: 'text' });
  return out;
}

export function hasLinks(input: string): boolean {
  return linkify(input).some((s) => s.kind !== 'text');
}
