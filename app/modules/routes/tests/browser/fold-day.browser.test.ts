import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { inPane } from "./regions.ts";
import { logInToChannels } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const NARROW = { height: 900, width: 600 };
const HALF = 2;
const CENTRED = 1;
const NONE = 0;
const CLOSED = 12;

interface Box {
  readonly width: number;
  readonly left: number;
}

interface Day {
  readonly date: Box;
  readonly fold: Box;
  readonly line: Box;
}

async function foldBeforeToday(page: Page, name: string): Promise<void> {
  const { token } = await newIdentity({ kind: "human", name });
  await adminClient().createChannel({ name });
  const texts = Array.from({ length: CLOSED }, (_unused, index) => `Done ${String(index)}.`);
  await Promise.all(
    texts.map(async (text) => {
      const { message } = await adminClient().createMessage({ channel: name, text });
      await adminClient().closeThread(message.id);
    }),
  );
  await adminClient().createMessage({ channel: name, text: "Open one." });
  await logInToChannels({ page, token });
  await page.goto(`/#/channels/${name}`);
}

async function boxOf(page: Page, found: ReturnType<Page["getByText"]>): Promise<Box> {
  const box = await found.boundingBox();
  if (box === null) {
    throw new TypeError(`${page.url()} shows no such box`);
  }
  return { left: box.x, width: box.width };
}

async function dayLine(page: Page): Promise<Day> {
  const named = `${String(CLOSED)} closed threads`;
  const fold = inPane(page).getByRole("button", { exact: true, name: named });

  await expect(fold).toBeVisible();

  const line = inPane(page).getByRole("article").filter({ hasText: named });
  return {
    date: await boxOf(page, line.getByText("Today", { exact: true })),
    fold: await boxOf(page, fold),
    line: await boxOf(page, line),
  };
}

function offCentre(day: Day): number {
  return Math.abs(day.date.left + day.date.width / HALF - (day.line.left + day.line.width / HALF));
}

function overlap(day: Day): number {
  return Math.max(NONE, day.date.left + day.date.width - day.fold.left);
}

test("the day line's date sits in the centre with the fold to its right", async ({ page }) => {
  await foldBeforeToday(page, unique("browser-fold-day-wide"));
  const day = await dayLine(page);

  expect([offCentre(day) < CENTRED, overlap(day), day.fold.left > day.date.left]).toStrictEqual([true, NONE, true]);
});

test("at the narrowest width the date stays centred and the fold doesn't overlap it", async ({ page }) => {
  await foldBeforeToday(page, unique("browser-fold-day-narrow"));
  await page.setViewportSize(NARROW);
  const day = await dayLine(page);

  expect([offCentre(day) < CENTRED, overlap(day)]).toStrictEqual([true, NONE]);
});
