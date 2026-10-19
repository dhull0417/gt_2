// Copy for the seven lifecycle emails (GroupThat Emails V1).
// Each template is a list of blocks so one definition renders both the HTML and
// plain-text versions. `**bold**` is the only inline markup.
//
// ctx: { firstName, organizerName?, groupName?, price, urls: { meetups, open, createGroup, shareInvite, premium } }

// Shown in upgrade emails. Override with EMAIL_PRICE_TEXT when store prices change (no deploy of copy needed).
export const PRICE_TEXT = process.env.EMAIL_PRICE_TEXT?.trim() || "$4.99 per month or $39.99 per year";

const T = {
  U1: (c) => ({
    subject: "Welcome! Let's get you in (or out).",
    preheader: "The whole app is basically two buttons. Here's how they work.",
    marketing: false,
    blocks: [
      { p: `Hey ${c.firstName},` },
      { p: "Welcome to GroupThat, the app for the stuff your people do on repeat: pickup games, book club, family dinner, game night." },
      ...(c.organizerName && c.groupName
        ? [{ p: `${c.organizerName} added you to ${c.groupName}, so you're already set.` }]
        : []),
      { p: "Here's how it works:" },
      { ol: [
        "An invite shows up before each meetup.",
        "Tap **I'm In** or **I'm Out**. That's it. Seriously.",
        "Everyone sees the live headcount, so nobody has to scroll a group chat to figure out who's coming.",
      ] },
      { p: "No more \"wait, are we still on?\" texts." },
      { button: ["See my meetups", c.urls.meetups] },
      { p: "See you there,<br>The GroupThat crew", raw: true },
    ],
  }),

  U2: (c) => ({
    subject: "Two moves that make you a great group member",
    preheader: "Bringing a friend? Sitting one out? We've got you.",
    marketing: false,
    blocks: [
      { p: `Hey ${c.firstName},` },
      { p: "You know the two big buttons. Here are two little ones everyone will thank you for:" },
      { p: "**Bringing someone?** Tap the **+** next to I'm In to add a guest. The organizer gets the real headcount, and nobody runs out of chairs." },
      { p: "**Sitting this one out?** Tap the **bell** next to I'm Out to mute the group until the next meetup. The chatter goes quiet, and we'll turn notifications back on when the next invite shows up." },
      { p: "That's it. You're officially great at this." },
      { button: ["Open GroupThat", c.urls.open] },
    ],
  }),

  U3: (c) => ({
    subject: "Quick question: what do you do on repeat?",
    preheader: "Pickleball, board games, Sunday dinner... sounds like a group to us.",
    marketing: true,
    blocks: [
      { p: `Hey ${c.firstName},` },
      { p: "Here's a little secret: GroupThat isn't just for joining groups. Anyone can start one, and it takes about two minutes." },
      { p: "If you've ever texted \"who's in?\" more than once, there's a group hiding somewhere in your life. A few we see all the time:" },
      { ul: [
        "**Family:** Sunday dinner, cousins' night, the grandparents' visit rotation",
        "**Sports:** pickleball, pickup basketball, the Saturday morning run",
        "**Games:** board game night, poker, a D&D campaign",
        "**Friends:** book club, double date night, the monthly taco crawl",
        "**Community:** ward or church activities, a small group, volunteer shifts",
      ] },
      { p: "Pick one. Set the schedule once. GroupThat sends the invites and counts the heads every single time." },
      { button: ["Start a group", c.urls.createGroup] },
    ],
  }),

  U4: (c) => ({
    subject: "Your first group, in 3 steps",
    preheader: "Then we'll stop bugging you. Promise.",
    marketing: true,
    blocks: [
      { p: `Hey ${c.firstName},` },
      { p: "Thinking about starting a group but not sure where to begin? Here's the whole thing:" },
      { ol: [
        "**Name it and pick a schedule.** \"Thursday Pickleball, every Thursday at 6:30.\" Done.",
        "**Choose when RSVPs open.** Say, two days before. Invites go out on their own after that.",
        "**Share your invite link** in the group text you already have. Consider it that text's final job.",
      ] },
      { p: "After that, you'll always know who's coming without asking once." },
      { button: ["Start my first group", c.urls.createGroup] },
      { p: "This is our last nudge on this one. Whenever you're ready, the Create Group button lives on your Groups tab.", small: true },
    ],
  }),

  O1: (c) => ({
    subject: "You made a group! Now let's fill it.",
    preheader: "One link is all it takes to get your people in.",
    marketing: false,
    blocks: [
      { p: `Hey ${c.firstName},` },
      { p: `Look at you, organizer. ${c.groupName || "Your group"} is officially on GroupThat.` },
      { p: "Here's what happens next:" },
      { ol: [
        "**Share your invite link.** Paste it in your group text with something like: \"Moving our RSVPs here so I can stop asking who's in.\"",
        "**Invites go out on their own** on the schedule you set.",
        "**Watch the headcount fill in.** In, out, and guests, all live. No chasing.",
      ] },
      { button: ["Share my invite link", c.urls.shareInvite] },
      { p: "**Tip:** add a group photo. It shows up on every invite and makes your group look extra legit." },
    ],
  }),

  O2: (c) => ({
    subject: "Your next group is hiding in plain sight",
    preheader: "Spoiler: you're probably herding more than one crew.",
    marketing: true,
    blocks: [
      { p: `Hey ${c.firstName},` },
      { p: "Once one group runs itself, you start noticing all the others still running on texts and vibes. Need a little inspiration?" },
      { ul: [
        "**Family:** the monthly extended-family dinner, holiday planning crew, kids' cousin playdates",
        "**Sports:** the youth team carpool, golf foursome, gym buddies",
        "**Games:** trivia night team, Mario Kart tournament, the video game squad",
        "**Friends:** girls' night, guys' night, the supper club",
        "**Community:** the neighborhood walking group, the service project crew, the ward activity that always lands on you",
      ] },
      { p: "Same two-minute setup. Same one-tap RSVPs. Even fewer group texts." },
      { button: ["Start another group", c.urls.createGroup] },
    ],
  }),

  O3: (c) => ({
    subject: "Meet Premium: organizer superpowers",
    preheader: "Everything you use today stays free. This is the bonus round.",
    marketing: true,
    blocks: [
      { p: `Hey ${c.firstName},` },
      { p: "Quick reassurance first: everything you and your members use today stays free." },
      { p: "Premium is for organizers who want a little extra control:" },
      { ul: [
        "**Waitlist.** When your group fills up, extra people get in line, and the next one gets the spot automatically when someone drops.",
        "**Regulars first.** Let your most loyal members RSVP before invites open to everyone.",
        "**Assignments.** Who's bringing snacks, who's driving, who's got the ball.",
        "**Custom reaction cards.** Write your own \"Bold. Correct. Iconic.\"",
        "**Group stats.** Finally find out who actually shows up.",
      ] },
      { p: `All of it for ${c.price}.` },
      { button: ["See Premium", c.urls.premium] },
    ],
  }),
};

export const EMAIL_KEYS = Object.keys(T);

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
// escape first, then turn **x** into <strong>
const inline = (s, raw) => (raw ? s : esc(s)).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
const plain = (s) => String(s).replace(/<br>/g, "\n").replace(/\*\*(.+?)\*\*/g, "$1");

const BRAND = "#4A90E2";

/**
 * @param {string} key  U1..O3
 * @param {object} ctx  see top of file, plus { logoUrl, unsubscribeUrl?, postalAddress? }
 * @returns {{subject, html, text, marketing}}
 */
export const renderEmail = (key, ctx) => {
  const def = T[key]?.({ ...ctx, firstName: ctx.firstName || "there", price: ctx.price || PRICE_TEXT });
  if (!def) throw new Error(`Unknown lifecycle email key: ${key}`);

  const body = def.blocks.map((b) => {
    if (b.p) return `<p style="margin:0 0 16px;font-size:${b.small ? 13 : 16}px;line-height:1.55;color:${b.small ? "#6B7280" : "#111827"};">${inline(b.p, b.raw)}</p>`;
    if (b.ol) return `<ol style="margin:0 0 16px;padding-left:22px;font-size:16px;line-height:1.55;color:#111827;">${b.ol.map((i) => `<li style="margin-bottom:8px;">${inline(i)}</li>`).join("")}</ol>`;
    if (b.ul) return `<ul style="margin:0 0 16px;padding-left:22px;font-size:16px;line-height:1.55;color:#111827;">${b.ul.map((i) => `<li style="margin-bottom:8px;">${inline(i)}</li>`).join("")}</ul>`;
    if (b.button) return `<p style="margin:24px 0;"><a href="${esc(b.button[1])}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 28px;border-radius:12px;">${esc(b.button[0])}</a></p>`;
    return "";
  }).join("\n");

  const footer = def.marketing
    ? `<p style="margin:0;font-size:12px;line-height:1.5;color:#9CA3AF;">You're getting this because you have a GroupThat account.<br><a href="${esc(ctx.unsubscribeUrl)}" style="color:#9CA3AF;">Unsubscribe</a> from tips like this (we'll still send messages about your meetups).<br>${esc(ctx.postalAddress)}</p>`
    : `<p style="margin:0;font-size:12px;line-height:1.5;color:#9CA3AF;">You're getting this because you have a GroupThat account.</p>`;

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(def.subject)}</title></head>
<body style="margin:0;padding:0;background:#F3F4F6;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(def.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<tr><td style="padding:28px 32px 8px;"><img src="${esc(ctx.logoUrl)}" alt="GroupThat" height="40" style="height:40px;border:0;"></td></tr>
<tr><td style="padding:16px 32px 28px;">
${body}
</td></tr>
<tr><td style="padding:0 32px 28px;">${footer}</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    ...def.blocks.map((b) => {
      if (b.p) return plain(b.p);
      if (b.ol) return b.ol.map((i, n) => `${n + 1}. ${plain(i)}`).join("\n");
      if (b.ul) return b.ul.map((i) => `- ${plain(i)}`).join("\n");
      if (b.button) return `${b.button[0]}: ${b.button[1]}`;
      return "";
    }),
    def.marketing ? `Unsubscribe from tips like this: ${ctx.unsubscribeUrl}\n${ctx.postalAddress || ""}` : "",
  ].filter(Boolean).join("\n\n");

  return { subject: def.subject, html, text, marketing: def.marketing };
};
