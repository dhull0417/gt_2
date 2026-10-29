const DOWNLOAD_URL = 'https://invite.groupthatapp.com/download';

/** The one invite text used everywhere (group details, create group, add members, meetup sheet). */
export function buildInviteMessage(opts: { link: string; groupName?: string; meetupName?: string; recipientFirstName?: string }): string {
  const hello = opts.recipientFirstName ? `Hey ${opts.recipientFirstName}! ` : '';
  const lead = opts.meetupName
    ? `${hello}Join me for "${opts.meetupName}" on GroupThat!`
    : `${hello}Join my group "${opts.groupName ?? ''}" on GroupThat!`;
  return `${lead}\n\nSTEP 1 — Download the app:\n→ ${DOWNLOAD_URL}\n\nSTEP 2 — Join the group:\n→ ${opts.link}`;
}
