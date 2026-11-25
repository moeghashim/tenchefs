import type { Browser, BrowserContext, Page } from "@playwright/test";
import type { Screen, Shot, Theme, ThemePass } from "./lib/screenshots.ts";
import { attachScreenFiles, setScreenPresences } from "./lib/screen-triggers.ts";
import { field, list, parseJson, text } from "./lib/json.ts";
import { hillsPng, moveClockForward } from "../app/modules/testing/index.ts";
import { mkdirSync, mkdtempSync } from "node:fs";
import { screenshotOptions, takeScreenshots, withOlderHistory } from "./lib/screenshots.ts";
import type { DevCookout } from "./lib/dev-cookout.ts";
import { chromium } from "@playwright/test";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { startDevCookout } from "./lib/dev-cookout.ts";
import { tmpdir } from "node:os";

interface Board {
  readonly closed: readonly number[];
  readonly dropped: string;
  readonly owner: string;
  readonly token: string;
  readonly server: DevCookout;
}

type Login = "admin" | "member";

const ARGUMENTS_FROM = 2;
const EXIT_FAILURE = 1;
const EXIT_SUCCESS = 0;
const NONE = 0;
const MAX_BUFFER = 67_108_864;
const RENDER_MS = 15_000;
const WIDE = { height: 800, width: 1280 };
const NARROW = { height: 900, width: 600 };
const LOGGED_IN_AS = "grace";
const DROPPED_AGENT = "triage-agent";
const TRIGGER_OWNER = "ada";
const CLOSED_IN_DEPLOYS = ["deployed", "rollbackCall"] as const;

function withEnv(variables: Readonly<Record<string, string>>, args: readonly string[]): string[] {
  return [...Object.entries(variables).map(([name, value]: readonly [string, string]) => `${name}=${value}`), ...args];
}

function tokenOf(identities: readonly unknown[], name: string): string {
  const found = identities.find((entry) => field(field(entry, "identity"), "name") === name);
  const token = text(field(found, "token"));
  if (typeof token !== "string") {
    throw new TypeError(`pnpm seed printed no token for ${name}`);
  }
  return token;
}

function seed(server: DevCookout): Board {
  const run = spawnSync(
    "env",
    withEnv({ COOKOUT_ALLOW_HUMAN: "1", COOKOUT_TOKEN: server.adminToken, COOKOUT_URL: server.url }, [
      process.execPath,
      "app/dev.ts",
      "seed",
    ]),
    { encoding: "utf8", maxBuffer: MAX_BUFFER },
  );
  if (run.status !== EXIT_SUCCESS) {
    throw new Error(`pnpm seed failed:\n${run.stdout}${run.stderr}`);
  }
  const seeded = parseJson(run.stdout);
  const identities = list(field(seeded, "identities")) ?? [];
  const closed = CLOSED_IN_DEPLOYS.map((name) => field(field(seeded, "messages"), name));
  const tokens = {
    dropped: tokenOf(identities, DROPPED_AGENT),
    owner: tokenOf(identities, TRIGGER_OWNER),
    token: tokenOf(identities, LOGGED_IN_AS),
  };
  return { closed: closed.filter((id) => typeof id === "number"), ...tokens, server };
}

function closeThreads({ closed, server, token }: Board): void {
  for (const id of closed) {
    const run = spawnSync(
      "env",
      withEnv({ COOKOUT_ALLOW_HUMAN: "1", COOKOUT_TOKEN: token, COOKOUT_URL: server.url }, [
        process.execPath,
        "app/main.ts",
        "thread",
        "close",
        String(id),
      ]),
      { encoding: "utf8", maxBuffer: MAX_BUFFER },
    );
    if (run.status !== EXIT_SUCCESS) {
      throw new Error(`cookout thread close ${String(id)} failed:\n${run.stdout}${run.stderr}`);
    }
  }
}

async function loggedIn(browser: Browser, { server, token }: Board, theme: Theme): Promise<BrowserContext> {
  const url = server.webUrl;
  const context = await browser.newContext({
    baseURL: url,
    storageState: {
      cookies: [],
      origins: [{ localStorage: [{ name: "cookout-theme", value: theme }], origin: url }],
    },
  });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByLabel("Token").fill(token);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("list", { name: "Channels" }).waitFor({ timeout: RENDER_MS });
  await page.close();
  return context;
}

function viewportOf(shot: Shot): typeof WIDE {
  if (shot.screen.narrow === true) {
    return NARROW;
  }
  return WIDE;
}

async function fillAll(page: Page, fills: Required<Screen>["fill"]): Promise<void> {
  const [first = null, ...rest] = fills;
  if (first === null) {
    return;
  }
  const [label, value] = first;
  await page.getByLabel(label, { exact: true }).fill(value, { timeout: RENDER_MS });
  await fillAll(page, rest);
}

async function chooseAndFill(page: Page, screen: Screen): Promise<void> {
  if (typeof screen.choose === "string") {
    await page.getByRole("menuitem", { exact: true, name: screen.choose }).click({ timeout: RENDER_MS });
  }
  await fillAll(page, screen.fill ?? []);
}

async function interact(page: Page, shot: Shot): Promise<void> {
  if (typeof shot.screen.focus === "string") {
    await page.locator(shot.screen.focus).first().focus({ timeout: RENDER_MS });
  }
  if (typeof shot.screen.press === "string") {
    await page.keyboard.press(shot.screen.press);
  }
  if (typeof shot.screen.click === "string") {
    const scope = page.locator(shot.screen.clickIn ?? "body");
    await scope.getByRole("button", { exact: true, name: shot.screen.click }).click({ timeout: RENDER_MS });
  }
  await chooseAndFill(page, shot.screen);
  await attachScreenFiles({ image: hillsPng(), page, screen: shot.screen, timeout: RENDER_MS });
}

async function render(page: Page, shot: Shot): Promise<void> {
  await page.setViewportSize(viewportOf(shot));
  if (typeof shot.screen.history === "string") {
    await withOlderHistory({ history: shot.screen.history, page });
  }
  if (shot.screen.noPresence === true) {
    await page.route("**/v1/presence*", async (route) => {
      await route.abort();
    });
  }
  if (shot.screen.liveDown === true) {
    await page.route("**/v1/events?*", async (route) => {
      await route.abort();
    });
  }
  await page.goto(`/${shot.screen.hash}`);
  await interact(page, shot);
  await page.getByText(shot.screen.text).first().waitFor({ timeout: RENDER_MS });
}

function errorsOn(page: Page): readonly string[] {
  const errors: string[] = [];
  page.on("pageerror", ({ message }: Readonly<Error>) => {
    errors.push(message);
  });
  return errors;
}

async function screenshot(page: Page, shot: Shot, out: string): Promise<void> {
  const errors = errorsOn(page);
  try {
    await render(page, shot);
    await page.screenshot({ path: path.join(out, `${shot.screen.name}-${shot.theme}.png`) });
  } finally {
    await page.close();
  }
  if (errors.length > NONE) {
    throw new Error(`the page threw: ${errors.join("; ")}`);
  }
}

function loginOf(shot: Shot): Login {
  if (shot.screen.admin === true) {
    return "admin";
  }
  return "member";
}

type NewPage = (shot: Shot) => Promise<Page>;

function shooter(newPage: NewPage, out: string): (shot: Shot) => Promise<void> {
  return async (shot) => {
    await screenshot(await newPage(shot), shot, out);
  };
}

function boardFor(board: Board, login: Login): Board {
  if (login === "admin") {
    return { ...board, token: board.server.adminToken };
  }
  return board;
}

async function loggedInBoth(browser: Browser, board: Board, theme: Theme): Promise<NewPage> {
  const admin = await loggedIn(browser, boardFor(board, "admin"), theme);
  const member = await loggedIn(browser, board, theme);
  return async (shot) => {
    const login = loginOf(shot);
    if (typeof shot.screen.daysLater === "number") {
      const fresh = await loggedIn(browser, boardFor(board, login), theme);
      const page = await fresh.newPage();
      return page;
    }
    const page = await { admin, member }[login].newPage();
    return page;
  };
}

function report(failures: readonly string[], out: string): void {
  for (const failure of failures) {
    console.error(failure);
  }
  console.log(out);
  if (failures.length > NONE) {
    process.exitCode = EXIT_FAILURE;
  }
}

async function prepared(server: DevCookout): Promise<Board> {
  const board = seed(server);
  closeThreads(board);
  const { adminToken, url } = server;
  await setScreenPresences({
    adminToken,
    dropped: DROPPED_AGENT,
    droppedToken: board.dropped,
    image: hillsPng(),
    ownerToken: board.owner,
    url,
  });
  return board;
}

function clockMover(clockUrl: string): ThemePass["moveClock"] {
  return async (days) => {
    await moveClockForward({ clockUrl, days });
  };
}

function freshBoards(browser: Browser, out: string): (theme: Theme) => Promise<ThemePass> {
  return async (theme) => {
    const server = await startDevCookout({ COOKOUT_PRESENCE_GRACE_SECONDS: "1" });
    try {
      const newPage = await loggedInBoth(browser, await prepared(server), theme);
      return { moveClock: clockMover(server.clockUrl), shoot: shooter(newPage, out), stop: server.stop };
    } catch (error) {
      await server.stop();
      throw error;
    }
  };
}

async function shootFreshBoards(screens: readonly Screen[], out: string): Promise<readonly string[]> {
  const browser = await chromium.launch();
  try {
    const failures = await takeScreenshots({ freshBoard: freshBoards(browser, out), screens });
    return failures;
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  const options = screenshotOptions(process.argv.slice(ARGUMENTS_FROM));
  const out = options.out ?? mkdtempSync(path.join(tmpdir(), "cookout-screenshots-"));
  mkdirSync(out, { recursive: true });
  report(await shootFreshBoards(options.screens, out), out);
}

await main();
