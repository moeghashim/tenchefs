import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inPane, inThread } from "./regions.ts";
import type { Locator } from "@playwright/test";
import { logIn } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const CHANNEL = "browser-composer-row";
const HALF = 2;
const NONE = 0;
const WIDE = { height: 900, width: 1400 };

interface Line {
  readonly middle: number;
  readonly height: number;
}

async function lineOf(button: Locator): Promise<Line> {
  await expect(button).toBeVisible();

  const box = await button.boundingBox();
  if (box === null) {
    return { height: NONE, middle: NONE };
  }
  return { height: box.height, middle: box.y + box.height / HALF };
}

interface Opened {
  readonly channel: string;
  readonly token: string;
  readonly thread: string;
}

async function openedChannel(channel: string): Promise<Opened> {
  const admin = adminClient();
  await admin.createChannel({ name: channel });
  const { message } = await admin.createMessage({ channel, text: "Line these up" });
  const { token } = await newIdentity({ kind: "human", name: `${channel}-writer` });
  return { channel, thread: String(message.id), token };
}

async function rowOf(form: Locator): Promise<readonly [Line, Line]> {
  const send = await lineOf(form.getByRole("button", { exact: true, name: "Send" }));
  const attach = await lineOf(form.getByRole("button", { exact: true, name: "Attach files" }));
  return [send, attach];
}

function channelBox(pane: Locator): Locator {
  return pane.getByRole("form", { exact: true, name: "Post to the channel" });
}

test("the channel composer's attach button shares Send's height and vertical centre, and Send has no Post later beside it", async ({
  page,
}) => {
  const { channel, token } = await openedChannel(unique(`${CHANNEL}-channel`));
  await page.setViewportSize(WIDE);
  await logIn({ page, token });
  await page.goto(`/#/channels/${channel}`);

  const form = channelBox(inPane(page));
  const [send, attach] = await rowOf(form);

  expect(attach).toStrictEqual(send);
  await expect(form.getByRole("button", { exact: true, name: "Post later" })).toHaveCount(NONE);
});

test("with a thread open, both composers' buttons keep Send's height and centre", async ({ page }) => {
  const { channel, thread, token } = await openedChannel(unique(`${CHANNEL}-thread`));
  await page.setViewportSize(WIDE);
  await logIn({ page, token });
  await page.goto(`/#/channels/${channel}/threads/${thread}`);

  const reply = inThread(page).getByRole("form", { exact: true, name: "Reply to the thread" });
  const [send, attach] = await rowOf(channelBox(inPane(page)));
  const [replySend, replyAttach] = await rowOf(reply);

  expect([attach, replySend.height, replyAttach]).toStrictEqual([send, send.height, replySend]);
});
