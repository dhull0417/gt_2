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
  /** The 6-character code, for anyone whose link doesn't carry through the install. */
  code?: string | null;
}): string {
  const hello = opts.recipientFirstName ? `Hey ${opts.recipientFirstName}! ` : '';
  const what = opts.meetupName
    ? `${hello}Join me for "${opts.meetupName}" on GroupThat`
    : `${hello}Join my group "${opts.groupName ?? ''}" on GroupThat`;
  const link = buildShareLink(opts.link, { meetupId: opts.meetupId, referrerId: opts.referrerId });
  if (!opts.code) return `${what} 👉\n${link}`;
  return `${what}!\n\nINVITE CODE:\n\n${opts.code}\n\n👉 ${link}`;
}
