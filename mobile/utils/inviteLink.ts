// Invite links: https://invite.groupthatapp.com/join/<token>?m=<meetupId>&r=<sharerId>&s=qr
// (or groupthat://join/<token>). Kept free of React Native imports so it can be unit tested.

export type InviteSource = 'link' | 'install_referrer' | 'clipboard' | 'code' | 'qr' | 'contact';

export type InviteRef = {
  token: string;
  meetupId: string | null;
  referrerId: string | null;
  source: 'qr' | null;
};

export type PendingInvite = { token: string; meetupId: string | null; source: InviteSource };

const TOKEN_RE = /^[A-Za-z0-9_-]{1,128}$/;
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;
// Same alphabet as the server (no 0/O, 1/I/L).
const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const LINK_RE = /(?:https:\/\/invite\.groupthatapp\.com|groupthat:\/)\/join\/([A-Za-z0-9_-]{1,128})(\?[^\s#]*)?(?=$|[\s#"'<>)\]])/;
const SOURCES: InviteSource[] = ['link', 'install_referrer', 'clipboard', 'code', 'qr', 'contact'];

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
export function parseInviteUrl(text: string | null | undefined): InviteRef | null {
  if (!text) return null;
  const match = LINK_RE.exec(String(text));
  if (!match) return null;
  const q = queryParams(match[2]);
  return {
    token: match[1],
    meetupId: OBJECT_ID_RE.test(q.m ?? '') ? q.m : null,
    referrerId: OBJECT_ID_RE.test(q.r ?? '') ? q.r : null,
    source: q.s === 'qr' ? 'qr' : null,
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

/** "k7p-2qx" -> "K7P2QX"; null when it can't be an invite code. */
export function normalizeInviteCode(input: string | null | undefined): string | null {
  const code = String(input ?? '').toUpperCase().replace(/[\s-]/g, '');
  return CODE_RE.test(code) ? code : null;
}

export const isInviteCode = (s: string) => normalizeInviteCode(s) !== null;

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
