import { adminClient, agentShown, clientWith, newIdentity, revocableView } from "./identities.ts";
import {
  callWith,
  callWithFields,
  channelWithWebhookCommand,
  noProperties,
  openChannel,
  pretty,
} from "./webhook-commands.ts";
import { expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { alertSaying } from "./alerts.ts";
import { messagesIn } from "./messages.ts";
import { openAt } from "./render.tsx";
import { unreachableClient } from "../../testing/index.ts";

const LOW = 1;
const HIGH = 2;

const everyKind = {
  properties: {
    branch: { type: "string" },
    count: { type: "integer" },
    dry: { type: "boolean" },
    level: { enum: [LOW, HIGH] },
    note: { type: "string" },
    ratio: { type: "number" },
  },
  required: ["branch"],
  type: "object",
} as const;

it("a Webhook command call and its result reply show their data in the thread", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const handler = await channelWithWebhookCommand({
    channel: "web-command-shows",
    webhookCommand: { name: "web-show-call" },
  });
  const { threadId } = await adminClient().callCommand("web-show-call", {
    channel: "web-command-shows",
    data: { branch: "main" },
  });
  await handler.createMessage({
    channel: "web-command-shows",
    data: { status: "done" },
    replyTo: threadId,
    text: "Shipped main.",
  });
  const close = openAt({ client: adminClient(), hash: `#/channels/web-command-shows/threads/${String(threadId)}` });

  const reply = await within(await screen.findByRole("feed", { name: "Replies" })).findByRole("article");
  const parent = screen.getByRole("article", { name: "Parent message" });

  expect([
    within(parent).getByLabelText("Call to /web-show-call").textContent,
    within(reply).getByLabelText("Data").textContent,
    await messagesIn("Replies"),
  ]).toStrictEqual([
    JSON.stringify({ branch: "main" }),
    pretty({ status: "done" }),
    [`${agentShown("web-show-call")}agentShipped main.▸ data▾ data${pretty({ status: "done" })}`],
  ]);

  close();
});

it("a good call posts the call message in the channel and brings back an empty message box", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await channelWithWebhookCommand({
    channel: "web-command-call",
    webhookCommand: { name: "web-call-fields", schema: everyKind },
  });
  await adminClient().createMessage({ channel: "web-command-call", text: "Ready to ship" });
  const caller = await newIdentity({ kind: "human", name: "web-command-caller" });
  const close = await openChannel({ channel: "web-command-call", client: caller.client });

  await callWithFields({
    checks: ["dry"],
    texts: { branch: "main", count: "3", level: String(HIGH) },
    webhookCommand: "web-call-fields",
  });
  await screen.findByLabelText("Call to /web-call-fields");
  const { messages } = await adminClient().listMessages("web-command-call");

  expect([
    messages.map(({ author, data = "no data", text }) => [author.name, text, data]),
    screen.getByLabelText<HTMLTextAreaElement>("Message").value,
    screen.queryByRole("form", { name: "Call /web-call-fields" }),
  ]).toStrictEqual([
    [
      ["admin", "Ready to ship", "no data"],
      [
        "web-command-caller",
        "/web-call-fields",
        { command: "web-call-fields", data: { branch: "main", count: 3, dry: true, level: HIGH } },
      ],
    ],
    "",
    null,
  ]);

  close();
});

it("a refused call shows the schema error next to its field and keeps what was typed", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await channelWithWebhookCommand({
    channel: "web-command-short",
    webhookCommand: {
      name: "web-call-short",
      schema: {
        properties: { branch: { minLength: 3, type: "string" }, count: { type: "integer" } },
        required: ["branch"],
        type: "object",
      },
    },
  });
  const close = await openChannel({ channel: "web-command-short" });

  const prompt = await callWith({ field: "branch", value: "x", webhookCommand: "web-call-short" });
  const alert = await within(prompt).findByRole("alert");
  const { messages } = await adminClient().listMessages("web-command-short");

  expect([
    alert.textContent,
    within(prompt).getByRole("textbox", { description: "must NOT have fewer than 3 characters", name: "branch" }),
    screen.queryByRole("list", { name: "Schema errors" }),
    messages,
  ]).toStrictEqual([
    expect.stringMatching(/^Couldn't call \/web-call-short \(invalid_request\)/u),
    within(prompt).getByDisplayValue("x"),
    null,
    [],
  ]);

  close();
});

it("a schema with no properties falls back to a JSON data box", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await channelWithWebhookCommand({
    channel: "web-command-json",
    webhookCommand: { name: "web-call-json", schema: noProperties },
  });
  const close = await openChannel({ channel: "web-command-json" });

  await callWith({
    field: "Data",
    value: '{"branch":"main","extra":["one",{"urgent":true},null]}',
    webhookCommand: "web-call-json",
  });
  const shown = await screen.findByLabelText("Call to /web-call-json");

  expect(shown.textContent).toBe(JSON.stringify({ branch: "main", extra: ["one", { urgent: true }, null] }));

  close();
});

it("schema errors no field names are listed, and the data box keeps what was typed", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await channelWithWebhookCommand({
    channel: "web-command-bad",
    webhookCommand: { name: "web-call-bad", schema: noProperties },
  });
  const close = await openChannel({ channel: "web-command-bad" });

  const prompt = await callWith({ field: "Data", value: '{"other":1}', webhookCommand: "web-call-bad" });
  const alert = await within(prompt).findByRole("alert");
  const { messages } = await adminClient().listMessages("web-command-bad");

  expect([alert.textContent, within(prompt).getByLabelText("Data"), messages]).toStrictEqual([
    expect.stringMatching(
      /^Couldn't call \/web-call-bad \(invalid_request\).*data: must have required property 'branch'$/u,
    ),
    within(prompt).getByDisplayValue('{"other":1}'),
    [],
  ]);

  close();
});

it("data that isn't JSON is refused before it is sent", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await channelWithWebhookCommand({
    channel: "web-command-not-json",
    webhookCommand: { name: "web-call-not-json", schema: noProperties },
  });
  const close = await openChannel({ channel: "web-command-not-json" });

  const prompt = await callWith({ field: "Data", value: "{branch", webhookCommand: "web-call-not-json" });
  const alert = await within(prompt).findByRole("alert");

  expect(alert.textContent).toBe("Couldn't call /web-call-not-json (invalid_json): The data isn't JSON.");

  close();
});

it("a refused call says so and keeps the channel shown", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await channelWithWebhookCommand({ channel: "web-command-refused", webhookCommand: { name: "web-call-refused" } });
  const caller = await revocableView({
    methods: ["callCommand"],
    revoked: "web-command-rotated",
    viewer: "web-command-viewer",
  });
  const close = await openChannel({ channel: "web-command-refused", client: caller.client });
  await caller.rotateToken();

  await callWith({ field: "branch", value: "main", webhookCommand: "web-call-refused" });
  const alert = await alertSaying("Couldn't call");

  expect([alert.textContent, screen.queryByRole("list", { name: "Schema errors" })]).toStrictEqual([
    expect.stringMatching(/^Couldn't call \/web-call-refused \(token_revoked\)/u),
    null,
  ]);

  close();
});

it("a call to a server that can't be reached says so, with no schema errors", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await channelWithWebhookCommand({
    channel: "web-command-unreachable",
    webhookCommand: { name: "web-call-unreachable" },
  });
  const nowhereClient = unreachableClient({ token: "cookout_any" });
  const close = await openChannel({
    channel: "web-command-unreachable",
    client: {
      ...adminClient(),
      callCommand: nowhereClient.callCommand,
    },
  });

  const prompt = await callWith({ field: "branch", value: "main", webhookCommand: "web-call-unreachable" });
  const alert = await within(prompt).findByRole("alert");

  expect([alert.textContent, screen.queryByRole("list", { name: "Schema errors" })]).toStrictEqual([
    expect.stringMatching(/^Couldn't call \/web-call-unreachable \(unreachable\)/u),
    null,
  ]);

  close();
});

it("webhook commands that can't be listed say so", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await adminClient().createChannel({ name: "web-command-unlisted" });
  const revoked = clientWith("cookout_not-a-token");
  const close = openAt({
    client: { ...adminClient(), listCommands: revoked.listCommands },
    hash: "#/channels/web-command-unlisted",
  });

  const refusal = await screen.findByText(/^Couldn't list the webhook commands/u);

  expect([refusal.getAttribute("role"), refusal.textContent]).toStrictEqual([
    "alert",
    expect.stringMatching(/^Couldn't list the webhook commands \(\w+\): /u),
  ]);

  close();
});
