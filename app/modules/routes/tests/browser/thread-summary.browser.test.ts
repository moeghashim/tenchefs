import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inPane, sidebarLink } from "./regions.ts";
import { logIn } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

interface Look {
  readonly arrow: boolean;
  readonly lastReply: boolean;
  readonly viewThread: boolean;
  readonly width: number;
}

async function lookOf(link: Locator): Promise<Look> {
  const box = await link.boundingBox();
  if (box === null) {
    throw new Error("Not shown");
  }
  return {
    arrow: await link.getByText("→", { exact: true }).isVisible(),
    lastReply: await link.getByText("Last reply just now →", { exact: true }).isVisible(),
    viewThread: await link.getByText("View thread", { exact: true }).isVisible(),
    width: box.width,
  };
}

async function openSummary(page: Page, channel: string): Promise<Locator> {
  await adminClient().createChannel({ name: channel });
  const { message: parent } = await adminClient().createMessage({ channel, text: "Ship it?" });
  await adminClient().createMessage({ channel, replyTo: parent.id, text: "Yes" });
  const reader = await newIdentity({ kind: "human", name: unique("browser-summary-reader") });
  await logIn({ page, token: reader.token });
  await sidebarLink({ label: `#${channel}`, page }).click();
  const link = inPane(page).getByRole("link", { exact: true, name: "1 reply, Last reply just now, View thread" });

  await expect(link).toBeVisible();

  return link;
}

test("hovering a thread's summary keeps its last reply text, adds an arrow, and never makes it narrower", async ({
  page,
}) => {
  const link = await openSummary(page, unique("browser-reply-arrow"));
  const atRest = await lookOf(link);
  await link.hover();

  await expect(link.getByText("→", { exact: true })).toBeVisible();

  const hovered = await lookOf(link);

  expect([atRest, { ...hovered, wider: hovered.width >= atRest.width }]).toStrictEqual([
    { arrow: false, lastReply: true, viewThread: false, width: atRest.width },
    { arrow: true, lastReply: true, viewThread: false, wider: true, width: hovered.width },
  ]);
});
