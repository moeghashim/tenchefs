import { addWebhookCommand, channelWithWebhookCommand } from "./webhook-commands.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { inPane, inThread } from "./regions.ts";
import { adminClient } from "./identities.ts";
import { openAt } from "./render.tsx";

const TITLE = "Schedule a message";
const COMMANDS = { name: "Command suggestions" };
const FIRST = 0;

async function openChannel(channel: string): Promise<() => void> {
  await adminClient().createChannel({ name: channel });
  const close = openAt({ client: adminClient(), hash: `#/channels/${channel}` });
  await screen.findByLabelText("Message");
  return close;
}

function box(): HTMLTextAreaElement {
  return screen.getByLabelText<HTMLTextAreaElement>("Message");
}

function type(text: string): void {
  fireEvent.change(box(), { target: { value: text } });
}

function send(text: string): void {
  type(text);
  fireEvent.keyDown(box(), { key: "Enter" });
}

interface Listed {
  readonly options: readonly (string | null)[];
  readonly highlighted: string | null;
}

async function listedFor(text: string): Promise<Listed> {
  type(text);
  const list = await screen.findByRole("listbox", COMMANDS);
  const options: (string | null)[] = [];
  for (const option of within(list).getAllByRole("option")) {
    options.push(option.textContent);
  }
  return { highlighted: within(list).getByRole("option", { selected: true }).textContent, options };
}

function scheduleOptions(listed: Listed): readonly (string | null)[] {
  return listed.options.filter((option) => (option ?? "").startsWith("/schedule"));
}

async function savedOnce(channel: string): Promise<readonly string[]> {
  const dialog = screen.getByRole("dialog", { name: TITLE });
  fireEvent.change(within(dialog).getByLabelText("Date"), { target: { value: "2099-06-01" } });
  fireEvent.change(within(dialog).getByLabelText("Time"), { target: { value: "09:30" } });
  await within(dialog).findByRole("list", { name: "Next runs" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Schedule" }));
  await inPane().findByText(/^Scheduled\. Its next run is/u);
  const { scheduledMessages } = await adminClient().listScheduledMessages({ channel });
  return scheduledMessages.map((schedule) => schedule.text);
}

async function messageTexts(channel: string): Promise<readonly string[]> {
  const { messages } = await adminClient().listMessages(channel);
  return messages.map((message) => message.text);
}

async function pickedByEnter(text: string): Promise<string> {
  type(text);
  await screen.findByRole("listbox", COMMANDS);
  fireEvent.keyDown(box(), { key: "Enter" });
  return box().value;
}

async function dialogText(): Promise<string> {
  const dialog = await screen.findByRole("dialog", { name: TITLE });
  return within(dialog).getByLabelText<HTMLInputElement>("Text").value;
}

async function cancelled(): Promise<void> {
  fireEvent.click(within(screen.getByRole("dialog", { name: TITLE })).getByRole("button", { name: "Cancel" }));
  await waitFor(() => {
    expect(screen.queryByRole("dialog", { name: TITLE })).toBeNull();
  });
}

it("typing / lists /schedule with its description, first and highlighted, then the registered Webhook commands", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await channelWithWebhookCommand({
    channel: "web-slash-list",
    webhookCommand: { description: "Ship a branch", name: "web-slash-deploy" },
  });
  await addWebhookCommand({ description: "Not this one", name: "schedule" });
  const close = await openChannel("web-slash-list-box");

  const all = await listedFor("/");
  const narrowed = await listedFor("/sc");
  type("/x");

  expect([
    all.options[FIRST],
    all.highlighted,
    scheduleOptions(all),
    all.options.includes("/web-slash-deployShip a branch"),
    narrowed.options[FIRST],
    screen.queryByRole("option", { name: /^\/schedule/u }),
  ]).toStrictEqual([
    "/scheduleSchedule a message",
    "/scheduleSchedule a message",
    ["/scheduleSchedule a message"],
    true,
    "/scheduleSchedule a message",
    null,
  ]);

  close();
});

it("picking /schedule leaves /schedule and a space in the box, and posts nothing", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = await openChannel("web-slash-pick");
  const list = await listedFor("/sch");
  fireEvent.mouseDown(screen.getByRole("option", { name: /^\/schedule/u }));
  const picked = box().value;
  const entered = await pickedByEnter("/sch");

  expect([
    list.highlighted,
    picked,
    entered,
    screen.queryByRole("listbox", COMMANDS),
    await messageTexts("web-slash-pick"),
  ]).toStrictEqual(["/scheduleSchedule a message", "/schedule ", "/schedule ", null, []]);

  close();
});

it("sending /schedule and a text opens the schedule dialog with that text, and saving it posts nothing", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const close = await openChannel("web-slash-save");
  send("/schedule Standup in 5");
  const text = await dialogText();
  const saved = await savedOnce("web-slash-save");

  expect([text, saved, box().value, await messageTexts("web-slash-save")]).toStrictEqual([
    "Standup in 5",
    ["Standup in 5"],
    "",
    [],
  ]);

  close();
});

it("sending /schedule alone with Send opens the dialog with an empty text", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = await openChannel("web-slash-alone");
  type("/schedule");
  fireEvent.click(inPane().getByRole("button", { name: "Send" }));

  await expect(dialogText()).resolves.toBe("");

  close();
});

it("cancelling the dialog keeps /schedule and its text in the box", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = await openChannel("web-slash-cancel");
  send("/schedule Standup in 5");
  await dialogText();
  await cancelled();

  expect([box().value, await messageTexts("web-slash-cancel")]).toStrictEqual(["/schedule Standup in 5", []]);

  close();
});

it("text starting with a /word that names no Command, such as /schedules, posts as an ordinary message", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const close = await openChannel("web-slash-ordinary");
  send("/schedules now");
  await within(screen.getByRole("feed", { name: "Messages" })).findByText("/schedules now");

  expect([await messageTexts("web-slash-ordinary"), screen.queryByRole("dialog", { name: TITLE })]).toStrictEqual([
    ["/schedules now"],
    null,
  ]);

  close();
});

it("no message box has a Post later button, and a thread's reply box lists no Commands after /", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await adminClient().createChannel({ name: "web-slash-thread" });
  const { message } = await adminClient().createMessage({ channel: "web-slash-thread", text: "The parent" });
  const close = openAt({ client: adminClient(), hash: `#/channels/web-slash-thread/threads/${String(message.id)}` });
  const reply = await inThread().findByRole("textbox", { name: "Reply" });
  await inPane().findByRole("textbox", { name: "Message" });
  fireEvent.change(reply, { target: { value: "/" } });

  expect([
    inPane().queryByRole("button", { name: "Post later" }),
    inThread().queryByRole("button", { name: "Post later" }),
    inThread().queryByRole("listbox", COMMANDS),
  ]).toStrictEqual([null, null, null]);

  close();
});

it("ctrl+Shift+Enter on /schedule and a text opens the dialog with the text after /schedule", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const close = await openChannel("web-slash-key");
  type("/schedule Standup by key");
  box().focus();
  fireEvent.keyDown(box(), { ctrlKey: true, key: "Enter", shiftKey: true });

  await expect(dialogText()).resolves.toBe("Standup by key");

  close();
});
