import { buildInviteMessage } from '../inviteMessage';

const LINK = 'https://invite.groupthatapp.com/join/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';

describe('buildInviteMessage', () => {
  it('sends exactly one link, last', () => {
    const msg = buildInviteMessage({ link: LINK, groupName: 'Hikers', recipientFirstName: 'Sam' });
    expect(msg).toBe(`Hey Sam! Join my group "Hikers" on GroupThat 👉\n${LINK}`);
    expect(msg.match(/https?:\/\//g)).toHaveLength(1);
    expect(msg).not.toContain('/download');
  });
  it('puts the invite code on its own lines, with the link still last', () => {
    const msg = buildInviteMessage({ link: LINK, groupName: 'Hikers', code: 'K7P2QX', recipientFirstName: 'Sam' });
    expect(msg).toBe(`Hey Sam! Join my group "Hikers" on GroupThat!\n\nINVITE CODE:\n\nK7P2QX\n\n👉 ${LINK}`);
    expect(msg.endsWith(LINK)).toBe(true);
    const meetup = buildInviteMessage({ link: LINK, meetupName: 'Sat Hike', code: 'K7P2QX' });
    expect(meetup).toBe(`Join me for "Sat Hike" on GroupThat!\n\nINVITE CODE:\n\nK7P2QX\n\n👉 ${LINK}`);
  });
  it('sends an 8-character code without a space, so one tap selects all of it', () => {
    const msg = buildInviteMessage({ link: LINK, groupName: 'Hikers', code: 'K7P2QXMR' });
    expect(msg).toBe(`Join my group "Hikers" on GroupThat!\n\nINVITE CODE:\n\nK7P2QXMR\n\n👉 ${LINK}`);
  });
  it('leaves the code out when there is none', () => {
    expect(buildInviteMessage({ link: LINK, groupName: 'Hikers', code: null })).toBe(`Join my group "Hikers" on GroupThat 👉\n${LINK}`);
  });
  it('meetup invites carry the meetup and who shared it', () => {
    const msg = buildInviteMessage({ link: LINK, meetupName: 'Sat Hike', meetupId: '64b000000000000000000001', referrerId: '64b0000000000000000000ff' });
    expect(msg).toBe(`Join me for "Sat Hike" on GroupThat 👉\n${LINK}?m=64b000000000000000000001&r=64b0000000000000000000ff`);
  });
});
