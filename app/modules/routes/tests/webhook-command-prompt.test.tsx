import {
  addWebhookCommand,
  channelWithWebhookCommand,
  openChannel,
  pickWebhookCommand,
  suggestedFor,
  type,
} from "./webhook-commands.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { adminClient } from "./identities.ts";
import { inPane } from "./regions.ts";
import { openAt } from "./render.tsx";

const fieldsSchema = {
  properties: {
    branch: { description: "The branch to ship", type: "string" },
    count: { type: "integer" },
    dry: { description: "Only pretend", type: "boolean" },
    env: { enum: ["staging", "prod"], type: "string" },
    ratio: { type: "number" },
  },
  required: ["branch"],
  type: "object",
} as const;

function field(name: string): HTMLElement {
  return within(screen.getByRole("form", { name: "Call /web-fields" })).getByLabelText(name);
}

function optionsShown(): readonly (string | null)[] {
  const shown: (string | null)[] = [];
  for (const option of within(field("env")).getAllByRole("option")) {
    shown.push(option.textContent);
  }
  return shown;
}

it("typing / suggests the registered Webhook commands with their descriptions, narrowed as the person types", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await channelWithWebhookCommand({
    channel: "web-command-suggests",
    webhookCommand: { description: "Ship a branch", name: "web-suggest-deploy" },
  });
  await addWebhookCommand({ name: "web-suggest-docs" });
  await addWebhookCommand({ name: "web-other-suggest" });
  const close = await openChannel({ channel: "web-command-suggests" });

  const both = await suggestedFor("/web-suggest-");
  const narrowed = await suggestedFor("/web-suggest-de");
  type("/web-nothing-like-this");

  expect([both, narrowed, screen.queryByRole("listbox", { name: "Command suggestions" })]).toStrictEqual([
    ["/web-suggest-deployShip a branch", "/web-suggest-docs"],
    ["/web-suggest-deployShip a branch"],
    null,
  ]);

  close();
});

const MANY = 12;
const TWO_DIGITS = 2;
const MANY_WEBHOOK_COMMANDS = Array.from(
  { length: MANY },
  (_value, at) => `web-many-${String(at).padStart(TWO_DIGITS, "0")}`,
);

it("every Webhook command matching what was typed is suggested, in order, not only the first few", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await adminClient().createChannel({ name: "web-command-many" });
  await Promise.all(
    MANY_WEBHOOK_COMMANDS.map(async (name) => {
      await addWebhookCommand({ name });
    }),
  );
  const close = await openChannel({ channel: "web-command-many" });

  await expect(suggestedFor("/web-many-")).resolves.toStrictEqual(MANY_WEBHOOK_COMMANDS.map((name) => `/${name}`));

  close();
});

it("picking a Webhook command shows a labelled field for each property of its schema", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await channelWithWebhookCommand({
    channel: "web-command-fields",
    webhookCommand: { description: "Ship with options", name: "web-fields", schema: fieldsSchema },
  });
  const close = await openChannel({ channel: "web-command-fields" });

  const prompt = await pickWebhookCommand("web-fields");
  const title = within(prompt).getByText("Ship with options");

  expect([
    [field("branch").getAttribute("type"), field("branch").hasAttribute("required"), document.activeElement],
    within(prompt).getByRole("textbox", { description: "The branch to ship", name: "branch" }),
    within(prompt).getByRole("spinbutton", { name: "count" }),
    within(prompt).getByRole("checkbox", { description: "Only pretend", name: "dry" }),
    optionsShown(),
    [field("ratio").getAttribute("step"), field("count").getAttribute("step"), field("ratio").hasAttribute("required")],
    screen.queryByLabelText("Message"),
    title.textContent,
  ]).toStrictEqual([
    ["text", true, field("branch")],
    field("branch"),
    field("count"),
    field("dry"),
    ["—", "staging", "prod"],
    ["any", "1", false],
    null,
    "Ship with options",
  ]);

  close();
});

it("cancelling a Webhook command's prompt brings back an empty message box", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await channelWithWebhookCommand({ channel: "web-command-cancel", webhookCommand: { name: "web-call-cancel" } });
  const close = await openChannel({ channel: "web-command-cancel" });

  const prompt = await pickWebhookCommand("web-call-cancel");
  fireEvent.click(within(prompt).getByRole("button", { name: "Cancel" }));

  expect([
    screen.queryByRole("form", { name: "Call /web-call-cancel" }),
    screen.getByLabelText<HTMLTextAreaElement>("Message").value,
  ]).toStrictEqual([null, ""]);

  close();
});

it("escape in a Webhook command's prompt closes it and brings back the message box, focused, with its text kept", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await channelWithWebhookCommand({ channel: "web-command-escape", webhookCommand: { name: "web-call-escape" } });
  const close = await openChannel({ channel: "web-command-escape" });

  const prompt = await pickWebhookCommand("web-call-escape");
  fireEvent.keyDown(prompt, { key: "Escape" });
  const box = screen.getByLabelText<HTMLTextAreaElement>("Message");

  expect([
    screen.queryByRole("form", { name: "Call /web-call-escape" }),
    box.value,
    document.activeElement,
  ]).toStrictEqual([null, "/web-call-escape", box]);

  close();
});

it("text starting with / that names no registered Webhook command posts as a message", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await adminClient().createChannel({ name: "web-command-not-one" });
  const close = await openChannel({ channel: "web-command-not-one" });

  type("/shrug at the build");
  fireEvent.click(inPane().getByRole("button", { name: "Send" }));
  await within(screen.getByRole("feed", { name: "Messages" })).findByText("/shrug at the build");
  const { messages } = await adminClient().listMessages("web-command-not-one");

  expect(messages.map(({ data = "no data", text }) => [text, data])).toStrictEqual([
    ["/shrug at the build", "no data"],
  ]);

  close();
});

it("a thread's reply box offers no Webhook commands", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await channelWithWebhookCommand({ channel: "web-command-thread", webhookCommand: { name: "web-call-thread" } });
  const { message } = await adminClient().createMessage({ channel: "web-command-thread", text: "The parent" });
  const close = openAt({ client: adminClient(), hash: `#/channels/web-command-thread/threads/${String(message.id)}` });

  fireEvent.change(await screen.findByRole("textbox", { name: "Reply" }), { target: { value: "/web-call-th" } });
  type("/web-call-th");
  await screen.findByRole("listbox", { name: "Command suggestions" });

  expect(
    within(screen.getByRole("form", { name: "Reply to the thread" })).queryByRole("list", {
      name: "Command suggestions",
    }),
  ).toBeNull();

  close();
});

it.each([
  ["a nested object", "web-fallback-object", { branch: { type: "object" } }],
  ["an untyped property", "web-fallback-untyped", { branch: { minLength: 1 } }],
  ["a boolean schema", "web-fallback-boolean", { branch: true }],
  ["an enum of objects", "web-fallback-enum", { branch: { enum: [{ name: "main" }] } }],
] as const)("a schema with %s falls back to a JSON data box", { timeout: 5000 }, async (_shape, name, properties) => {
  expect.hasAssertions();

  await channelWithWebhookCommand({
    channel: `${name}-channel`,
    webhookCommand: { name, schema: { properties, type: "object" } },
  });
  const close = await openChannel({ channel: `${name}-channel` });
  const prompt = await pickWebhookCommand(name);

  expect([within(prompt).getByLabelText("Data").tagName, within(prompt).queryByLabelText("branch")]).toStrictEqual([
    "TEXTAREA",
    null,
  ]);

  close();
});
