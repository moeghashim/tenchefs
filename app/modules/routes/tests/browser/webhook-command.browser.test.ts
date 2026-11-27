import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { createTestAgent, testClient } from "../../../testing/index.ts";
import type { CookoutClient } from "../../../sdk/index.ts";
import type { JsonSchema } from "../../../webhook-commands/index.ts";
import { logInToChannels } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { sidebarLink } from "./regions.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const schema = {
  properties: {
    branch: { description: "The branch to ship", minLength: 3, type: "string" },
    count: { type: "integer" },
  },
  required: ["branch"],
  type: "object",
} as const;
const inlineSchema = { properties: { branch: { type: "string" } }, required: ["branch"], type: "object" } as const;
const nowhere = "http://127.0.0.1:9/command";
interface InChannel {
  readonly channel: string;
  readonly webhookCommand: string;
  readonly shape?: JsonSchema;
}

interface Opened {
  readonly page: Page;
  readonly channel: string;
}

async function channelWithWebhookCommand({
  channel,
  shape = schema,
  webhookCommand: command,
}: InChannel): Promise<CookoutClient> {
  const admin = adminClient();
  await admin.createChannel({ name: channel });
  const { token } = await createTestAgent({ by: admin, name: command, owner: "admin" });
  await admin.addCommand({ description: "Ship a branch", name: command, schema: shape, url: nowhere });
  return testClient({ token });
}

interface Typing {
  readonly page: Page;
  readonly text: string;
}

async function pickByKeyboard(page: Page): Promise<Locator> {
  await expect(page.getByRole("listbox", { exact: true, name: "Command suggestions" }).getByRole("option")).toHaveText([
    `/${unique("browser-call-box")}Ship a branch`,
  ]);

  await page.keyboard.press("Tab");
  return page
    .getByRole("form", { exact: true, name: `Call /${unique("browser-call-box")}` })
    .getByRole("textbox", { exact: true, name: "branch" });
}

async function typeAndSend({ page, text }: Typing): Promise<void> {
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
}

async function openAsCaller({ channel, page }: Opened): Promise<void> {
  const { token } = await newIdentity({ kind: "human", name: unique("browser-command-caller") });
  await logInToChannels({ page, token });
  await sidebarLink({ label: `#${channel}`, page }).click();
  await page.getByRole("textbox", { exact: true, name: "Message" }).pressSequentially(`/${unique("browser-call-box")}`);
}

test("a Webhook command call and its result reply show their data", async ({ page }) => {
  const channel = unique("browser-command-shows");
  const command = unique("browser-show-call");
  const handler = await channelWithWebhookCommand({ channel, webhookCommand: command });
  const { threadId } = await adminClient().callCommand(command, {
    channel,
    data: { branch: "main" },
  });
  await handler.createMessage({
    channel,
    data: { status: "done" },
    replyTo: threadId,
    text: "Shipped main.",
  });

  const { token } = await newIdentity({ kind: "human", name: unique("browser-command-reader") });
  await logInToChannels({ page, token });
  await page.goto(`/#/channels/${channel}/threads/${String(threadId)}`);

  await expect(
    page
      .getByRole("article", { exact: true, name: "Parent message" })
      .getByLabel(`Call to /${command}`, { exact: true }),
  ).toHaveText(JSON.stringify({ branch: "main" }));
  await expect(page.getByRole("feed", { exact: true, name: "Replies" }).getByRole("article")).toContainText([
    "Shipped main.",
  ]);
});

test("a person calls a Webhook command from the message box by keyboard, and a refusal shows by its field", async ({
  page,
}) => {
  await channelWithWebhookCommand({
    channel: unique("browser-command-call"),
    webhookCommand: unique("browser-call-box"),
  });
  await openAsCaller({ channel: unique("browser-command-call"), page });

  const branch = await pickByKeyboard(page);

  await expect(branch).toBeFocused();

  await typeAndSend({ page, text: "x" });

  await expect(branch).toHaveAccessibleDescription("must NOT have fewer than 3 characters The branch to ship");
  await expect(branch).toHaveValue("x");

  await typeAndSend({ page, text: "-main" });

  await expect(page.getByRole("feed", { exact: true, name: "Messages" }).getByRole("article")).toContainText([
    `/${unique("browser-call-box")}${JSON.stringify({ branch: "x-main" })}`,
  ]);
  await expect(page.getByRole("textbox", { exact: true, name: "Message" })).toHaveValue("");
});

async function inlineBoxOf(page: Page, command: string): Promise<Locator> {
  const channel = unique("browser-command-inline");
  await channelWithWebhookCommand({ channel, shape: inlineSchema, webhookCommand: command });
  const { token } = await newIdentity({ kind: "human", name: unique("browser-inline-caller") });
  await logInToChannels({ page, token });
  await sidebarLink({ label: `#${channel}`, page }).click();
  const box = page.getByLabel("Message", { exact: true });
  await box.pressSequentially(`/${command}`);
  return box;
}

test("a person calls a one-text-field Webhook command inline: /name, Tab, the text and Enter", async ({ page }) => {
  const command = unique("browser-inline-deploy");
  const box = await inlineBoxOf(page, command);

  await expect(page.getByRole("listbox", { exact: true, name: "Command suggestions" }).getByRole("option")).toHaveText([
    `/${command}Ship a branch`,
  ]);
  await expect(page.getByRole("combobox", { exact: true, name: "Message" })).toBeFocused();

  await page.keyboard.press("Tab");

  await expect(box).toHaveValue(`/${command} `);
  await expect(box).toBeFocused();

  await typeAndSend({ page, text: "main" });

  await expect(page.getByRole("feed", { exact: true, name: "Messages" }).getByRole("article")).toContainText([
    `/${command}${JSON.stringify({ branch: "main" })}`,
  ]);
  await expect(box).toHaveValue("");
});
