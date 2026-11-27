interface Screen {
  readonly name: string;
  readonly hash: string;
  readonly click?: string;
  readonly clickIn?: string;
  readonly send?: string;
  readonly fill?: readonly (readonly [label: string, value: string])[];
  readonly attach?: "pending" | "refused";
  readonly focus?: string;
  readonly press?: string;
  readonly text: string;
  readonly narrow?: boolean;
  readonly admin?: boolean;
  readonly liveDown?: boolean;
  readonly noPresence?: boolean;
  readonly daysLater?: number;
  readonly history?: "more" | "loading";
}

const NUDGE_TEXT = "Quiet for 3 days: close it, or follow up?";
const OFFER_TEXT = "has had no activity for 30 days.";
const DEACTIVATED_TEXT = "@triage-agent was deactivated after 90 days with no activity.";

const SCREENS: readonly Screen[] = [
  { hash: "#/inbox", name: "inbox", text: "Thanks, both of you." },
  { hash: "#/inbox", history: "more", name: "inbox-more", text: "Show earlier" },
  { daysLater: 3, hash: "#/inbox", name: "inbox-nudge", text: NUDGE_TEXT },
  { admin: true, daysLater: 30, hash: "#/inbox", name: "inbox-offer", text: OFFER_TEXT },
  { daysLater: 90, hash: "#/inbox", name: "inbox-deactivated", text: DEACTIVATED_TEXT },
  { click: "Show earlier", hash: "#/inbox", history: "loading", name: "inbox-loading", text: "Loading…" },
  {
    click: "More actions",
    clickIn: 'main li:has(a[data-feed-row][href^="#/inbox/general/1/"])',
    focus: 'main a[data-feed-row][href^="#/inbox/general/1/"]',
    hash: "#/inbox",
    name: "inbox-row-menu",
    text: "Open in channel",
  },
  {
    focus: 'a[data-feed-row][aria-current="page"]',
    hash: "#/inbox/general/1",
    name: "inbox-thread",
    text: "Thanks, both of you.",
  },
  { hash: "#/inbox/general/1", name: "inbox-narrow", narrow: true, text: "earlier replies" },
  { hash: "#/inbox/deploys", name: "inbox-channel", text: "Deployed 1.4.0." },
  {
    click: "Mark conversation read",
    clickIn: 'aside[aria-label="Conversation"]',
    hash: "#/inbox/general/1",
    name: "inbox-marked",
    text: "Marked as read",
  },
  { hash: "#/channels/general", name: "channel", text: "Lunch at 12:30." },
  { hash: "#/channels/general", name: "titled-thread", text: "Flaky login test" },
  {
    focus: 'article:has-text("Lunch at 12:30.")',
    hash: "#/channels/general",
    name: "channel-hover",
    text: "Lunch at 12:30.",
  },
  { hash: "#/channels/design", name: "attachments", text: "The view from the office, and my notes." },
  { click: "hills.png", hash: "#/channels/design", name: "attachment-full", text: "1.2 KB" },
  { attach: "pending", hash: "#/channels/design", name: "composer-files", text: "notes.txt" },
  { attach: "refused", hash: "#/channels/design", name: "composer-refusal", text: "Couldn't attach dump.bin" },
  {
    click: "More actions",
    clickIn: 'article:has-text("Lunch at 12:30.")',
    focus: 'article:has-text("Lunch at 12:30.")',
    hash: "#/channels/general",
    name: "message-menu",
    text: "Mark unread",
  },
  {
    click: "More actions",
    clickIn: 'nav li:has(a[href="#/channels/deploys"])',
    focus: 'nav a[href="#/channels/deploys"]',
    hash: "#/channels/general",
    name: "channel-menu",
    text: "Mark all as read",
  },
  {
    click: "@grace actions",
    clickIn: 'article:has-text("Lunch at 12:30.") header',
    focus: 'article:has-text("Lunch at 12:30.") header a',
    hash: "#/channels/general",
    name: "person-menu",
    text: "Copy name",
  },
  { hash: "#/channels/general/threads/1", name: "thread", text: "Thanks, both of you." },
  {
    click: "More actions",
    clickIn: 'aside[aria-label="Thread"] header',
    focus: 'aside[aria-label="Thread"] header h2[tabindex="0"]',
    hash: "#/channels/general/threads/1",
    name: "thread-menu",
    text: "Copy link",
  },
  {
    focus: 'article:has-text("@triage-agent can you post the failing run?") time',
    hash: "#/channels/general/threads/1",
    name: "receipt",
    text: "Not seen yet:",
  },
  {
    focus: 'article:has-text("@triage-agent can you post the failing run?") a:has-text("@triage-agent")',
    hash: "#/channels/general/threads/1",
    name: "identity-card",
    text: "Open session",
  },
  {
    focus: 'article:has-text("@grace can you check the notes before we ship?") a:has-text("@grace")',
    hash: "#/channels/general",
    name: "identity-card-person",
    text: "View profile",
  },
  {
    focus: 'article:has-text("Deployed 1.4.0.") header a',
    hash: "#/channels/deploys",
    name: "identity-card-deactivated",
    text: "View profile",
  },
  {
    focus: 'article:has-text("Picked up the 1.4.1 build.") header a',
    hash: "#/channels/deploys",
    name: "identity-card-brought-in",
    text: "Brought in by",
  },
  {
    focus: 'article:has-text("@grace can you check the notes before we ship?") a:has-text("@grace")',
    hash: "#/channels/general",
    name: "identity-card-no-presence",
    noPresence: true,
    text: "View profile",
  },
  { hash: "#/people", name: "people", text: "release-bot" },
  { hash: "#/people/release-bot", name: "profile", text: "Agent · owned by ada" },
  { hash: "#/people/triage-agent", name: "warning", text: "Went offline unexpectedly" },
  { hash: "#/people/release-bot", name: "wakes-on-mention", text: "Wakes on mention" },
  { hash: "#/people/rollback", name: "unreachable", text: "Unreachable:" },
  { admin: true, hash: "#/people/release-bot", name: "admin-profile", text: "Transfer to (a human's name)" },
  { admin: true, hash: "#/people/old-deploy-bot", name: "admin-deactivated", text: "Reactivate" },
  { admin: true, click: "Deactivate", hash: "#/people/release-bot", name: "confirm", text: "reactivate it later" },
  { hash: "#/settings", name: "settings", text: "System" },
  { click: "New channel", hash: "#/channels/general", name: "new-channel", text: "Lowercase letters" },
  {
    fill: [
      ["Date", "2099-06-01"],
      ["Time", "09:30"],
      ["Time zone", "Europe/London"],
    ],
    hash: "#/channels/general",
    name: "schedule",
    send: "/schedule @grace the deploy window opens now",
    text: "1 Jun 2099, 09:30",
  },
  { click: "Open the sidebar", hash: "#/channels/general", name: "narrow", narrow: true, text: "#deploys" },
  { hash: "#/channels/deploys", name: "closed-threads", text: "2 closed threads" },
  { hash: "#/channels/deploys/threads/8", name: "closed-thread", text: "Rolled back to 1.4.1." },
  {
    focus: 'nav [role="separator"]',
    hash: "#/channels/general",
    name: "sidebar-narrowest",
    press: "Home",
    text: "Lunch at 12:30.",
  },
  {
    focus: 'nav [role="separator"]',
    hash: "#/channels/general",
    name: "sidebar-widest",
    press: "End",
    text: "Lunch at 12:30.",
  },
  { click: "Collapse sidebar", hash: "#/channels/general", name: "collapsed", text: "Lunch at 12:30." },
  { focus: "main a", hash: "#/inbox", name: "shortcut-list", press: "?", text: "Keyboard shortcuts" },
  { fill: [["Message", "@"]], hash: "#/channels/general", name: "mention-suggestions", text: "Lunch at 12:30." },
  {
    focus: 'aside[aria-label="Thread"] textarea',
    hash: "#/channels/general/threads/1",
    name: "thread-mention-suggestions",
    press: "@",
    text: "Thanks, both of you.",
  },
  {
    fill: [["Search", "gen"]],
    focus: "main a",
    hash: "#/channels/general",
    name: "jump-box",
    press: "Control+k",
    text: "#general",
  },
  { hash: "#/channels/general", liveDown: true, name: "reconnecting", text: "Reconnecting…" },
];

export type { Screen };
export { SCREENS };
