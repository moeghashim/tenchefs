import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { createTestAgent } from "../../../testing/index.ts";
import { inPane } from "./regions.ts";
import { logIn } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const WIDE = { height: 900, width: 1400 };
const NARROW = { height: 800, width: 360 };
const CHOICES = 3;
const NONE = 0;
const ONE_LINE = 1;
const EVERY_CHOICE_ONE_LINE = [ONE_LINE, ONE_LINE, ONE_LINE];
const CHOICE_LABELS = 'main [role="radiogroup"][aria-label="Kind"] label';
const NOWHERE = "http://127.0.0.1:9/command";
const SCHEMA = { properties: {}, type: "object" } as const;

interface Edges {
  readonly height: number;
  readonly top: number;
}

function kindFilter(page: Page): Locator {
  return inPane(page).getByRole("radiogroup", { exact: true, name: "Kind" });
}

async function peopleOpen(page: Page, name: string): Promise<void> {
  const { token } = await newIdentity({ kind: "human", name });
  await logIn({ page, token, url: "/#/people" });

  await expect(kindFilter(page).locator("label")).toHaveCount(CHOICES);
}

async function choiceLines(page: Page): Promise<readonly number[]> {
  const lines = await page.evaluate((selector: string) => {
    const counted: number[] = [];
    for (const element of globalThis.document.querySelectorAll(selector)) {
      const style = globalThis.getComputedStyle(element);
      const padding = Number(style.paddingTop.replace("px", "")) + Number(style.paddingBottom.replace("px", ""));
      counted.push((element.clientHeight - padding) / Number(style.lineHeight.replace("px", "")));
    }
    return counted;
  }, CHOICE_LABELS);
  return lines;
}

async function edgesOf(control: Locator): Promise<Edges> {
  const box = await control.boundingBox();
  if (box === null) {
    return { height: NONE, top: NONE };
  }
  return { height: box.height, top: box.y };
}

async function toolbarEdges(page: Page): Promise<readonly Edges[]> {
  const edges = await Promise.all([
    edgesOf(inPane(page).getByRole("textbox", { exact: true, name: "Filter by name" })),
    edgesOf(kindFilter(page)),
    edgesOf(inPane(page).getByRole("button", { exact: true, name: "Show deactivated" })),
  ]);
  return edges;
}

test("at a wide width each kind filter choice is one line high, and the toolbar's controls share a top edge and height", async ({
  page,
}) => {
  await page.setViewportSize(WIDE);
  await peopleOpen(page, unique("browser-people-toolbar-wide"));
  const edges = await toolbarEdges(page);
  const [first] = edges;

  expect(await choiceLines(page)).toStrictEqual(EVERY_CHOICE_ONE_LINE);
  expect(edges).toStrictEqual([first, first, first]);
});

test("at a narrow width each kind filter choice is still one line high", async ({ page }) => {
  await page.setViewportSize(NARROW);
  await peopleOpen(page, unique("browser-people-toolbar-narrow"));

  expect(await choiceLines(page)).toStrictEqual(EVERY_CHOICE_ONE_LINE);
});

async function handlerAgent(command: string): Promise<void> {
  const admin = adminClient();
  await createTestAgent({ by: admin, name: command, owner: "admin" });
  await admin.addCommand({ description: "Tag a row", name: command, schema: SCHEMA, url: NOWHERE });
}

test("at a narrow width an identity row's handler tag is as high as its one-word agent tag", async ({ page }) => {
  const command = unique("browser-people-handler-tag");
  await handlerAgent(command);
  await page.setViewportSize(NARROW);
  await peopleOpen(page, unique("browser-people-handler-reader"));
  await inPane(page).getByRole("textbox", { exact: true, name: "Filter by name" }).fill(command);
  const handler = inPane(page).getByText(`Handler for /${command}`, { exact: true });
  const agent = inPane(page)
    .getByRole("listitem")
    .filter({ has: page.getByText(`Handler for /${command}`, { exact: true }) })
    .getByText("agent", { exact: true });

  await expect(handler).toBeVisible();

  const [handlerEdges, agentEdges] = await Promise.all([edgesOf(handler), edgesOf(agent)]);

  expect(handlerEdges.height).toBe(agentEdges.height);
});
