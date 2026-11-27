import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inPane, inThread } from "./regions.ts";
import type { Locator } from "@playwright/test";
import { logInToChannels } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

interface Spacing {
  readonly above: string;
  readonly below: string;
}

async function spacingOf(article: Locator): Promise<Spacing> {
  await expect(article).toBeVisible();

  const spacing = await article.evaluate((element: unknown) => {
    if (!(element instanceof Element)) {
      return { above: "", below: "" };
    }
    const style = globalThis.getComputedStyle(element);
    return { above: style.paddingTop, below: style.paddingBottom };
  });
  return spacing;
}

async function channelWithAThread(channel: string): Promise<string> {
  const reader = await newIdentity({ kind: "human", name: unique("browser-spacing-reader") });
  const poster = await newIdentity({ kind: "human", name: unique("browser-spacing-poster") });
  await adminClient().createChannel({ name: channel });
  const { message: parent } = await adminClient().createMessage({ channel, text: "Who's on call?" });
  await poster.client.createMessage({ channel, text: "Not me." });
  await poster.client.createMessage({ channel, text: "Ask again later." });
  await poster.client.createMessage({ channel, replyTo: parent.id, text: "Still not me." });
  return reader.token;
}

test("a channel's ungrouped messages get more space, and grouped rows and the thread pane keep theirs", async ({
  page,
}) => {
  const channel = unique("browser-spacing");
  const token = await channelWithAThread(channel);
  await logInToChannels({ page, token, url: `/#/channels/${channel}` });
  const feed = inPane(page).getByRole("feed", { exact: true, name: "Messages" });
  const parent = feed.getByRole("article").filter({ hasText: "Who's on call?" });
  const channelRows = [
    await spacingOf(parent),
    await spacingOf(feed.getByRole("article").filter({ hasText: "Not me." })),
    await spacingOf(feed.getByRole("article").filter({ hasText: "Ask again later." })),
  ];
  await parent.getByText("1 reply", { exact: true }).click();
  const thread = inThread(page);
  const threadRows = [
    await spacingOf(thread.getByRole("article").filter({ hasText: "Who's on call?" })),
    await spacingOf(
      thread
        .getByRole("feed", { exact: true, name: "Replies" })
        .getByRole("article")
        .filter({ hasText: "Still not me." }),
    ),
  ];

  expect({ channelRows, threadRows }).toStrictEqual({
    channelRows: [
      { above: "16px", below: "10px" },
      { above: "16px", below: "10px" },
      { above: "2px", below: "2px" },
    ],
    threadRows: [
      { above: "10px", below: "4px" },
      { above: "10px", below: "4px" },
    ],
  });
});
