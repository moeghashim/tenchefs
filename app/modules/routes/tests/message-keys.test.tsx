import { adminClient, agentOption, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, getDefaultNormalizer, screen, within } from "@testing-library/react";
import { messagesIn } from "./messages.ts";
import { openAt } from "./render.tsx";

const KEEP_SPACES = { normalizer: getDefaultNormalizer({ trim: false }) };

async function openChannel(channel: string): Promise<() => void> {
  await adminClient().createChannel({ name: channel });
  const close = openAt({ client: adminClient(), hash: `#/channels/${channel}` });
  await screen.findByLabelText("Message");
  return close;
}

function type(text: string): void {
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: text } });
}

function press(key: string, shiftKey = false): boolean {
  return fireEvent.keyDown(screen.getByLabelText("Message"), { key, shiftKey });
}

async function twoToMention(): Promise<void> {
  await newIdentity({ kind: "human", name: "keys-first" });
  await newIdentity({ kind: "agent", name: "keys-second" });
}

async function suggest(text: string): Promise<void> {
  type(text);
  await screen.findByRole("listbox", { name: "Mention suggestions" });
}

function pressEach(keys: readonly string[]): void {
  for (const key of keys) {
    press(key);
  }
}

async function shownMessages(): Promise<readonly string[]> {
  const shown = await messagesIn("Messages");
  return shown;
}

function highlighted(): string | null {
  const list = screen.getByRole("listbox", { name: "Mention suggestions" });
  return within(list).getByRole("option", { selected: true }).textContent;
}

it("pressing Enter in the message box sends the message and empties the box", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = await openChannel("web-keys-enter");
  type("Sent with Enter");
  press("Enter");
  await within(screen.getByRole("feed", { name: "Messages" })).findByText("Sent with Enter");

  expect([await shownMessages(), screen.queryByDisplayValue("Sent with Enter")]).toStrictEqual([
    ["adminSent with Enter"],
    null,
  ]);

  close();
});

it("pressing Shift+Enter sends nothing and leaves the key to start a new line", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = await openChannel("web-keys-shift-enter");
  type("First line");
  press("a");
  const notPrevented = press("Enter", true);

  expect([notPrevented, await shownMessages(), screen.queryByDisplayValue("First line")]).toStrictEqual([
    true,
    [],
    screen.getByLabelText("Message"),
  ]);

  close();
});

it("while suggestions show, the arrows move the highlight and Enter picks it instead of sending", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await twoToMention();
  const close = await openChannel("web-keys-pick");
  await suggest("Ping @keys-");
  const first = highlighted();
  pressEach(["ArrowDown", "ArrowDown", "Shift", "ArrowUp"]);
  const moved = highlighted();
  press("Enter");

  expect([
    first,
    moved,
    screen.queryByDisplayValue("Ping @keys-second ", KEEP_SPACES),
    screen.queryByRole("listbox", { name: "Mention suggestions" }),
    await shownMessages(),
  ]).toStrictEqual(["@keys-first", agentOption("keys-second"), screen.getByLabelText("Message"), null, []]);

  close();
});

async function twoWebhookCommands(prefix: string): Promise<void> {
  const schema = { properties: { branch: { type: "string" }, count: { type: "integer" } }, type: "object" } as const;
  await Promise.all(
    [`${prefix}-first`, `${prefix}-second`].map(async (name) => {
      await newIdentity({ kind: "agent", name, owner: "admin" });
      await adminClient().addCommand({ name, schema, url: "http://127.0.0.1:9/command" });
    }),
  );
}

async function suggestWebhookCommands(text: string): Promise<void> {
  type(text);
  await screen.findByRole("listbox", { name: "Command suggestions" });
}

function highlightedWebhookCommand(): string | null {
  const list = screen.getByRole("listbox", { name: "Command suggestions" });
  return within(list).getByRole("option", { selected: true }).textContent;
}

it("while command suggestions show, the arrows move the highlight and Tab picks it", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await twoWebhookCommands("keys-tab");
  const close = await openChannel("web-keys-command-tab");
  await suggestWebhookCommands("/keys-tab-");
  const first = highlightedWebhookCommand();
  press("ArrowUp");
  const moved = highlightedWebhookCommand();
  const prevented = !press("Tab");

  expect([first, moved, prevented, screen.queryByRole("form", { name: "Call /keys-tab-second" })]).toStrictEqual([
    "/keys-tab-first",
    "/keys-tab-second",
    true,
    screen.getByRole("form", { name: "Call /keys-tab-second" }),
  ]);

  close();
});

it("while command suggestions show, Enter picks the highlighted Webhook command and sends nothing", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await twoWebhookCommands("keys-enter");
  const close = await openChannel("web-keys-command-enter");
  await suggestWebhookCommands("/keys-enter-");
  press("Enter");

  expect([await shownMessages(), screen.queryByRole("form", { name: "Call /keys-enter-first" })]).toStrictEqual([
    [],
    screen.getByRole("form", { name: "Call /keys-enter-first" }),
  ]);

  close();
});

it("escape closes the command suggestions, so Enter sends the text as a message", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await twoWebhookCommands("keys-escape");
  const close = await openChannel("web-keys-command-escape");
  await suggestWebhookCommands("/keys-escape-f");
  press("Escape");
  const closed = screen.queryByRole("listbox", { name: "Command suggestions" });
  press("Enter");
  await within(screen.getByRole("feed", { name: "Messages" })).findByText("/keys-escape-f");

  expect([closed, await shownMessages()]).toStrictEqual([null, ["admin/keys-escape-f"]]);

  close();
});
