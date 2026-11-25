import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { expect, test } from "@playwright/test";
import { inPane, inThread } from "./regions.ts";
import { createTestAgent } from "../../../testing/index.ts";
import { logInToChannels } from "./login.ts";
import { unique } from "./names.ts";

const LAST = -1;
const MESSAGE_BOX = { exact: true, name: "Message" } as const;
const NOWHERE = "http://127.0.0.1:9/command";
const SCHEMA = { properties: { version: { type: "string" } }, required: ["version"], type: "object" } as const;

function postForm(page: Page): Locator {
  return inPane(page).getByRole("form", { exact: true, name: "Post to the channel" });
}

async function openChannel(page: Page, channel: string): Promise<void> {
  await adminClient().createChannel({ name: channel });
  const person = await newIdentity({ kind: "human", name: `${channel}-ann` });
  await logInToChannels({ page, token: person.token });
  await page.goto(`/#/channels/${channel}`);

  await expect(postForm(page).getByRole("textbox", MESSAGE_BOX)).toBeVisible();
}

async function pasted(page: Page, names: readonly string[]): Promise<void> {
  await postForm(page).getByRole("textbox", MESSAGE_BOX).focus();
  await page.evaluate((files: readonly string[]) => {
    const data = new DataTransfer();
    for (const name of files) {
      data.items.add(new File(["notes"], name, { type: "text/plain" }));
    }
    (document.activeElement ?? document.body).dispatchEvent(
      new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }),
    );
  }, names);

  await expect(
    postForm(page).getByRole("button", { exact: true, name: `Remove ${names.at(LAST) ?? ""}` }),
  ).toBeVisible();
}

function scheduleDialog(page: Page): Locator {
  return page.getByRole("dialog", { exact: true, name: "Schedule a message" });
}

async function pressedOn(control: Locator): Promise<void> {
  await control.focus();
  await control.press("Enter");
}

test("removing an attachment focuses the next one's Remove, and the message box once none is left", async ({
  page,
}) => {
  await openChannel(page, unique("browser-kept-remove"));
  await pasted(page, ["a.txt", "b.txt"]);
  const form = postForm(page);

  await pressedOn(form.getByRole("button", { exact: true, name: "Remove a.txt" }));

  await expect(form.getByRole("button", { exact: true, name: "Remove b.txt" })).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(form.getByRole("button", { exact: true, name: "Remove b.txt" })).toBeHidden();
  await expect(form.getByRole("textbox", MESSAGE_BOX)).toBeFocused();
});

async function channelWithCommand(channel: string, command: string): Promise<void> {
  const admin = adminClient();
  await admin.createChannel({ name: channel });
  await createTestAgent({ by: admin, name: command, owner: "admin" });
  await admin.addCommand({ name: command, schema: SCHEMA, url: NOWHERE });
}

async function openAsCaller(page: Page, channel: string): Promise<void> {
  const person = await newIdentity({ kind: "human", name: `${channel}-caller` });
  await logInToChannels({ page, token: person.token });
  await page.goto(`/#/channels/${channel}`);
}

async function commandPrompt(page: Page): Promise<Locator> {
  const channel = unique("browser-kept-call");
  const command = unique("browser-kept-roll");
  await channelWithCommand(channel, command);
  await openAsCaller(page, channel);
  await postForm(page).getByRole("textbox", MESSAGE_BOX).pressSequentially(`/${command}`);

  await expect(page.getByRole("listbox", { exact: true, name: "Command suggestions" })).toBeVisible();

  await page.keyboard.press("Tab");
  const prompt = inPane(page).getByRole("form", { exact: true, name: `Call /${command}` });

  await expect(prompt).toBeVisible();

  return prompt;
}

test("calling a command from its form lands focus back on the message box", async ({ page }) => {
  const prompt = await commandPrompt(page);
  await prompt.getByRole("textbox", { exact: true, name: "version" }).fill("1.0.0");
  await prompt.getByRole("textbox", { exact: true, name: "version" }).press("Enter");

  await expect(prompt).toBeHidden();
  await expect(postForm(page).getByRole("textbox", MESSAGE_BOX)).toBeFocused();
});

test("the command form's Cancel lands focus back on the message box", async ({ page }) => {
  const prompt = await commandPrompt(page);

  await pressedOn(prompt.getByRole("button", { exact: true, name: "Cancel" }));

  await expect(prompt).toBeHidden();
  await expect(postForm(page).getByRole("textbox", MESSAGE_BOX)).toBeFocused();
});

test("the schedule dialog's Cancel lands focus back on Post later", async ({ page }) => {
  await openChannel(page, unique("browser-kept-schedule"));
  await pressedOn(postForm(page).getByRole("button", { exact: true, name: "Post later" }));
  await page.getByRole("menuitem", { exact: true, name: "Schedule…" }).press("Enter");

  await pressedOn(scheduleDialog(page).getByRole("button", { exact: true, name: "Cancel" }));

  await expect(scheduleDialog(page)).toBeHidden();
  await expect(postForm(page).getByRole("button", { exact: true, name: "Post later" })).toBeFocused();
});

async function openThread(page: Page): Promise<string> {
  const channel = unique("browser-kept-thread");
  const admin = adminClient();
  await admin.createChannel({ name: channel });
  const text = `Kept focus ${channel}`;
  const { message } = await admin.createMessage({ channel, text });
  const person = await newIdentity({ kind: "human", name: `${channel}-ann` });
  await logInToChannels({ page, token: person.token });
  await page.goto(`/#/channels/${channel}/threads/${String(message.id)}`);

  await expect(inThread(page).getByRole("textbox", { exact: true, name: "Reply" })).toBeVisible();

  return text;
}

test("closing a thread from its bar focuses the Reopen thread that replaces it, and back", async ({ page }) => {
  await openThread(page);

  await pressedOn(inThread(page).getByRole("button", { exact: true, name: "Close thread" }));

  await expect(inThread(page).getByRole("button", { exact: true, name: "Reopen thread" })).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(inThread(page).getByRole("button", { exact: true, name: "Close thread" })).toBeFocused();
});

test("the thread's Close panel link lands focus on the thread's message in the channel", async ({ page }) => {
  const text = await openThread(page);

  await pressedOn(inThread(page).getByRole("link", { exact: true, name: "Close panel" }));

  await expect(inThread(page)).toBeHidden();
  await expect(inPane(page).getByRole("article").filter({ hasText: text })).toBeFocused();
});
