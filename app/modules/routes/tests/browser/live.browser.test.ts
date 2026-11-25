import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inPane, sidebarLink } from "./regions.ts";
import type { Message } from "../../../sdk/index.ts";
import type { Page } from "@playwright/test";
import type { Person } from "./people.ts";
import { logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

interface Posted {
  readonly parent: Message;
  readonly poster: Person;
}

async function openChannel(page: Page, channel: string): Promise<Posted> {
  await adminClient().createChannel({ name: channel });
  const poster = await newIdentity({ kind: "agent", name: unique("browser-live-poster") });
  const { message: parent } = await poster.client.createMessage({ channel, text: "Deploy at noon?" });
  const reader = await newIdentity({ kind: "human", name: unique("browser-live-reader") });
  await logInWithStream({ page, token: reader.token });
  await sidebarLink({ label: `#${channel}`, page }).click();
  return { parent, poster };
}

test("a message posted by another identity appears in the open channel and thread without a reload", async ({
  page,
}) => {
  const channel = unique("browser-live");
  const { parent, poster } = await openChannel(page, channel);

  await expect(page.getByRole("feed", { exact: true, name: "Messages" }).getByRole("article")).toContainText([
    "Deploy at noon?",
  ]);

  await poster.client.createMessage({ channel, text: "Or at one?" });
  await poster.client.createMessage({ channel, replyTo: parent.id, text: "Noon works" });

  await expect(page.getByRole("feed", { exact: true, name: "Messages" }).getByRole("article")).toContainText([
    "Deploy at noon?1 reply",
    "Or at one?",
  ]);

  await inPane(page).getByText("1 reply", { exact: true }).click();

  await expect(page.getByRole("feed", { exact: true, name: "Replies" })).toContainText("Noon works");

  await poster.client.createMessage({ channel, replyTo: parent.id, text: "Then noon it is" });

  await expect(page.getByRole("feed", { exact: true, name: "Replies" }).getByRole("article")).toContainText([
    "Noon works",
    "Then noon it is",
  ]);
});
