import type { Page } from "@playwright/test";

type Theme = "light" | "dark";

interface Screen {
  readonly name: string;
  readonly hash: string;
  readonly click?: string;
  readonly clickIn?: string;
  readonly focus?: string;
  readonly text: string;
  readonly narrow?: boolean;
  readonly admin?: boolean;
  readonly liveDown?: boolean;
  readonly daysLater?: number;
  readonly history?: "more" | "loading";
}

interface Shot {
  readonly screen: Screen;
  readonly theme: Theme;
}

interface ScreenshotOptions {
  readonly out?: string;
  readonly screens: readonly Screen[];
}

interface Flags {
  readonly only: readonly string[];
  readonly out?: string;
}

interface ThemePass {
  readonly moveClock: (days: number) => Promise<void>;
  readonly shoot: (shot: Shot) => Promise<void>;
  readonly stop: () => Promise<void>;
}

interface TakeScreenshots {
  readonly screens: readonly Screen[];
  readonly freshBoard: (theme: Theme) => Promise<ThemePass>;
}

const THEMES: readonly Theme[] = ["light", "dark"];
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
  {
    focus: 'article:has-text("Lunch at 12:30.")',
    hash: "#/channels/general",
    name: "channel-hover",
    text: "Lunch at 12:30.",
  },
  {
    click: "More actions",
    clickIn: 'article:has-text("Lunch at 12:30.")',
    focus: 'article:has-text("Lunch at 12:30.")',
    hash: "#/channels/general",
    name: "message-menu",
    text: "Mark unread",
  },
  { hash: "#/channels/general/threads/1", name: "thread", text: "Thanks, both of you." },
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
    text: "View profile",
  },
  {
    focus: 'article:has-text("@grace can you check the notes before we ship?") a:has-text("@grace")',
    hash: "#/channels/general",
    name: "identity-card-person",
    text: "View profile",
  },
  { hash: "#/people", name: "people", text: "release-bot" },
  { hash: "#/people/release-bot", name: "profile", text: "Agent · owned by ada" },
  { hash: "#/people/triage-agent", name: "warning", text: "Went offline unexpectedly" },
  { admin: true, hash: "#/people/release-bot", name: "admin-profile", text: "Transfer to (a human's name)" },
  { admin: true, hash: "#/people/old-deploy-bot", name: "admin-deactivated", text: "Reactivate" },
  { admin: true, click: "Deactivate", hash: "#/people/release-bot", name: "confirm", text: "reactivate it later" },
  { hash: "#/settings", name: "settings", text: "System" },
  { click: "New channel", hash: "#/channels/general", name: "new-channel", text: "Lowercase letters" },
  { click: "Open the sidebar", hash: "#/channels/general", name: "narrow", narrow: true, text: "#deploys" },
  { hash: "#/channels/deploys", name: "closed-threads", text: "2 closed threads" },
  { hash: "#/channels/deploys/threads/8", name: "closed-thread", text: "Rolled back to 1.4.1." },
  { click: "Collapse sidebar", hash: "#/channels/general", name: "collapsed", text: "Lunch at 12:30." },
  { hash: "#/channels/general", liveDown: true, name: "reconnecting", text: "Reconnecting…" },
];

const NONE = 0;
const NOW = 0;

function screenNamed(name: string): Screen {
  const screen = SCREENS.find((candidate) => candidate.name === name);
  if (typeof screen !== "object") {
    const names = SCREENS.map((candidate) => candidate.name).join(", ");
    throw new Error(`Unknown screen ${name}: pick from ${names}.`);
  }
  return screen;
}

function withFlag(flags: Flags, flag: string, value: string | null): Flags {
  if (flag !== "--only" && flag !== "--out") {
    throw new Error(`Unknown flag ${flag}: use --only <screen> or --out <dir>.`);
  }
  if (value === null) {
    throw new Error(`${flag} needs a value.`);
  }
  if (flag === "--out") {
    return { ...flags, out: value };
  }
  return { ...flags, only: [...flags.only, screenNamed(value).name] };
}

function flagsOf(args: readonly string[], flags: Flags): Flags {
  const [flag, value, ...rest] = args;
  if (typeof flag !== "string") {
    return flags;
  }
  return flagsOf(rest, withFlag(flags, flag, value ?? null));
}

function screensNamed(only: readonly string[]): readonly Screen[] {
  if (only.length === NONE) {
    return SCREENS;
  }
  return SCREENS.filter((screen) => only.includes(screen.name));
}

function screenshotOptions(args: readonly string[]): ScreenshotOptions {
  const { only, ...out } = flagsOf(args, { only: [] });
  return { ...out, screens: screensNamed(only) };
}

function reasonOf(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function failureOf(shoot: ThemePass["shoot"], shot: Shot): Promise<readonly string[]> {
  try {
    await shoot(shot);
    return [];
  } catch (error) {
    return [`${shot.screen.name}-${shot.theme}: ${reasonOf(error)}`];
  }
}

interface Taking {
  readonly moved: number;
  readonly pass: ThemePass;
}

function daysLaterOf(shot: Shot): number {
  return shot.screen.daysLater ?? NOW;
}

async function failuresOf({ moved, pass }: Taking, shots: readonly Shot[]): Promise<readonly string[]> {
  const [shot, ...rest] = shots;
  if (typeof shot !== "object") {
    return [];
  }
  const daysLater = daysLaterOf(shot);
  if (daysLater > moved) {
    await pass.moveClock(daysLater - moved);
  }
  const failure = await failureOf(pass.shoot, shot);
  return [...failure, ...(await failuresOf({ moved: Math.max(moved, daysLater), pass }, rest))];
}

async function passFailures({ freshBoard, screens }: TakeScreenshots, theme: Theme): Promise<readonly string[]> {
  const pass = await freshBoard(theme);
  try {
    const shots: readonly Shot[] = screens.map((screen) => ({ screen, theme }));
    const soonestFirst = shots.toSorted((left, right) => daysLaterOf(left) - daysLaterOf(right));
    const failures = await failuresOf({ moved: NOW, pass }, soonestFirst);
    return failures;
  } finally {
    await pass.stop();
  }
}

async function themeFailures(take: TakeScreenshots, themes: readonly Theme[]): Promise<readonly string[]> {
  const [theme, ...rest] = themes;
  if (typeof theme !== "string") {
    return [];
  }
  const failures = await passFailures(take, theme);
  return [...failures, ...(await themeFailures(take, rest))];
}

async function takeScreenshots(take: TakeScreenshots): Promise<readonly string[]> {
  const failures = await themeFailures(take, THEMES);
  return failures;
}

const PAGE_NONE = 0;
const PAGE_ONE = 1;

interface OlderHistory {
  readonly page: Page;
  readonly history: NonNullable<Screen["history"]>;
}

async function withOlderHistory({ history, page }: OlderHistory): Promise<void> {
  let pages = PAGE_NONE;
  await page.route("**/v1/inbox/history*", async (route) => {
    pages += PAGE_ONE;
    if (history === "loading" && pages > PAGE_ONE) {
      return;
    }
    const response = await route.fetch();
    const body = await response.text();
    await route.fulfill({ body: body.replace('"hasMore":false', '"hasMore":true'), response });
  });
}

export type { Screen, Shot, Theme, ThemePass };
export { screenshotOptions, takeScreenshots, withOlderHistory };
