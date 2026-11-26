import { channelToRead, channelUnreadAtLast, noteShown, openChannelReading } from "./channel-reading.ts";
import { expect, it } from "vitest";
import { fireEvent, waitFor } from "@testing-library/react";
import { adminClient } from "./identities.ts";
import { clicked } from "./reading.ts";
import { inConversation } from "./regions.ts";
import { openWithClockStopped } from "./clock.ts";
import { viewOpened } from "./view-opened.ts";

const TWO = 2;
const NONE = 0;
const JUST_SHORT = 1900;
const THE_REST = 100;
const READ_AFTER = 2000;
const A_SECOND = 1000;
const MARKED = "Marked as read";
const MARK_READ = "Mark conversation read";

it("a selected channel row is still unread at 1.9 s on screen and read at 2 s", { timeout: 8000 }, async () => {
  expect.hasAssertions();

  const news = await channelToRead("web-channel-read-rule");
  const opened = await openChannelReading(news);

  expect([await opened.unreadAfter(JUST_SHORT), await opened.readAfter(THE_REST)]).toStrictEqual([TWO, NONE]);

  await opened.close();
});

it("blurring the window restarts a channel row's count, and 2 s after focus is back it is read", {
  timeout: 8000,
}, async () => {
  expect.hasAssertions();

  const news = await channelToRead("web-channel-read-rule-blur");
  const opened = await openChannelReading(news);
  opened.advance(A_SECOND);
  opened.page.blur();
  const meanwhile = await opened.unreadAfter(READ_AFTER);
  opened.page.focus();

  expect([meanwhile, await opened.unreadAfter(A_SECOND), await opened.readAfter(A_SECOND)]).toStrictEqual([
    TWO,
    TWO,
    NONE,
  ]);

  await opened.close();
});

it("the header's Mark conversation read reads a channel row at once, and Undo brings it back", {
  timeout: 8000,
}, async () => {
  expect.hasAssertions();

  const news = await channelToRead("web-channel-mark-read");
  const opened = await openChannelReading(news);
  clicked(MARK_READ);
  const read = [await channelUnreadAtLast({ count: NONE, news }), await noteShown()];
  clicked("Undo");

  expect([read, await channelUnreadAtLast({ count: TWO, news })]).toStrictEqual([[NONE, MARKED], TWO]);

  await opened.close();
});

it("mark unread puts a read channel row back, and it stays unread while it stays selected", {
  timeout: 8000,
}, async () => {
  expect.hasAssertions();

  const news = await channelToRead("web-channel-mark-unread");
  const opened = await openChannelReading(news);
  await opened.readAfter(READ_AFTER);
  clicked("Mark unread");
  const back = await channelUnreadAtLast({ count: TWO, news });

  expect([back, await opened.unreadAfter(READ_AFTER)]).toStrictEqual([TWO, TWO]);

  await opened.close();
});

it("a reply of your own from a channel conversation's box reads its row at once, with the note", {
  timeout: 8000,
}, async () => {
  expect.hasAssertions();

  const news = await channelToRead("web-channel-read-reply");
  const opened = await openChannelReading(news);
  const box = await inConversation().findByRole("textbox", { name: "Reply to @web-channel-read-reply-poster" });
  fireEvent.change(box, { target: { value: "On it" } });
  fireEvent.click(await inConversation().findEnabledButton("Send"));
  await waitFor(() => {
    expect(box).toHaveProperty("value", "");
  });

  expect([await channelUnreadAtLast({ count: NONE, news }), await noteShown()]).toStrictEqual([NONE, MARKED]);

  await opened.close();
});

it("mark read on a channel deleted while its conversation is open still shows the note, and the page carries on", {
  timeout: 8000,
}, async () => {
  expect.hasAssertions();

  const news = await channelToRead("web-channel-read-deleted");
  const { close: unmount } = await viewOpened({
    client: news.reader,
    hash: `#/inbox/${news.channel}`,
    open: openWithClockStopped,
    waitingOn: ["inbox", "listMessages"],
  });
  await inConversation().findByText("New two");
  await adminClient().deleteChannel(news.channel);
  clicked(MARK_READ);
  const note = await noteShown();
  clicked("Mark unread");

  expect([note, await news.reader.inbox().then(({ items }) => items.length)]).toStrictEqual([MARKED, NONE]);

  unmount();
});
