import { channelWithWebhookCommand, openChannel, type } from "./webhook-commands.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { adminClient } from "./identities.ts";

const oneBranch = { properties: { branch: { type: "string" } }, required: ["branch"], type: "object" } as const;

function scheduleByKey(text: string): void {
  type(text);
  const box = screen.getByLabelText<HTMLTextAreaElement>("Message");
  box.focus();
  fireEvent.keyDown(box, { ctrlKey: true, key: "Enter", shiftKey: true });
}

it("ctrl+Shift+Enter on a one-text-field Webhook command and a text schedules the whole text", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await channelWithWebhookCommand({
    channel: "web-inline-later",
    webhookCommand: { name: "web-inline-later-deploy", schema: oneBranch },
  });
  const close = await openChannel({ channel: "web-inline-later" });
  scheduleByKey("/web-inline-later-deploy main");
  const dialog = await screen.findByRole("dialog", { name: "Schedule a message" });
  const { messages } = await adminClient().listMessages("web-inline-later");

  expect([within(dialog).getByLabelText<HTMLInputElement>("Text").value, messages]).toStrictEqual([
    "/web-inline-later-deploy main",
    [],
  ]);

  close();
});
