import {
  parseInviteUrl, parseInstallReferrer, buildShareLink, normalizeInviteCode,
  encodePendingInvite, decodePendingInvite,
} from '../inviteLink';

const TOKEN = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
const MID = '64b000000000000000000001';
const UID = '64b0000000000000000000ff';

describe('parseInviteUrl', () => {
  it('reads the token, meetup, sharer and source from an invite link', () => {
    expect(parseInviteUrl(`https://invite.groupthatapp.com/join/${TOKEN}?m=${MID}&r=${UID}&s=qr`))
      .toEqual({ token: TOKEN, meetupId: MID, referrerId: UID, source: 'qr' });
    expect(parseInviteUrl(`https://invite.groupthatapp.com/join/${TOKEN}`)).toEqual({ token: TOKEN, meetupId: null, referrerId: null, source: null });
  });
  it('finds the link inside a whole copied invite message', () => {
    const msg = `Hey! Join my group "Hikers" on GroupThat 👉\nhttps://invite.groupthatapp.com/join/${TOKEN}?m=${MID}`;
    expect(parseInviteUrl(msg)?.meetupId).toBe(MID);
  });
  it('accepts the app scheme too', () => {
    expect(parseInviteUrl(`groupthat://join/${TOKEN}`)?.token).toBe(TOKEN);
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
      .toEqual({ token: TOKEN, meetupId: null, referrerId: null, source: null });
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

describe('normalizeInviteCode', () => {
  it('accepts codes typed in any case or with spaces/dashes', () => {
    expect(normalizeInviteCode(' k7p-2qx ')).toBe('K7P2QX');
    expect(normalizeInviteCode('K7P2QX')).toBe('K7P2QX');
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
