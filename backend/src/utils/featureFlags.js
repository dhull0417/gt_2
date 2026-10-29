// Server switches for changes that affect a whole group, and so everyone in it whatever app
// version they run. Each is OFF unless its env var is exactly "true", and off means the
// behaviour the live app (1.3.x) already has. Turn them on in Vercel (Production) once nearly
// everyone is on the new app; see claude/cutover-runbook in the project docs.
//
// Read at call time, so a changed env var takes effect on the next deploy/cold start and
// tests can set process.env directly.

const on = (name, env = process.env) => String(env?.[name] ?? '').trim().toLowerCase() === 'true';

export const flags = {
  /** Waitlist + auto-promotion only for Premium groups. Off: every group has a waitlist (as in 1.3.x). */
  premiumWaitlist: (env) => on('PREMIUM_WAITLIST_ENFORCED', env),
  /** Muting a group quiets all of its pushes. Off: a mute only quiets pushes about the group's next meetup (1.3.x). */
  muteAllPushes: (env) => on('MUTE_ALL_PUSHES_ENABLED', env),
  /** "Sam joined the group" lines in chat. Off: none are posted (1.3.x shows them as ordinary messages). */
  chatSystemMessages: (env) => on('CHAT_SYSTEM_MESSAGES_ENABLED', env),
  /** Separate Android channels for chat and reminders. Off: everything uses 'default', the only channel 1.3.x creates. */
  pushChannels: (env) => on('PUSH_CHANNELS_ENABLED', env),
};
