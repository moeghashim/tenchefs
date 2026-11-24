import type { Page } from "@playwright/test";
import { SCREENS } from "./screens.ts";
import type { Screen } from "./screens.ts";

type Theme = "light" | "dark";

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

export type { Shot, Theme, ThemePass };
export type { Screen } from "./screens.ts";
export { screenshotOptions, takeScreenshots, withOlderHistory };
