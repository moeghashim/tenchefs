import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inConversation, inPane, inThread } from "./regions.ts";
import { hillsPng } from "../../../testing/index.ts";
import { logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const CHORD = "Control+Shift+U";
const DRAFT = "The view";
const ONE_FILE = 1;
const LIST = { exact: true, name: "Keyboard shortcuts" } as const;

async function openedAt(page: Page, channel: string, path: string): Promise<void> {
  const { token } = await newIdentity({ kind: "human", name: `${channel}-ann` });
  await logInWithStream({ page, token });
  await page.goto(`/#/channels/${channel}${path}`);
}

interface Attaching {
  readonly page: Page;
  readonly box: Locator;
  readonly form: Locator;
}

async function attachedByKey({ box, form, page }: Attaching): Promise<void> {
  await box.fill(DRAFT);
  const chosen = page.waitForEvent("filechooser");

  await expect(box).toBeFocused();

  await page.keyboard.press(CHORD);
  const fileChooser = await chosen;
  await fileChooser.setFiles([{ buffer: Buffer.from(hillsPng()), mimeType: "image/png", name: "hills.png" }]);

  await expect(form.getByRole("list", { exact: true, name: "Files to send" }).getByRole("listitem")).toHaveCount(
    ONE_FILE,
  );
  await expect(box).toBeFocused();
  await expect(box).toHaveValue(DRAFT);
}

test("Ctrl+Shift+U in the message box opens the file chooser, and the chosen file waits in the box with focus back in it", async ({
  page,
}) => {
  const channel = unique("browser-attach-key");
  await adminClient().createChannel({ name: channel });
  await openedAt(page, channel, "");
  const form = inPane(page).getByRole("form", { exact: true, name: "Post to the channel" });

  await attachedByKey({ box: form.getByRole("textbox", { exact: true, name: "Message" }), form, page });
});

test("Ctrl+Shift+U in a thread's reply box opens the file chooser for the reply", async ({ page }) => {
  const channel = unique("browser-attach-key-thread");
  await adminClient().createChannel({ name: channel });
  const { message: parent } = await adminClient().createMessage({ channel, text: "The parent." });
  await openedAt(page, channel, `/threads/${String(parent.id)}`);
  const form = inThread(page).getByRole("form", { exact: true, name: "Reply to the thread" });

  await attachedByKey({ box: form.getByRole("textbox", { exact: true, name: "Reply" }), form, page });
});

test("Ctrl+Shift+U in an Inbox reply box opens the file chooser for the reply", async ({ page }) => {
  const channel = unique("browser-attach-key-inbox");
  await adminClient().createChannel({ name: channel });
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  const { message: parent } = await adminClient().createMessage({ channel, text: "Files?" });
  await reader.client.follow(parent.id);
  await adminClient().createMessage({ channel, replyTo: parent.id, text: "Anyone?" });
  await logInWithStream({ page, token: reader.token });
  await page.goto(`/#/inbox/${channel}/${String(parent.id)}`);
  const form = inConversation(page).getByRole("form", { exact: true, name: "Reply to the thread" });

  await attachedByKey({ box: form.getByRole("textbox", { exact: true, name: "Reply" }), form, page });
});

test("Attach files names its key in aria-keyshortcuts and its tooltip, and the shortcut list names it", async ({
  page,
}) => {
  const channel = unique("browser-attach-key-list");
  await adminClient().createChannel({ name: channel });
  await openedAt(page, channel, "");
  const attach = inPane(page).getByRole("button", { exact: true, name: "Attach files" });

  await expect(attach).toHaveAttribute("aria-keyshortcuts", CHORD);
  await expect(attach).toHaveAttribute("title", "Attach files (Ctrl+Shift+U)");

  await page.keyboard.press("?");
  const row = page
    .getByRole("dialog", LIST)
    .getByRole("list", { exact: true, name: "Message box" })
    .getByRole("listitem")
    .filter({ hasText: "Attach files" });

  await expect(row).toContainText("Ctrl+Shift+U");
});
