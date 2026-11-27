import type { Shot, Theme, ThemePass } from "../lib/screenshots.ts";
import { expect, it } from "vitest";
import { screenshotOptions, takeScreenshots } from "../lib/screenshots.ts";

const SCREENS = screenshotOptions([]).screens;
const SEEDED_UNREAD = 1;
const READ = 0;
const THROUGH_STOP = 1;
const FIRST = 0;
const LAST = -1;
const DAYS_LATER_TAIL = -8;

interface FakeBoards {
  readonly freshBoard: (theme: Theme) => Promise<ThemePass>;
  readonly log: readonly string[];
}

function opensThread(shot: Shot): boolean {
  return shot.screen.hash.includes("/threads/") || shot.screen.hash.startsWith("#/inbox/");
}

function fakeBoards(broken: string): FakeBoards {
  const log: string[] = [];
  async function freshBoard(theme: Theme): Promise<ThemePass> {
    await Promise.resolve();
    let unread = SEEDED_UNREAD;
    log.push(`seed ${theme}`);
    return {
      moveClock: async (days): Promise<void> => {
        await Promise.resolve();
        log.push(`clock moved ${String(days)} days`);
      },
      shoot: async (shot): Promise<void> => {
        await Promise.resolve();
        const name = `${shot.screen.name}-${shot.theme}`;
        if (name === broken) {
          throw new Error("Timed out waiting for Thanks, both of you.");
        }
        log.push(`${name}: ${String(unread)} unread`);
        if (opensThread(shot)) {
          unread = READ;
        }
      },
      stop: async (): Promise<void> => {
        await Promise.resolve();
        log.push(`stop ${theme}`);
      },
    };
  }
  return { freshBoard, log };
}

function passOf(log: readonly string[], theme: Theme): readonly string[] {
  const start = log.indexOf(`seed ${theme}`);
  const end = log.indexOf(`stop ${theme}`);
  return log.slice(start, end + THROUGH_STOP).map((line) => line.replaceAll(theme, "<theme>"));
}

const STANDARD_SCREENS = [
  "inbox",
  "inbox-more",
  "inbox-nudge",
  "inbox-offer",
  "inbox-deactivated",
  "inbox-loading",
  "inbox-row-menu",
  "inbox-thread",
  "inbox-narrow",
  "inbox-channel",
  "inbox-marked",
  "channel",
  "titled-thread",
  "channel-hover",
  "attachments",
  "attachment-full",
  "composer-files",
  "composer-refusal",
  "message-menu",
  "channel-menu",
  "person-menu",
  "thread",
  "thread-menu",
  "receipt",
  "identity-card",
  "identity-card-person",
  "identity-card-deactivated",
  "identity-card-brought-in",
  "identity-card-no-presence",
  "people",
  "profile",
  "warning",
  "wakes-on-mention",
  "unreachable",
  "admin-profile",
  "admin-deactivated",
  "confirm",
  "settings",
  "new-channel",
  "schedule",
  "narrow",
  "closed-threads",
  "closed-thread",
  "sidebar-narrowest",
  "sidebar-widest",
  "collapsed",
  "shortcut-list",
  "mention-suggestions",
  "thread-mention-suggestions",
  "jump-box",
  "reconnecting",
];

it("takes every screen in light on a fresh board, then every screen in dark on another", {
  timeout: 2000,
}, async () => {
  expect.hasAssertions();

  const { freshBoard, log } = fakeBoards("");
  const failures = await takeScreenshots({ freshBoard, screens: SCREENS });

  expect([failures, log.at(FIRST), log.at(LAST), log.indexOf("stop light") < log.indexOf("seed dark")]).toStrictEqual([
    [],
    "seed light",
    "stop dark",
    true,
  ]);
  expect(passOf(log, "dark")).toStrictEqual(passOf(log, "light"));
  expect(passOf(log, "light").filter((line) => line.startsWith("inbox"))).toStrictEqual([
    "inbox-<theme>: 1 unread",
    "inbox-more-<theme>: 1 unread",
    "inbox-loading-<theme>: 1 unread",
    "inbox-row-menu-<theme>: 1 unread",
    "inbox-thread-<theme>: 1 unread",
    "inbox-narrow-<theme>: 0 unread",
    "inbox-channel-<theme>: 0 unread",
    "inbox-marked-<theme>: 0 unread",
    "inbox-nudge-<theme>: 0 unread",
    "inbox-offer-<theme>: 0 unread",
    "inbox-deactivated-<theme>: 0 unread",
  ]);
});

it("on each theme's board it moves the clock on for the days-later screens, after every other screen", {
  timeout: 2000,
}, async () => {
  expect.hasAssertions();

  const { freshBoard, log } = fakeBoards("");
  await takeScreenshots({ freshBoard, screens: SCREENS });

  expect(passOf(log, "light").slice(DAYS_LATER_TAIL)).toStrictEqual([
    "reconnecting-<theme>: 0 unread",
    "clock moved 3 days",
    "inbox-nudge-<theme>: 0 unread",
    "clock moved 27 days",
    "inbox-offer-<theme>: 0 unread",
    "clock moved 60 days",
    "inbox-deactivated-<theme>: 0 unread",
    "stop <theme>",
  ]);
  expect(passOf(log, "dark")).toStrictEqual(passOf(log, "light"));
});

it("lists the standard screens in the order they are taken", { timeout: 2000 }, () => {
  expect.hasAssertions();
  expect(SCREENS.map((screen) => screen.name)).toStrictEqual(STANDARD_SCREENS);
});

it("a screen that fails to render is reported, and the others are still taken", { timeout: 2000 }, async () => {
  expect.hasAssertions();

  const { freshBoard, log } = fakeBoards("thread-dark");
  const failures = await takeScreenshots({ freshBoard, screens: SCREENS });

  expect([failures, log.filter((line) => /^thread-(?:dark|light):/u.test(line)), log.at(LAST)]).toStrictEqual([
    ["thread-dark: Timed out waiting for Thanks, both of you."],
    ["thread-light: 0 unread"],
    "stop dark",
  ]);
});

it("--only picks screens by name and --out names the folder", { timeout: 2000 }, () => {
  expect.hasAssertions();

  const options = screenshotOptions(["--only", "thread", "--only", "narrow", "--out", "/tmp/shots"]);

  expect(options).toStrictEqual({
    out: "/tmp/shots",
    screens: SCREENS.filter((screen) => ["thread", "narrow"].includes(screen.name)),
  });
});

it("with no flags it takes every screen into no named folder", { timeout: 2000 }, () => {
  expect.hasAssertions();
  expect(Object.keys(screenshotOptions([]))).toStrictEqual(["screens"]);
});

it("an unknown screen or flag, or a flag with no value, is refused", { timeout: 2000 }, () => {
  expect.hasAssertions();
  expect(() => screenshotOptions(["--only", "nope"])).toThrow(
    `Unknown screen nope: pick from ${STANDARD_SCREENS.join(", ")}.`,
  );
  expect(() => screenshotOptions(["--theme", "dark"])).toThrow(
    "Unknown flag --theme: use --only <screen> or --out <dir>.",
  );
  expect(() => screenshotOptions(["--out"])).toThrow("--out needs a value.");
});

it("with no days-later screen picked, the clock never moves", { timeout: 2000 }, async () => {
  expect.hasAssertions();

  const { freshBoard, log } = fakeBoards("");
  const { screens } = screenshotOptions(["--only", "thread"]);
  await takeScreenshots({ freshBoard, screens });

  expect(log).toStrictEqual([
    "seed light",
    "thread-light: 1 unread",
    "stop light",
    "seed dark",
    "thread-dark: 1 unread",
    "stop dark",
  ]);
});
