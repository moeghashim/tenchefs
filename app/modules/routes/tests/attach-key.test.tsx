import { expect, it, vi } from "vitest";
import { filesSupported, formNamed, pickerIn } from "./composer-files.ts";
import { fireEvent, screen, within } from "@testing-library/react";
import { adminClient } from "./identities.ts";
import { inThread } from "./regions.ts";
import { openWithClockStopped } from "./clock.ts";

const CHANNEL_FORM = "Post to the channel";
const REPLY_FORM = "Reply to the thread";
const ATTACH_KEY = { ctrlKey: true, key: "U", shiftKey: true } as const;
const ONCE = 1;
const NEVER = 0;

async function threadOpen(channel: string): Promise<() => void> {
  await filesSupported();
  await adminClient().createChannel({ name: channel });
  const { message: parent } = await adminClient().createMessage({ channel, text: "Files?" });
  const close = openWithClockStopped({
    client: adminClient(),
    hash: `#/channels/${channel}/threads/${String(parent.id)}`,
  });
  await inThread().findByRole("form", { name: REPLY_FORM });
  return close;
}

it("ctrl+Shift+U in a thread's reply box opens the reply's file picker alone, and in the search box it opens none", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const close = await threadOpen("web-attach-key");
  const reply = vi.spyOn(pickerIn(REPLY_FORM), "click");
  const message = vi.spyOn(pickerIn(CHANNEL_FORM), "click");
  const searched = !fireEvent.keyDown(screen.getByRole("combobox", { name: "Search" }), ATTACH_KEY);
  const attached = !fireEvent.keyDown(within(formNamed(REPLY_FORM)).getByRole("textbox"), ATTACH_KEY);

  expect([searched, attached, reply.mock.calls.length, message.mock.calls.length]).toStrictEqual([
    false,
    true,
    ONCE,
    NEVER,
  ]);

  close();
});
