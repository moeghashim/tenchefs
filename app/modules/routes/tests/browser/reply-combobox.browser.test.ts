import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { expect, test as playwrightTest } from "@playwright/test";
import { createTestAgent } from "../../../testing/index.ts";
import { inThread } from "./regions.ts";
import { logIn } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = playwrightTest.extend(probeFixtures);

const nowhere = "http://127.0.0.1:9/command";
interface Listed {
  readonly box: Locator;
  readonly prefix: string;
}

const schema = { properties: { branch: { type: "string" }, count: { type: "integer" } }, type: "object" } as const;

async function replyBoxIn(page: Page, channel: string): Promise<Locator> {
  await adminClient().createChannel({ name: channel });
  const { message } = await adminClient().createMessage({ channel, text: "Ship it?" });
  const { token } = await newIdentity({ kind: "human", name: `${channel}-writer` });
  await logIn({ page, token, url: `/#/channels/${channel}/threads/${String(message.id)}` });
  return inThread(page).locator("textarea[name=text]");
}

async function activeOption(box: Locator): Promise<string | null> {
  const id = await box.getAttribute("aria-activedescendant");
  if (id === null) {
    return null;
  }
  return box.page().locator(`[id="${id}"]`).textContent();
}

async function twoWebhookCommands(base: string): Promise<string> {
  const prefix = unique(base);
  const admin = adminClient();
  await Promise.all(
    [`${prefix}-first`, `${prefix}-second`].map(async (name) => {
      await createTestAgent({ by: admin, name, owner: "admin" });
      await admin.addCommand({ name, schema, url: nowhere });
    }),
  );
  return prefix;
}

function commandList(page: Page): Locator {
  return inThread(page).getByRole("listbox", { exact: true, name: "Command suggestions" });
}

async function expectActive(box: Locator, text: string): Promise<void> {
  await expect(commandList(box.page()).getByRole("option", { selected: true })).toHaveText(text);
  await expect
    .poll(async () => {
      const active = await activeOption(box);
      return active;
    })
    .toBe(text);
}

async function listedIn(page: Page, base: string): Promise<Listed> {
  const prefix = await twoWebhookCommands(base);
  const box = await replyBoxIn(page, unique(`${base}-thread`));
  await box.pressSequentially(`/${prefix}-`);
  return { box, prefix };
}

test("a thread's reply box lists Webhook commands as a combobox's listbox", async ({ page }) => {
  const { box, prefix } = await listedIn(page, "browser-reply-combo");

  await expect(inThread(page).getByRole("combobox", { exact: true, name: "Reply" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(box).toHaveAttribute("aria-controls", (await commandList(page).getAttribute("id")) ?? "");
  await expect(commandList(page).getByRole("option")).toHaveText([`/${prefix}-first`, `/${prefix}-second`]);

  await expectActive(box, `/${prefix}-first`);
});

test("in a thread's reply box the arrows wrap through the Webhook commands and Escape keeps the text", async ({
  page,
}) => {
  const { box, prefix } = await listedIn(page, "browser-reply-wrap");

  await page.keyboard.press("ArrowUp");
  await expectActive(box, `/${prefix}-second`);
  await page.keyboard.press("ArrowDown");
  await expectActive(box, `/${prefix}-first`);
  await page.keyboard.press("Escape");

  await expect(commandList(page)).toBeHidden();
  await expect(box).toHaveValue(`/${prefix}-`);
  await expect(box).toBeFocused();
});

test("Enter in a thread's reply box picks the highlighted Webhook command and opens its form", async ({ page }) => {
  const { box, prefix } = await listedIn(page, "browser-reply-pick");
  await page.keyboard.press("ArrowDown");
  await expectActive(box, `/${prefix}-second`);
  await page.keyboard.press("Enter");

  await expect(inThread(page).getByRole("form", { exact: true, name: `Call /${prefix}-second` })).toBeVisible();
});

test("in a thread's reply box, / and Enter pick /schedule, and sending it with a text opens the schedule dialog with that text", async ({
  page,
}) => {
  const box = await replyBoxIn(page, unique("browser-reply-schedule"));
  await box.pressSequentially("/");
  await expectActive(box, "/scheduleSchedule a message");
  await page.keyboard.press("Enter");

  await expect(box).toHaveValue("/schedule ");

  await box.pressSequentially("Standup in 5");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { exact: true, name: "Schedule a message" });

  await expect(dialog.getByLabel("Text", { exact: true })).toHaveValue("Standup in 5");
});
