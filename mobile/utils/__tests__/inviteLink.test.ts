import {
  parseInviteUrl, parseInstallReferrer, buildShareLink, normalizeInviteCode, formatInviteCode, findInviteCode,
  encodePendingInvite, decodePendingInvite,
} from '../inviteLink';

const TOKEN = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
const MID = '64b000000000000000000001';
const UID = '64b0000000000000000000ff';

describe('parseInviteUrl', () => {
  it('reads the token, meetup, sharer and source from an invite link', () => {
    expect(parseInviteUrl(`https://invite.groupthatapp.com/join/${TOKEN}?m=${MID}&r=${UID}`))
      .toEqual({ token: TOKEN, meetupId: MID, referrerId: UID });
    expect(parseInviteUrl(`https://invite.groupthatapp.com/join/${TOKEN}`)).toEqual({ token: TOKEN, meetupId: null, referrerId: null });
  });
  it('finds the link inside a whole copied invite message', () => {
    const msg = `Hey! Join my group "Hikers" on GroupThat 👉\nhttps://invite.groupthatapp.com/join/${TOKEN}?m=${MID}`;
    expect(parseInviteUrl(msg)?.meetupId).toBe(MID);
  });
  it('accepts the app scheme too', () => {
    expect(parseInviteUrl(`groupthat://join/${TOKEN}`)?.token).toBe(TOKEN);
  });
  it('also accepts links from an extra invite server (staging) when the build names one', () => {
    const staging = 'https://gt-2-git-staging-x.vercel.app';
    expect(parseInviteUrl(`${staging}/join/${TOKEN}?m=${MID}`, [staging])).toEqual({ token: TOKEN, meetupId: MID, referrerId: null });
    expect(parseInviteUrl(`${staging}/join/${TOKEN}`)).toBeNull(); // not configured
    expect(parseInviteUrl(`https://evil.example/join/${TOKEN}`, [staging])).toBeNull();
    expect(parseInviteUrl(`https://invite.groupthatapp.com/join/${TOKEN}`, [staging])?.token).toBe(TOKEN);
  });
  it('ignores anything that is not a GroupThat invite', () => {
    expect(parseInviteUrl('https://example.com/join/abc')).toBeNull();
    expect(parseInviteUrl('https://invite.groupthatapp.com.evil.com/join/abc')).toBeNull();
    expect(parseInviteUrl('https://invite.groupthatapp.com/go/premium')).toBeNull();
    expect(parseInviteUrl('my password is hunter2')).toBeNull();
    expect(parseInviteUrl('')).toBeNull();
    expect(parseInviteUrl(null)).toBeNull();
  });
  it('drops query values that are not ids', () => {
    expect(parseInviteUrl(`https://invite.groupthatapp.com/join/${TOKEN}?m=<script>&r=x&s=weird`))
      .toEqual({ token: TOKEN, meetupId: null, referrerId: null });
  });
});

describe('parseInstallReferrer', () => {
  it('reads what the invite page put in the Play Store link', () => {
    expect(parseInstallReferrer(`gt_invite=${TOKEN}&gt_m=${MID}`)).toEqual({ token: TOKEN, meetupId: MID });
    expect(parseInstallReferrer(encodeURIComponent(`gt_invite=${TOKEN}`))).toEqual({ token: TOKEN, meetupId: null });
  });
  it('returns null for organic installs and junk', () => {
    expect(parseInstallReferrer('utm_source=google-play&utm_medium=organic')).toBeNull();
    expect(parseInstallReferrer('')).toBeNull();
    expect(parseInstallReferrer(undefined)).toBeNull();
    expect(parseInstallReferrer('gt_invite=bad token!')).toBeNull();
  });
});

describe('buildShareLink', () => {
  it('adds the meetup and who shared it', () => {
    const link = `https://invite.groupthatapp.com/join/${TOKEN}`;
    expect(buildShareLink(link, {})).toBe(link);
    expect(buildShareLink(link, { meetupId: MID, referrerId: UID })).toBe(`${link}?m=${MID}&r=${UID}`);
    expect(buildShareLink(link, { referrerId: UID })).toBe(`${link}?r=${UID}`);
  });
});

describe('formatInviteCode', () => {
  it('splits an 8-character code in two, and the result types back in', () => {
    expect(formatInviteCode('K7P2QXMR')).toBe('K7P2 QXMR');
    expect(normalizeInviteCode(formatInviteCode('K7P2QXMR'))).toBe('K7P2QXMR');
    expect(formatInviteCode('K7P2QX')).toBe('K7P2QX');
    expect(formatInviteCode(null)).toBe('');
  });
});

describe('normalizeInviteCode', () => {
  it('accepts codes typed in any case or with spaces/dashes', () => {
    expect(normalizeInviteCode(' k7p2-qxmr ')).toBe('K7P2QXMR');
    expect(normalizeInviteCode('K7P2QXMR')).toBe('K7P2QXMR');
    // 6-character codes made before the switch to 8 still work.
    expect(normalizeInviteCode(' k7p-2qx ')).toBe('K7P2QX');
    expect(normalizeInviteCode('K7P2QXM')).toBeNull();
    expect(normalizeInviteCode('K7P2QXMRA')).toBeNull();
    expect(normalizeInviteCode('123456')).toBeNull();
  });
  it('rejects codes with characters the server never uses', () => {
    expect(normalizeInviteCode('K7P2Q0')).toBeNull();
    expect(normalizeInviteCode('K7P2Q')).toBeNull();
    expect(normalizeInviteCode('')).toBeNull();
  });
});

describe('pending invite storage format', () => {
  it('round-trips token, meetup and source', () => {
    const v = { token: TOKEN, meetupId: MID, source: 'clipboard' as const };
    expect(decodePendingInvite(encodePendingInvite(v))).toEqual(v);
  });
  it('still reads the plain token older builds saved', () => {
    expect(decodePendingInvite(TOKEN)).toEqual({ token: TOKEN, meetupId: null, source: 'link' });
  });
  it('returns null for nothing or garbage', () => {
    expect(decodePendingInvite(null)).toBeNull();
    expect(decodePendingInvite('{"token":"has space"}')).toBeNull();
  });
});

describe('findInviteCode', () => {
  const MSG = 'Hey Sam! Join my group "Hikers" on GroupThat!\n\nINVITE CODE:\n\nK7P2QXMR\n\n👉 https://invite.groupthatapp.com/join/abc';
  it('reads just the code, however it was typed', () => {
    expect(findInviteCode(' k7p2 qxmr ')).toBe('K7P2QXMR');
    expect(findInviteCode('K7P2QX')).toBe('K7P2QX');
  });
  it('finds the code in a whole pasted invite message', () => {
    expect(findInviteCode(MSG)).toBe('K7P2QXMR');
    expect(findInviteCode(MSG.replace('K7P2QXMR', 'K7P2 QXMR'))).toBe('K7P2QXMR');
    expect(findInviteCode('INVITE CODE:\n\nK7P2QX\n\nhttps://x')).toBe('K7P2QX');
  });
  it('finds the code in part of a message that lost its label', () => {
    expect(findInviteCode('on GroupThat!\n\nK7P2QXMR\n\n👉')).toBe('K7P2QXMR');
  });
  it('does not take ordinary words as a code', () => {
    expect(findInviteCode('Join me for brunch on GroupThat')).toBeNull();
    expect(findInviteCode('Join me for "BRUNCH"')).toBeNull();
    expect(findInviteCode('INVITE CODE: 123456')).toBeNull();
    expect(findInviteCode('')).toBeNull();
    expect(findInviteCode(null)).toBeNull();
  });
});
