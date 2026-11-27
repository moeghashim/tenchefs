import { expect, it } from "vitest";
import { inConversation, inThread } from "./regions.ts";
import {
  openReplying,
  replyingIn,
  threadTexts,
  threadWithWebhookCommand,
  topLevelTexts,
} from "./reply-webhook-commands.ts";
import { addWebhookCommand } from "./webhook-commands.ts";
import { subscribedReader } from "./inbox-reader.ts";

const oneBranch = { properties: { branch: { type: "string" } }, required: ["branch"], type: "object" } as const;

it("the reply box of a thread opened alone calls a Webhook command as a reply in its thread", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { parent } = await threadWithWebhookCommand({
    channel: "web-reply-alone",
    webhookCommand: { name: "web-reply-alone-deploy", schema: oneBranch },
  });
  const close = await openReplying({
    hash: `#/channels/web-reply-alone/threads/${String(parent)}/alone`,
    region: inThread(),
  });

  await replyingIn(inThread()).calledFrom("/web-reply-alone-deploy main");

  expect([await threadTexts(parent), await topLevelTexts("web-reply-alone")]).toStrictEqual([
    ["/web-reply-alone-deploy"],
    ["Ship it?"],
  ]);

  await close();
});

it("the reply box of the Inbox's split view calls a Webhook command as a reply in its thread", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { poster, reader } = await subscribedReader("web-reply-inbox");
  await addWebhookCommand({ name: "web-reply-inbox-deploy", schema: oneBranch });
  const { message } = await poster.createMessage({ channel: "web-reply-inbox", text: "Ship it?" });
  await reader.follow(message.id);
  await poster.createMessage({ channel: "web-reply-inbox", replyTo: message.id, text: "Any takers?" });
  const close = await openReplying({
    client: reader,
    hash: `#/inbox/web-reply-inbox/${String(message.id)}`,
    region: inConversation(),
  });

  await replyingIn(inConversation()).calledFrom("/web-reply-inbox-deploy main");

  expect([await threadTexts(message.id), await topLevelTexts("web-reply-inbox")]).toStrictEqual([
    ["Any takers?", "/web-reply-inbox-deploy"],
    ["Ship it?"],
  ]);

  await close();
});
