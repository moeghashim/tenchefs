import {
  answeredAndShown,
  arrived,
  openReading,
  otherThread,
  rowSelected,
  sidebarCleared,
  sidebarCounts,
  threadToRead,
} from "./reading.ts";
import { expect, it } from "vitest";
import type { HandFocus } from "../../testing/web.ts";

const TWO = 2;
const THREE = 3;
const NONE = 0;
const JUST_SHORT = 1900;
const THE_REST = 100;
const READ_AFTER = 2000;
const A_SECOND = 1000;
const LATEST = "Unread two in Deploy at noon?";

it("a selected thread row is still unread at 1.9 s on screen and read at 2 s, and the sidebar count drops", {
  timeout: 8000,
}, async () => {
  expect.hasAssertions();

  const thread = await threadToRead("web-read-rule");
  const opened = await openReading({ hash: "#/inbox", thread, waitingOn: ["inbox"] });
  await rowSelected({ opened, thread });
  const before = sidebarCounts(thread.channel);
  const atShort = await opened.unreadAfter(JUST_SHORT);
  const after = await opened.readAfter(THE_REST);
  const counts = await sidebarCleared(thread.channel);

  expect([before, atShort, after, counts]).toStrictEqual([["2 unread"], TWO, NONE, []]);

  await opened.close();
});

it("selecting another row before 2 s leaves the first unread", { timeout: 8000 }, async () => {
  expect.hasAssertions();

  const thread = await threadToRead("web-read-rule-move");
  const other = await otherThread(thread);
  const opened = await openReading({ hash: thread.address, thread });
  await answeredAndShown({ opened, text: LATEST });
  opened.advance(A_SECOND);
  await rowSelected({ opened, thread: other });

  await expect(opened.unreadAfter(A_SECOND)).resolves.toBe(TWO);

  await opened.close();
});

interface Unfocusing {
  readonly how: string;
  readonly leave: Exclude<keyof HandFocus, "adapter">;
  readonly come: Exclude<keyof HandFocus, "adapter">;
}

const UNFOCUSINGS: readonly Unfocusing[] = [
  { come: "focus", how: "blurred", leave: "blur" },
  { come: "show", how: "hidden", leave: "hide" },
];

it.each(UNFOCUSINGS)(
  "with the window $how nothing is read, and 2 s after it is back it is",
  {
    timeout: 8000,
  },
  async ({ come, how, leave }) => {
    expect.hasAssertions();

    const thread = await threadToRead(`web-read-rule-${how}`);
    const opened = await openReading({ hash: thread.address, thread });
    await answeredAndShown({ opened, text: LATEST });
    opened.advance(A_SECOND);
    opened.page[leave]();
    const meanwhile = await opened.unreadAfter(READ_AFTER);
    opened.page[come]();

    expect([meanwhile, await opened.unreadAfter(A_SECOND), await opened.readAfter(A_SECOND)]).toStrictEqual([
      TWO,
      TWO,
      NONE,
    ]);

    await opened.close();
  },
);

it("a focus event while the page is already focused doesn't restart the count", { timeout: 8000 }, async () => {
  expect.hasAssertions();

  const thread = await threadToRead("web-read-rule-refocus");
  const opened = await openReading({ hash: thread.address, thread });
  await answeredAndShown({ opened, text: LATEST });
  opened.advance(A_SECOND);
  opened.page.focus();

  await expect(opened.readAfter(A_SECOND)).resolves.toBe(NONE);

  await opened.close();
});

it("a reply arriving live in the open conversation is read 2 s after it arrives", { timeout: 8000 }, async () => {
  expect.hasAssertions();

  const thread = await threadToRead("web-read-rule-live");
  const opened = await openReading({ hash: thread.address, thread });
  await answeredAndShown({ opened, text: LATEST });
  opened.advance(A_SECOND);
  await arrived({ text: "Arrived live", thread });
  const aSecondIn = await opened.unreadAfter(A_SECOND);

  expect([aSecondIn, await opened.readAfter(A_SECOND)]).toStrictEqual([THREE, NONE]);

  await opened.close();
});

it("opening a thread from the channel view still reads it at once", { timeout: 8000 }, async () => {
  expect.hasAssertions();

  const thread = await threadToRead("web-read-rule-panel");
  const opened = await openReading({
    hash: `#/channels/${thread.channel}/threads/${String(thread.parent.id)}`,
    thread,
  });

  await expect(opened.read()).resolves.toBe(NONE);

  await opened.close();
});
