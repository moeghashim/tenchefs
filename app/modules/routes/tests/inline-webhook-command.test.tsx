import { channelWithWebhookCommand, openChannel, suggestedFor, type } from "./webhook-commands.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import type { JsonSchema } from "../../webhook-commands/index.ts";
import { adminClient } from "./identities.ts";
import { inPane } from "./regions.ts";

const oneBranch = { properties: { branch: { type: "string" } }, required: ["branch"], type: "object" } as const;
const shortBranch = {
  properties: { branch: { minLength: 3, type: "string" } },
  required: ["branch"],
  type: "object",
} as const;
const START = 0;
const FIRST_TWO = 2;

interface Opened {
  readonly channel: string;
  readonly name: string;
  readonly schema: JsonSchema;
}

async function openWith({ channel, name, schema }: Opened): Promise<() => void> {
  await channelWithWebhookCommand({ channel, webhookCommand: { name, schema } });
  return openChannel({ channel });
}

function box(): HTMLTextAreaElement {
  return screen.getByLabelText<HTMLTextAreaElement>("Message");
}

function boxText(): string | null {
  const field = screen.queryByLabelText<HTMLTextAreaElement>("Message");
  if (field === null) {
    return null;
  }
  return field.value;
}

function send(text: string): void {
  type(text);
  fireEvent.keyDown(box(), { key: "Enter" });
}

function sendByButton(text: string): void {
  type(text);
  fireEvent.click(inPane().getByRole("button", { name: "Send" }));
}

async function pick(name: string): Promise<void> {
  type(`/${name}`);
  const list = await screen.findByRole("listbox", { name: "Command suggestions" });
  fireEvent.mouseDown(within(list).getByRole("option", { name: new RegExp(`^/${name}`, "u") }));
}

function formShown(name: string): boolean {
  return screen.queryByRole("form", { name: `Call /${name}` }) !== null;
}

function back(name: string): void {
  fireEvent.keyDown(screen.getByRole("form", { name: `Call /${name}` }), { key: "Escape" });
}

async function messageTexts(channel: string): Promise<readonly string[]> {
  const { messages } = await adminClient().listMessages(channel);
  return messages.map((message) => message.text);
}

async function messageData(channel: string): Promise<readonly unknown[]> {
  const { messages } = await adminClient().listMessages(channel);
  return messages.map(({ data, text }) => [text, data]);
}

interface Picked {
  readonly text: string;
  readonly caret: number;
  readonly form: boolean;
  readonly focused: boolean;
  readonly posted: readonly string[];
}

async function pickedState(channel: string, name: string): Promise<Picked> {
  return {
    caret: box().selectionStart,
    focused: document.activeElement === box(),
    form: formShown(name),
    posted: await messageTexts(channel),
    text: box().value,
  };
}

it("picking a one-text-field Webhook command completes the box, and Enter then calls it with the text", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const close = await openWith({ channel: "web-inline-pick", name: "web-inline-deploy", schema: oneBranch });

  await pick("web-inline-deploy");
  const picked = await pickedState("web-inline-pick", "web-inline-deploy");
  send("/web-inline-deploy main");
  const chip = await screen.findByLabelText("Call to /web-inline-deploy");

  expect([picked, chip.textContent, await messageData("web-inline-pick"), box().value]).toStrictEqual([
    { caret: "/web-inline-deploy ".length, focused: true, form: false, posted: [], text: "/web-inline-deploy " },
    JSON.stringify({ branch: "main" }),
    [["/web-inline-deploy", { command: "web-inline-deploy", data: { branch: "main" } }]],
    "",
  ]);

  close();
});

it("sending /name and a text without picking calls the one-text-field Webhook command", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = await openWith({ channel: "web-inline-typed", name: "web-inline-typed-deploy", schema: oneBranch });

  send("/web-inline-typed-deploy main and more");
  const chip = await screen.findByLabelText("Call to /web-inline-typed-deploy");

  expect([chip.textContent, await messageData("web-inline-typed"), box().value]).toStrictEqual([
    JSON.stringify({ branch: "main and more" }),
    [["/web-inline-typed-deploy", { command: "web-inline-typed-deploy", data: { branch: "main and more" } }]],
    "",
  ]);

  close();
});

it.each([
  ["alone", "web-inline-alone", ""],
  ["with only the space", "web-inline-space", " "],
])(
  "sending a one-text-field Webhook command's name %s opens its form, empty",
  { timeout: 5000 },
  async (_how, name, after) => {
    expect.hasAssertions();

    const close = await openWith({ channel: `${name}-channel`, name, schema: oneBranch });

    sendByButton(`/${name}${after}`);
    const form = await screen.findByRole("form", { name: `Call /${name}` });

    expect([
      within(form).getByLabelText<HTMLInputElement>("branch").value,
      await messageTexts(`${name}-channel`),
    ]).toStrictEqual(["", []]);

    close();
  },
);

it("a refused inline call opens the form with the text in its field and the refusal shown", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const close = await openWith({ channel: "web-inline-refused", name: "web-inline-hotfix", schema: shortBranch });

  send("/web-inline-hotfix x");
  const form = await screen.findByRole("form", { name: "Call /web-inline-hotfix" });
  const alert = await within(form).findByRole("alert");

  expect([
    alert.textContent,
    within(form).getByRole("textbox", { description: "must NOT have fewer than 3 characters", name: "branch" }),
    await messageTexts("web-inline-refused"),
  ]).toStrictEqual([
    expect.stringMatching(/^Couldn't call \/web-inline-hotfix \(invalid_request\)/u),
    within(form).getByDisplayValue("x"),
    [],
  ]);

  close();
});

const notInline: readonly (readonly [string, string, JsonSchema])[] = [
  [
    "two fields",
    "web-inline-two",
    { properties: { branch: { type: "string" }, note: { type: "string" } }, type: "object" },
  ],
  ["one boolean field", "web-inline-bool", { properties: { dry: { type: "boolean" } }, type: "object" }],
  [
    "one enum field",
    "web-inline-enum",
    { properties: { env: { enum: ["staging", "prod"], type: "string" } }, type: "object" },
  ],
];

it.each(notInline)(
  "a Webhook command with %s opens its form on pick and on send, and Back brings the text back",
  {
    timeout: 5000,
  },
  async (_shape, name, schema) => {
    expect.hasAssertions();

    const close = await openWith({ channel: `${name}-channel`, name, schema });

    await pick(name);
    const opened = formShown(name);
    back(name);
    send(`/${name} some text`);
    await screen.findByRole("form", { name: `Call /${name}` });
    back(name);

    expect([opened, box().value, await messageTexts(`${name}-channel`)]).toStrictEqual([
      true,
      `/${name} some text`,
      [],
    ]);

    close();
  },
);

interface RuleCase {
  readonly shape: string;
  readonly name: string;
  readonly schema: JsonSchema;
  readonly inline: boolean;
}

const inlineRule: readonly RuleCase[] = [
  { inline: true, name: "web-rule-required", schema: oneBranch, shape: "one required string" },
  {
    inline: true,
    name: "web-rule-optional",
    schema: { properties: { branch: { type: "string" } }, type: "object" },
    shape: "one optional string",
  },
  { inline: false, name: "web-rule-none", schema: { type: "object" }, shape: "no properties" },
  {
    inline: false,
    name: "web-rule-two",
    schema: { properties: { first: { type: "string" }, second: { type: "string" } }, type: "object" },
    shape: "two properties",
  },
  {
    inline: false,
    name: "web-rule-number",
    schema: { properties: { count: { type: "number" } }, type: "object" },
    shape: "a number property",
  },
  {
    inline: false,
    name: "web-rule-enum",
    schema: { properties: { env: { enum: ["staging", "prod"], type: "string" } }, type: "object" },
    shape: "an enum property",
  },
  {
    inline: false,
    name: "web-rule-nested",
    schema: { properties: { branch: { type: "object" } }, type: "object" },
    shape: "a nested object",
  },
];

it.each(inlineRule)(
  "a Webhook command with $shape completes the box on pick: $inline",
  {
    timeout: 5000,
  },
  async ({ inline, name, schema }) => {
    expect.hasAssertions();

    const close = await openWith({ channel: `${name}-channel`, name, schema });

    await pick(name);

    expect([boxText() === `/${name} `, formShown(name)]).toStrictEqual([inline, !inline]);

    close();
  },
);

it("the list still shows /schedule first, /schedule still opens its dialog, and other text posts", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const close = await openWith({ channel: "web-inline-schedule", name: "sched-inline", schema: oneBranch });

  const listed = await suggestedFor("/s");
  send("/schedule Standup");
  const dialog = await screen.findByRole("dialog", { name: "Schedule a message" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  send("/nothing here");
  await inPane().findByText("/nothing here");

  expect([listed.slice(START, FIRST_TWO), await messageTexts("web-inline-schedule")]).toStrictEqual([
    ["/scheduleSchedule a message", "/sched-inline"],
    ["/nothing here"],
  ]);

  close();
});
