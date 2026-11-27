import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import {
  openReplying,
  replyingIn,
  threadTexts,
  threadWithWebhookCommand,
  topLevelTexts,
} from "./reply-webhook-commands.ts";
import { adminClient } from "./identities.ts";
import { inThread } from "./regions.ts";

const TITLE = "Schedule a message";
const FIRST = 0;
const SCHEDULE_OPTION = "/scheduleSchedule a message";

function threadHash(channel: string, parent: number): string {
  return `#/channels/${channel}/threads/${String(parent)}`;
}

async function highlighted(): Promise<string | null> {
  const list = await inThread().findByRole("listbox", { name: "Command suggestions" });
  return within(list).getByRole("option", { selected: true }).textContent;
}

async function dialog(): Promise<HTMLElement> {
  const shown = await screen.findByRole("dialog", { name: TITLE });
  return shown;
}

async function savedOnce(channel: string): Promise<readonly string[]> {
  const shown = await dialog();
  fireEvent.change(within(shown).getByLabelText("Date"), { target: { value: "2099-06-01" } });
  fireEvent.change(within(shown).getByLabelText("Time"), { target: { value: "09:30" } });
  await within(shown).findByRole("list", { name: "Next runs" });
  fireEvent.click(within(shown).getByRole("button", { name: "Schedule" }));
  await inThread().findByText(/^Scheduled\. Its next run is/u);
  const { scheduledMessages } = await adminClient().listScheduledMessages({ channel });
  return scheduledMessages.map((schedule) => schedule.text);
}

it("in a thread's reply box, / lists /schedule first and highlighted, then the Webhook commands, and a prefix narrows it", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { parent } = await threadWithWebhookCommand({
    channel: "web-reply-sched-list",
    webhookCommand: { description: "Ship a branch", name: "web-reply-sched-deploy" },
  });
  const close = await openReplying({ hash: threadHash("web-reply-sched-list", parent), region: inThread() });
  const reply = replyingIn(inThread());

  const all = await reply.suggestions("/");
  const first = await highlighted();
  const narrowed = await reply.suggestions("/sc");
  reply.type("/x");

  expect([
    all[FIRST],
    first,
    all.includes("/web-reply-sched-deployShip a branch"),
    narrowed[FIRST],
    inThread().queryByRole("option", { name: /^\/schedule/u }),
  ]).toStrictEqual([SCHEDULE_OPTION, SCHEDULE_OPTION, true, SCHEDULE_OPTION, null]);

  await close();
});

it("sending /schedule and a text from a reply box opens the dialog for the thread's channel, and saving schedules it there and posts nothing", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const { parent } = await threadWithWebhookCommand({
    channel: "web-reply-sched-save",
    webhookCommand: { name: "web-reply-sched-save-deploy" },
  });
  const close = await openReplying({ hash: threadHash("web-reply-sched-save", parent), region: inThread() });
  const reply = replyingIn(inThread());

  reply.send("/schedule Standup in 5");
  const shown = await dialog();
  const text = within(shown).getByLabelText<HTMLInputElement>("Text").value;
  const says = within(shown).getByText(/not in this thread/u).textContent;

  expect([
    text,
    says,
    await savedOnce("web-reply-sched-save"),
    reply.box().value,
    await threadTexts(parent),
    await topLevelTexts("web-reply-sched-save"),
  ]).toStrictEqual([
    "Standup in 5",
    "Posts as you in #web-reply-sched-save, not in this thread, as a new message each time.",
    ["Standup in 5"],
    "",
    [],
    ["Ship it?"],
  ]);

  await close();
});

it("cancelling the dialog keeps /schedule and its text in the reply box, with focus in it", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { parent } = await threadWithWebhookCommand({
    channel: "web-reply-sched-cancel",
    webhookCommand: { name: "web-reply-sched-cancel-deploy" },
  });
  const close = await openReplying({ hash: threadHash("web-reply-sched-cancel", parent), region: inThread() });
  const reply = replyingIn(inThread());

  reply.send("/schedule Standup in 5");
  fireEvent.click(within(await dialog()).getByRole("button", { name: "Cancel" }));
  await waitFor(() => {
    expect(document.activeElement).toBe(reply.box());
  });

  expect([reply.box().value, screen.queryByRole("dialog", { name: TITLE }), await threadTexts(parent)]).toStrictEqual([
    "/schedule Standup in 5",
    null,
    [],
  ]);

  await close();
});
