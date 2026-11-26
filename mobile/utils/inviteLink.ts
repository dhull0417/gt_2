// Invite links: https://invite.groupthatapp.com/join/<token>?m=<meetupId>&r=<sharerId>
// (or groupthat://join/<token>). Kept free of React Native imports so it can be unit tested.

export type InviteSource = 'link' | 'install_referrer' | 'clipboard' | 'code' | 'contact';

export type InviteRef = {
  token: string;
  meetupId: string | null;
  referrerId: string | null;
};

export type PendingInvite = { token: string; meetupId: string | null; source: InviteSource };

const TOKEN_RE = /^[A-Za-z0-9_-]{1,128}$/;
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;
// Same alphabet and lengths as the server (no 0/O, 1/I/L). Codes are 8 characters so they aren't
// confused with 6-digit verification codes; 6 is still accepted for codes made before the switch.
const CODE_RE = /^(?:[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}|[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6})$/;
const ORIGIN_RE = /^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/;
const escapeRe = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A dev/staging build can name its own invite server (EXPO_PUBLIC_INVITE_BASE_URL, same value as the
// server's INVITE_BASE_URL) so links it shares are recognised too. Production builds leave it unset.
const ENV_INVITE_HOSTS: string[] = (() => {
  const v = String(process.env.EXPO_PUBLIC_INVITE_BASE_URL ?? '').trim().replace(/\/+$/, '');
  return ORIGIN_RE.test(v) ? [v] : [];
})();

const linkRegex = (extraOrigins: string[]) => {
  const origins = ['https://invite.groupthatapp.com', ...extraOrigins.filter((o) => ORIGIN_RE.test(o))].map(escapeRe);
  return new RegExp(`(?:${origins.join('|')}|groupthat:\\/)\\/join\\/([A-Za-z0-9_-]{1,128})(\\?[^\\s#]*)?(?=$|[\\s#"'<>)\\]])`);
};
const SOURCES: InviteSource[] = ['link', 'install_referrer', 'clipboard', 'code', 'contact'];

const queryParams = (query: string | undefined): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const part of (query ?? '').replace(/^\?/, '').split('&')) {
    if (!part) continue;
    const [k, ...rest] = part.split('=');
    try { out[decodeURIComponent(k)] = decodeURIComponent(rest.join('=')); } catch { /* skip malformed */ }
  }
  return out;
};

/** Finds a GroupThat invite link in some text (a link, or a whole copied message). */
export function parseInviteUrl(text: string | null | undefined, extraOrigins: string[] = ENV_INVITE_HOSTS): InviteRef | null {
  if (!text) return null;
  const match = linkRegex(extraOrigins).exec(String(text));
  if (!match) return null;
  const q = queryParams(match[2]);
  return {
    token: match[1],
    meetupId: OBJECT_ID_RE.test(q.m ?? '') ? q.m : null,
    referrerId: OBJECT_ID_RE.test(q.r ?? '') ? q.r : null,
  };
}

/** Google Play install referrer ("gt_invite=<token>&gt_m=<meetupId>"), sometimes still URL-encoded. */
export function parseInstallReferrer(referrer: string | null | undefined): { token: string; meetupId: string | null } | null {
  if (!referrer) return null;
  let raw = String(referrer);
  if (!raw.includes('gt_invite=') && raw.includes('gt_invite%3D')) {
    try { raw = decodeURIComponent(raw); } catch { return null; }
  }
  const q = queryParams(raw);
  if (!q.gt_invite || !TOKEN_RE.test(q.gt_invite)) return null;
  return { token: q.gt_invite, meetupId: OBJECT_ID_RE.test(q.gt_m ?? '') ? q.gt_m : null };
}

/** The link that goes in a share message: the group link plus the meetup and who shared it. */
export function buildShareLink(link: string, opts: { meetupId?: string | null; referrerId?: string | null }): string {
  const params: string[] = [];
  if (opts.meetupId) params.push(`m=${encodeURIComponent(opts.meetupId)}`);
  if (opts.referrerId) params.push(`r=${encodeURIComponent(opts.referrerId)}`);
  if (params.length === 0) return link;
  return `${link}${link.includes('?') ? '&' : '?'}${params.join('&')}`;
}

/** "k7p2-qxmr" -> "K7P2QXMR"; null when it can't be an invite code. */
export function normalizeInviteCode(input: string | null | undefined): string | null {
  const code = String(input ?? '').toUpperCase().replace(/[\s-]/g, '');
  return CODE_RE.test(code) ? code : null;
}

export const isInviteCode = (s: string) => normalizeInviteCode(s) !== null;

const LABELLED_CODE_RE = /INVITE\s*CODE\s*:?\s*([A-Za-z0-9]{4}[\s-]?[A-Za-z0-9]{4}|[A-Za-z0-9]{3}-?[A-Za-z0-9]{3})(?![A-Za-z0-9])/i;

/** Finds an invite code in whatever was pasted: just the code, or a whole (or partly) copied invite
 *  message. Looks for the code after "INVITE CODE:", then for a line that is only an 8-character code.
 *  Loose words elsewhere in the text are never taken as a code. */
export function findInviteCode(text: string | null | undefined): string | null {
  const raw = String(text ?? '');
  const whole = normalizeInviteCode(raw);
  if (whole) return whole;
  const labelled = LABELLED_CODE_RE.exec(raw);
  if (labelled) {
    const code = normalizeInviteCode(labelled[1]);
    if (code) return code;
  }
  for (const line of raw.split(/\r?\n/)) {
    const code = normalizeInviteCode(line);
    if (code && code.length === 8) return code;
  }
  return null;
}

/** "K7P2QXMR" -> "K7P2 QXMR" for display, so it reads less like a 6-digit verification code.
 *  The space is ignored when the code is typed back in. Older 6-character codes are left as-is. */
export function formatInviteCode(code: string | null | undefined): string {
  const c = String(code ?? '');
  return c.length === 8 ? `${c.slice(0, 4)} ${c.slice(4)}` : c;
}

export function encodePendingInvite(p: PendingInvite): string {
  return JSON.stringify({ token: p.token, meetupId: p.meetupId ?? null, source: p.source });
}

/** Reads what encodePendingInvite saved, or the plain token that builds before 1.5 saved. */
export function decodePendingInvite(value: string | null | undefined): PendingInvite | null {
  if (!value) return null;
  if (TOKEN_RE.test(value)) return { token: value, meetupId: null, source: 'link' };
  try {
    const p = JSON.parse(value);
    if (!p || typeof p.token !== 'string' || !TOKEN_RE.test(p.token)) return null;
    return {
      token: p.token,
      meetupId: typeof p.meetupId === 'string' && OBJECT_ID_RE.test(p.meetupId) ? p.meetupId : null,
      source: SOURCES.includes(p.source) ? p.source : 'link',
    };
  } catch {
    return null;
  }
}
