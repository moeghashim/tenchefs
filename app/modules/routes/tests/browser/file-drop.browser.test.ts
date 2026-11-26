import type { JSHandle, Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { expect, test } from "@playwright/test";
import { inConversation, inPane, inSidebar, inThread } from "./regions.ts";
import { hillsPng } from "../../../testing/index.ts";
import { logInToChannels } from "./login.ts";
import { unique } from "./names.ts";

const CHANNEL_FORM = "Post to the channel";
const REPLY_FORM = "Reply to the thread";
const NATURAL_WIDTH = 480;
const ONE_TAB = 1;

interface Board {
  readonly channel: string;
  readonly parent: string;
  readonly token: string;
}

interface Opening {
  readonly page: Page;
  readonly hash: string;
  readonly token: string;
}

interface Prevented {
  readonly dragOver: boolean;
  readonly drop: boolean;
}

async function board(name: string): Promise<Board> {
  const channel = unique(name);
  await adminClient().createChannel({ name: channel });
  const person = await newIdentity({ kind: "human", name: `${channel}-ann` });
  const agent = await newIdentity({ displayName: "Bot", kind: "agent", name: `${channel}-bot` });
  const { message } = await agent.client.createMessage({ channel, text: "Send me the logs" });
  return { channel, parent: String(message.id), token: person.token };
}

async function opened({ hash, page, token }: Opening): Promise<void> {
  await logInToChannels({ page, token });
  await page.goto(`/${hash}`);
}

async function filesOf(page: Page, name: string): Promise<JSHandle<DataTransfer>> {
  const files = await page.evaluateHandle((fileName: string) => {
    const carried = new DataTransfer();
    carried.items.add(new File(["the logs"], fileName, { type: "text/plain" }));
    return carried;
  }, name);
  return files;
}

async function dropFile(target: Locator, name: string): Promise<void> {
  const dataTransfer = await filesOf(target.page(), name);
  await target.dispatchEvent("dragenter", { dataTransfer });
  await target.dispatchEvent("dragover", { dataTransfer });
  await target.dispatchEvent("drop", { dataTransfer });
}

function pendingIn(region: Locator, form: string): Locator {
  return region
    .getByRole("form", { exact: true, name: form })
    .getByRole("list", { exact: true, name: "Files to send" });
}

test("a file dropped on a channel's message list, or on the hint under its box, waits in the channel's box", async ({
  page,
}) => {
  const { channel, token } = await board("browser-drop-channel");
  await opened({ hash: `#/channels/${channel}`, page, token });
  const list = inPane(page).getByRole("region", { exact: true, name: `Messages in #${channel}` });

  await expect(list).toContainText("Send me the logs");

  await dropFile(list, "list.txt");
  await dropFile(
    inPane(page).getByText("Enter to send · Shift+Enter for a new line · @ to mention", { exact: true }),
    "hint.txt",
  );

  await expect(pendingIn(inPane(page), CHANNEL_FORM)).toContainText("list.txt");
  await expect(pendingIn(inPane(page), CHANNEL_FORM)).toContainText("hint.txt");
});

test("with a thread open, a file dropped on the thread goes to its reply box and one dropped on the channel to the channel's", async ({
  page,
}) => {
  const { channel, parent, token } = await board("browser-drop-thread");
  await opened({ hash: `#/channels/${channel}/threads/${parent}`, page, token });
  const replies = inThread(page).getByRole("region", { exact: true, name: "The thread's messages" });

  await expect(replies).toContainText("Send me the logs");

  await dropFile(replies, "for-thread.txt");
  await dropFile(inPane(page).getByRole("region", { exact: true, name: `Messages in #${channel}` }), "for-channel.txt");

  await expect(pendingIn(inThread(page), REPLY_FORM)).toContainText("for-thread.txt");
  await expect(pendingIn(inThread(page), REPLY_FORM)).not.toContainText("for-channel.txt");
  await expect(pendingIn(inPane(page), CHANNEL_FORM)).toContainText("for-channel.txt");
  await expect(pendingIn(inPane(page), CHANNEL_FORM)).not.toContainText("for-thread.txt");
});

test("a file dropped on an Inbox conversation's messages waits in its reply box", async ({ page }) => {
  const { channel, parent, token } = await board("browser-drop-inbox");
  await opened({ hash: `#/inbox/${channel}/${parent}`, page, token });
  const messages = inConversation(page).getByRole("region", { exact: true, name: "The conversation's messages" });

  await expect(messages).toContainText("Send me the logs");

  await dropFile(messages, "inbox.txt");

  await expect(pendingIn(inConversation(page), REPLY_FORM)).toContainText("inbox.txt");
});

async function channelList(page: Page, name: string): Promise<Locator> {
  const { channel, token } = await board(name);
  await opened({ hash: `#/channels/${channel}`, page, token });
  const list = inPane(page).getByRole("region", { exact: true, name: `Messages in #${channel}` });

  await expect(list).toContainText("Send me the logs");

  return list;
}

test("files dragged over a conversation light it up until they leave", async ({ page }) => {
  const list = await channelList(page, "browser-drop-lit");
  const lit = inPane(page).locator(`[data-dropping="true"]`);
  const dataTransfer = await filesOf(page, "notes.txt");

  await list.dispatchEvent("dragenter", { dataTransfer });

  await expect(lit).toBeAttached();

  await list.dispatchEvent("dragleave", { dataTransfer });

  await expect(lit).not.toBeAttached();
});

test("files dropped on a conversation stop lighting it up", async ({ page }) => {
  const list = await channelList(page, "browser-drop-unlit");
  const lit = inPane(page).locator(`[data-dropping="true"]`);
  const dataTransfer = await filesOf(page, "notes.txt");
  await list.dispatchEvent("dragenter", { dataTransfer });

  await expect(lit).toBeAttached();

  await list.dispatchEvent("drop", { dataTransfer });

  await expect(lit).not.toBeAttached();
});

test("a file dropped outside any conversation is refused, so the browser never opens it", async ({ page }) => {
  const { channel, token } = await board("browser-drop-stray");
  await opened({ hash: `#/channels/${channel}`, page, token });

  await expect(inSidebar(page)).toBeVisible();

  const prevented = await inSidebar(page).evaluate((sidebar: Pick<HTMLElement, "dispatchEvent">): Prevented => {
    const carried = new DataTransfer();
    carried.items.add(new File(["the logs"], "stray.txt", { type: "text/plain" }));
    const init = { bubbles: true, cancelable: true, dataTransfer: carried };
    return {
      dragOver: !sidebar.dispatchEvent(new DragEvent("dragover", init)),
      drop: !sidebar.dispatchEvent(new DragEvent("drop", init)),
    };
  });

  expect(prevented).toStrictEqual({ dragOver: true, drop: true });
  expect(page.context().pages()).toHaveLength(ONE_TAB);
});

test("an image pasted with its file only in the clipboard's items shows its thumbnail before sending", async ({
  page,
}) => {
  const { channel, token } = await board("browser-paste-items");
  await opened({ hash: `#/channels/${channel}`, page, token });
  const form = inPane(page).getByRole("form", { exact: true, name: CHANNEL_FORM });
  await form.getByRole("textbox").focus();

  await page.evaluate(
    (png: readonly number[]) => {
      const file = new File([Uint8Array.from(png)], "hills.png", { type: "image/png" });
      const pasted = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(pasted, "clipboardData", {
        value: {
          files: [],
          getData: (): string => "",
          items: [
            { getAsFile: (): null => null, kind: "string", type: "text/html" },
            { getAsFile: (): File => file, kind: "file", type: "image/png" },
          ],
          types: ["text/html", "Files"],
        },
      });
      (document.activeElement ?? document.body).dispatchEvent(pasted);
    },
    [...hillsPng()],
  );

  await expect(form.getByRole("img", { exact: true, name: "hills.png" })).toHaveJSProperty(
    "naturalWidth",
    NATURAL_WIDTH,
  );
});
