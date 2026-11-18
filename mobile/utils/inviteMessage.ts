import { buildShareLink } from './inviteLink';

/**
 * The one invite text used everywhere (group details, create group, add members, meetup sheet,
 * invite link screen). One link: it opens the app when installed, otherwise the right store,
 * and the invite survives the install. The link goes last so iMessage/WhatsApp show a preview card.
 */
export function buildInviteMessage(opts: {
  link: string;
  groupName?: string;
  meetupName?: string;
  meetupId?: string | null;
  referrerId?: string | null;
  recipientFirstName?: string;
}): string {
  const hello = opts.recipientFirstName ? `Hey ${opts.recipientFirstName}! ` : '';
  const lead = opts.meetupName
    ? `${hello}Join me for "${opts.meetupName}" on GroupThat 👉`
    : `${hello}Join my group "${opts.groupName ?? ''}" on GroupThat 👉`;
  const link = buildShareLink(opts.link, { meetupId: opts.meetupId, referrerId: opts.referrerId });
  return `${lead}\n${link}`;
}
