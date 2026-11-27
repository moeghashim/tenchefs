import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inPane } from "./regions.ts";
import { logInToChannels } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const TINT = /^oklab\(.* \/ 0\.025\)$/u;
const NO_BOX = { bottom: Number.NaN, left: Number.NaN, top: Number.NaN };

interface Edges {
  readonly bottom: number;
  readonly left: number;
  readonly top: number;
}

async function edgesOf(element: Locator): Promise<Edges> {
  const box = await element.boundingBox();
  if (box === null) {
    return NO_BOX;
  }
  return { bottom: box.y + box.height, left: box.x, top: box.y };
}

async function mutedOf(article: Locator): Promise<string> {
  const colour = await article.evaluate((element: unknown) => {
    const probe = globalThis.document.createElement("span");
    probe.style.color = "var(--color-muted-foreground)";
    if (element instanceof HTMLElement) {
      element.append(probe);
    }
    const { color } = globalThis.getComputedStyle(probe);
    probe.remove();
    return color;
  });
  return colour;
}

function barOf(colour: string): RegExp {
  return new RegExp(`${colour.replaceAll(/[()]/gu, String.raw`\$&`)} 3px 0px 0px 0px inset$`, "u");
}

async function channelWithATitle(channel: string): Promise<string> {
  const reader = await newIdentity({ kind: "human", name: unique("browser-title-reader") });
  await adminClient().createChannel({ name: channel });
  await adminClient().createMessage({ channel, text: "Untitled." });
  const { message } = await adminClient().createMessage({ channel, text: "Who's on call?" });
  await adminClient().setThreadTitle(message.id, "On call this week");
  return reader.token;
}

interface Look {
  readonly background: string;
  readonly shadow: string;
  readonly size: string;
  readonly spacing: string;
  readonly below: string;
  readonly weight: string;
}

async function lookOf(element: Locator): Promise<Look> {
  await expect(element).toBeVisible();

  const look = await element.evaluate((shown: unknown) => {
    if (!(shown instanceof Element)) {
      return { background: "", below: "", shadow: "", size: "", spacing: "", weight: "" };
    }
    const style = globalThis.getComputedStyle(shown);
    return {
      background: style.backgroundColor,
      below: style.marginBottom,
      shadow: style.boxShadow,
      size: style.fontSize,
      spacing: style.letterSpacing,
      weight: style.fontWeight,
    };
  });
  return look;
}

interface Rows {
  readonly titled: Locator;
  readonly untitled: Locator;
}

async function rowsIn(channel: string, page: Page): Promise<Rows> {
  const token = await channelWithATitle(channel);
  await logInToChannels({ page, token, url: `/#/channels/${channel}` });
  const feed = inPane(page).getByRole("feed", { exact: true, name: "Messages" });
  return {
    titled: feed.getByRole("article").filter({ hasText: "Who's on call?" }),
    untitled: feed.getByRole("article").filter({ hasText: "Untitled." }),
  };
}

test("a titled thread's title leads its row at its left edge, over a muted bar and a faint tint", async ({ page }) => {
  const { titled, untitled } = await rowsIn(unique("browser-title"), page);
  const heading = titled.getByRole("heading", { exact: true, level: 3, name: "On call this week" });
  const title = await lookOf(heading);
  const row = await lookOf(titled);
  const plain = await lookOf(untitled);
  const muted = await mutedOf(titled);
  const edges = { avatar: await edgesOf(titled.locator(":scope > h3 + div")), title: await edgesOf(heading) };

  expect({
    above: edges.title.bottom <= edges.avatar.top,
    bar: barOf(muted).test(row.shadow),
    left: edges.title.left,
    plain: { background: plain.background, shadow: plain.shadow },
    tint: TINT.test(row.background),
    title: { below: title.below, size: title.size, spacing: title.spacing, weight: title.weight },
  }).toStrictEqual({
    above: true,
    bar: true,
    left: edges.avatar.left,
    plain: { background: "rgba(0, 0, 0, 0)", shadow: "none" },
    tint: true,
    title: { below: "10px", size: "17px", spacing: "-0.17px", weight: "600" },
  });
});
