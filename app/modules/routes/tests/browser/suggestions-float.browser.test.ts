import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inPane, inThread } from "./regions.ts";
import type { Locator } from "@playwright/test";
import { logIn } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const CHANNEL = "browser-suggestions-float";
const PARENT = "Who can take this one?";

interface Box {
  readonly form: Locator;
  readonly field: Locator;
  readonly region: Locator;
}

interface Size {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

async function sizeOf(form: Locator): Promise<Size | null> {
  const box = await form.boundingBox();
  if (box === null) {
    return null;
  }
  return { height: box.height, left: box.x, top: box.y, width: box.width };
}

interface Over {
  readonly list: Locator;
  readonly form: Locator;
}

async function isAbove({ form, list }: Over): Promise<boolean> {
  const [shown, under] = await Promise.all([sizeOf(list), sizeOf(form)]);
  return shown !== null && under !== null && shown.top + shown.height <= under.top;
}

async function expectUnmovedWhileSuggesting({ field, form, region }: Box): Promise<void> {
  await expect(field).toBeVisible();

  const before = await sizeOf(form);

  await field.pressSequentially("@");

  const list = region.getByRole("listbox", { exact: true, name: "Mention suggestions" });

  await expect(list).toBeVisible();
  expect(await sizeOf(form)).toStrictEqual(before);
  expect(await isAbove({ form, list })).toBe(true);
}

interface Opened {
  readonly channel: string;
  readonly token: string;
  readonly thread: string;
}

async function openedChannel(channel: string): Promise<Opened> {
  const admin = adminClient();
  await admin.createChannel({ name: channel });
  const { message } = await admin.createMessage({ channel, text: PARENT });
  await admin.createMessage({ channel, replyTo: message.id, text: "Maybe" });
  const { token } = await newIdentity({ kind: "human", name: `${channel}-reader` });
  return { channel, thread: String(message.id), token };
}

test("the @ suggestion list floats above a channel's message box without resizing it", async ({ page }) => {
  const { channel, token } = await openedChannel(unique(`${CHANNEL}-channel`));
  await logIn({ page, token });
  await page.goto(`/#/channels/${channel}`);

  await expectUnmovedWhileSuggesting({
    field: inPane(page).getByRole("textbox", { exact: true, name: "Message" }),
    form: inPane(page).getByRole("form", { exact: true, name: "Post to the channel" }),
    region: inPane(page),
  });
});

test("the @ suggestion list floats above a thread's reply box without resizing it", async ({ page }) => {
  const { channel, thread, token } = await openedChannel(unique(`${CHANNEL}-thread`));
  await logIn({ page, token });
  await page.goto(`/#/channels/${channel}/threads/${thread}`);

  await expectUnmovedWhileSuggesting({
    field: inThread(page).getByRole("textbox", { exact: true, name: "Reply" }),
    form: inThread(page).getByRole("form", { exact: true, name: "Reply to the thread" }),
    region: inThread(page),
  });
});
