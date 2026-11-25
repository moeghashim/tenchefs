import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import type { Locator } from "@playwright/test";
import { inPane } from "./regions.ts";
import { logIn } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const CHANNEL = "browser-suggestions-layer";
const EARLIER_MESSAGES = 30;
const SPOTS_ACROSS = 10;
const HALF = 0.5;
const NONE = 0;
const LIST = '[aria-label="Mention suggestions"]';
const REPLIERS = ["ada", "alan", "grace"];
const EARLIER = Array.from({ length: EARLIER_MESSAGES }, (_value, at) => `Earlier message ${String(at)}`);
const SPOTS = Array.from({ length: SPOTS_ACROSS }, (_value, at) => (at + HALF) / SPOTS_ACROSS);

type Point = readonly [number, number];

async function threadSummaryAboveTheBox(channel: string): Promise<string> {
  const admin = adminClient();
  await admin.createChannel({ name: channel });
  await Promise.all(
    EARLIER.map(async (text) => {
      await admin.createMessage({ channel, text });
    }),
  );
  const { message } = await admin.createMessage({ channel, text: "Who can review this?" });
  await Promise.all(
    REPLIERS.map(async (name) => {
      const { client } = await newIdentity({ kind: "human", name: `${channel}-${name}` });
      await client.createMessage({ channel, replyTo: message.id, text: "I can" });
    }),
  );
  const { token } = await newIdentity({ kind: "human", name: `${channel}-reader` });
  return token;
}

async function pointsOver(list: Locator): Promise<readonly Point[]> {
  const box = await list.boundingBox();
  if (box === null) {
    return [];
  }
  return SPOTS.flatMap((across) => SPOTS.map((down): Point => [box.x + box.width * across, box.y + box.height * down]));
}

interface Looking {
  readonly over: readonly Point[];
  readonly selector: string;
}

function uncovered({ over, selector }: Looking): number {
  const shown = document.querySelector(selector);
  return over.filter(([left, top]) => shown === null || !shown.contains(document.elementFromPoint(left, top))).length;
}

async function coveredPoints(list: Locator): Promise<number> {
  const points = await pointsOver(list);
  return list.page().evaluate(uncovered, { over: points, selector: LIST });
}

test("the @ suggestion box is the topmost element everywhere it shows, over the messages and their thread summaries", async ({
  page,
}) => {
  const channel = unique(CHANNEL);
  const token = await threadSummaryAboveTheBox(channel);
  await logIn({ page, token });
  await page.goto(`/#/channels/${channel}`);

  await expect(
    inPane(page).getByRole("link", { exact: true, name: "3 replies, Last reply just now, View thread" }),
  ).toBeVisible();

  await inPane(page).getByLabel("Message", { exact: true }).pressSequentially(`@${channel}`);
  const list = inPane(page).getByRole("listbox", { exact: true, name: "Mention suggestions" });

  await expect(list).toBeVisible();

  await expect(async () => {
    const covered = await coveredPoints(list);

    expect(covered).toBe(NONE);
  }).toPass();
});
