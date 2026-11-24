import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { adminClient } from "./identities.ts";
import { inPane } from "./regions.ts";
import { openAt } from "./render.tsx";

async function channelWith(channel: string, replies: readonly string[]): Promise<void> {
  const admin = adminClient();
  await admin.createChannel({ name: channel });
  const { message } = await admin.createMessage({ channel, text: "The message" });
  await Promise.all(
    replies.map(async (text) => {
      await admin.createMessage({ channel, replyTo: message.id, text });
    }),
  );
}

async function focusedBox(): Promise<string | null> {
  const panel = await screen.findByRole("complementary", { name: "Thread" });
  const box = await within(panel).findByRole("textbox", { name: "Reply" });
  await waitFor(() => {
    expect(document.activeElement).toBe(box);
  });
  return box.getAttribute("name");
}

it("a message's thread summary opens its thread with the cursor in the reply box", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await channelWith("web-reply-count-focus", ["The reply"]);
  const close = openAt({ client: adminClient(), hash: "#/channels/web-reply-count-focus" });

  fireEvent.click(await inPane().findByRole("link", { name: /^1 reply/u }));

  await expect(focusedBox()).resolves.toBe("text");

  close();
});
