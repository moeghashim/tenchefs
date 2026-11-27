import { addWebhookCommand, noProperties } from "./webhook-commands.ts";
import {
  callForms,
  newestIn,
  openReplying,
  replyingIn,
  threadTexts,
  threadWithWebhookCommand,
  topLevelTexts,
} from "./reply-webhook-commands.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { inThread } from "./regions.ts";

type Replying = ReturnType<typeof replyingIn>;

const ONE_FORM = 1;

const oneBranch = { properties: { branch: { type: "string" } }, required: ["branch"], type: "object" } as const;
const shortBranch = {
  properties: { branch: { minLength: 3, type: "string" } },
  required: ["branch"],
  type: "object",
} as const;

function channelBox(): HTMLElement {
  return screen.getByRole("form", { name: "Post to the channel" });
}

function threadHash(channel: string, parent: number): string {
  return `#/channels/${channel}/threads/${String(parent)}`;
}

async function keptAfterCancel(reply: Replying, name: string): Promise<string> {
  const prompt = await reply.pick(name);
  fireEvent.click(within(prompt).getByRole("button", { name: "Cancel" }));
  return reply.box().value;
}

async function calledWithMain(reply: Replying, name: string): Promise<HTMLElement> {
  const prompt = await reply.pick(name);
  fireEvent.change(within(prompt).getByLabelText("branch"), { target: { value: "main" } });
  fireEvent.click(within(prompt).getByRole("button", { name: "Call" }));
  const chip = await within(await inThread().findByRole("feed", { name: "Replies" })).findByLabelText(
    `Call to /${name}`,
  );
  return chip;
}

it("in a thread's reply box, / lists the Webhook commands with their descriptions, a prefix narrows it, and Enter opens the form and sends nothing", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { parent } = await threadWithWebhookCommand({
    channel: "web-reply-list",
    webhookCommand: { description: "Ship a branch", name: "web-reply-list-deploy" },
  });
  await addWebhookCommand({ description: "Undo it", name: "web-reply-list-undo" });
  const close = await openReplying({ hash: threadHash("web-reply-list", parent), region: inThread() });
  const reply = replyingIn(inThread());

  const all = await reply.suggestions("/");
  const narrowed = await reply.suggestions("/web-reply-list-de");
  fireEvent.keyDown(reply.box(), { key: "Enter" });

  expect([
    callForms("web-reply-list-deploy"),
    all.filter((option) => String(option).startsWith("/web-reply-list")),
    narrowed,
    await threadTexts(parent),
  ]).toStrictEqual([
    ONE_FORM,
    ["/web-reply-list-deployShip a branch", "/web-reply-list-undoUndo it"],
    ["/web-reply-list-deployShip a branch"],
    [],
  ]);

  await close();
});

it("a two-field Webhook command picked in the reply box is called as a reply in the thread, and Cancel keeps the text", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { parent } = await threadWithWebhookCommand({
    channel: "web-reply-form",
    webhookCommand: { name: "web-reply-form-deploy" },
  });
  const close = await openReplying({ hash: threadHash("web-reply-form", parent), region: inThread() });
  const reply = replyingIn(inThread());

  const kept = await keptAfterCancel(reply, "web-reply-form-deploy");
  const chip = await calledWithMain(reply, "web-reply-form-deploy");

  expect([
    kept,
    chip.textContent,
    await threadTexts(parent),
    await topLevelTexts("web-reply-form"),
    reply.box().value,
  ]).toStrictEqual([
    "/web-reply-form-deploy",
    JSON.stringify({ branch: "main" }),
    ["/web-reply-form-deploy"],
    ["Ship it?"],
    "",
  ]);

  await close();
});

it("/name and a text sent from the reply box calls the inline Webhook command in the thread, and the Handler's reply shows there", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { handler, parent } = await threadWithWebhookCommand({
    channel: "web-reply-inline",
    webhookCommand: { name: "web-reply-inline-deploy", schema: oneBranch },
  });
  const close = await openReplying({ hash: threadHash("web-reply-inline", parent), region: inThread() });

  await replyingIn(inThread()).calledFrom("/web-reply-inline-deploy main");
  await handler.createMessage({
    channel: "web-reply-inline",
    replyTo: parent,
    seen: await newestIn(parent),
    text: "Deployed main.",
  });
  await inThread().findByText("Deployed main.");

  expect([
    await threadTexts(parent),
    await topLevelTexts("web-reply-inline"),
    replyingIn(inThread()).box().value,
  ]).toStrictEqual([["/web-reply-inline-deploy", "Deployed main."], ["Ship it?"], ""]);

  await close();
});

it("a refused call from the reply box keeps the typed value and shows the refusal in its form, and the channel's box shows none of it", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { parent } = await threadWithWebhookCommand({
    channel: "web-reply-refused",
    webhookCommand: { name: "web-reply-refused-fix", schema: shortBranch },
  });
  const close = await openReplying({ hash: threadHash("web-reply-refused", parent), region: inThread() });

  replyingIn(inThread()).send("/web-reply-refused-fix ab");
  const prompt = await inThread().findByRole("form", { name: "Call /web-reply-refused-fix" });
  const alert = await within(prompt).findByRole("alert");

  expect([
    within(prompt).getByLabelText<HTMLInputElement>("branch").value,
    alert.textContent.startsWith("Couldn't call /web-reply-refused-fix (invalid_request)"),
    callForms("web-reply-refused-fix"),
    within(channelBox()).queryByRole("alert"),
    within(channelBox()).getByLabelText<HTMLTextAreaElement>("Message").value,
    await threadTexts(parent),
  ]).toStrictEqual(["ab", true, ONE_FORM, null, "", []]);

  await close();
});

it("data that isn't JSON in a reply box's call form is refused there before it is sent", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { parent } = await threadWithWebhookCommand({
    channel: "web-reply-not-json",
    webhookCommand: { name: "web-reply-not-json", schema: noProperties },
  });
  const close = await openReplying({ hash: threadHash("web-reply-not-json", parent), region: inThread() });

  const prompt = await replyingIn(inThread()).pick("web-reply-not-json");
  fireEvent.change(within(prompt).getByLabelText("Data"), { target: { value: "{not json" } });
  fireEvent.click(within(prompt).getByRole("button", { name: "Call" }));
  const alert = await within(prompt).findByRole("alert");

  expect([
    alert.textContent.includes("The data isn't JSON."),
    within(prompt).getByLabelText<HTMLTextAreaElement>("Data").value,
    await threadTexts(parent),
  ]).toStrictEqual([true, "{not json", []]);

  await close();
});
