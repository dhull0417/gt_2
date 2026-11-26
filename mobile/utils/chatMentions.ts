// @mention helpers: typing suggestions, turning picked names into ids on send, and
// finding mentions in message text so the bubble can highlight them.
// Mentions are stored on the message as a list of Clerk user ids (messages.mentions);
// the visible text is just "@First Last".

export interface MentionMember {
  clerkId: string;
  name: string;
}

export interface ActiveMention {
  /** Index of the "@" in the text. */
  start: number;
  /** What has been typed after the "@" so far. */
  query: string;
}

const MAX_QUERY = 30;

/** The "@word" being typed at the cursor, if any. The "@" must start the text or follow whitespace. */
export function findActiveMention(text: string, cursor: number): ActiveMention | null {
  const upto = text.slice(0, cursor);
  const at = upto.lastIndexOf('@');
  if (at === -1) return null;
  if (at > 0 && !/\s/.test(upto[at - 1])) return null;
  const query = upto.slice(at + 1);
  if (query.length > MAX_QUERY || query.includes('\n') || query.includes('@')) return null;
  return { start: at, query };
}

/** Members whose name (or any word of it) starts with the query. Own account is excluded by the caller. */
export function filterMembers(members: MentionMember[], query: string, limit = 6): MentionMember[] {
  const q = query.trim().toLowerCase();
  const matches = members.filter((m) => {
    if (!q) return true;
    const name = m.name.toLowerCase();
    return name.startsWith(q) || name.split(/\s+/).some((w) => w.startsWith(q));
  });
  return matches.slice(0, limit);
}

/** Replace the "@query" being typed with "@Name " and report where the cursor should land. */
export function applyMention(
  text: string,
  active: ActiveMention,
  cursor: number,
  name: string
): { text: string; cursor: number } {
  const before = text.slice(0, active.start);
  const after = text.slice(cursor);
  const inserted = `@${name} `;
  return { text: before + inserted + after, cursor: before.length + inserted.length };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// "@Sam" must not match inside "@Samantha": the character after the name can't be a letter/digit.
const mentionRegex = (names: string[]) => {
  const sorted = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (sorted.length === 0) return null;
  return new RegExp(`(^|\\s)@(${sorted.map(escapeRe).join('|')})(?![\\p{L}\\p{N}])`, 'gu');
};

/** Clerk ids of the picked members whose "@Name" is still in the text when the message is sent. */
export function extractMentions(text: string, picked: MentionMember[]): string[] {
  const re = mentionRegex(picked.map((p) => p.name));
  if (!re) return [];
  const present = new Set<string>();
  for (const m of text.matchAll(re)) present.add(m[2]);
  const ids = new Set<string>();
  for (const p of picked) if (present.has(p.name)) ids.add(p.clerkId);
  return [...ids];
}

export interface MentionSegment {
  text: string;
  /** Set when this piece is an "@Name" to highlight. */
  mention?: string;
}

/** Splits text into plain pieces and "@Name" pieces for the given names. */
export function splitMentions(text: string, names: string[]): MentionSegment[] {
  const re = mentionRegex(names);
  if (!re || !text) return [{ text }];
  const out: MentionSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const lead = m[1].length;
    const start = (m.index ?? 0) + lead;
    const end = (m.index ?? 0) + m[0].length;
    if (start > last) out.push({ text: text.slice(last, start) });
    out.push({ text: text.slice(start, end), mention: m[2] });
    last = end;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out.length ? out : [{ text }];
}
