import { adminClient, anonymousClient, sessionOf } from "./identities.ts";
import {
  answeredAndShown,
  clicked,
  openReading,
  otherThread,
  pressedAndAnswered,
  readAtLast,
  replied,
  rowSelected,
  rowsAt,
  shown,
  threadToRead,
  unreadAtLast,
} from "./reading.ts";
import { expect, it } from "vitest";
import type { ReadThread } from "./reading.ts";
import { answering } from "./answering.ts";
import { inConversation } from "./regions.ts";
import { openAt } from "./render.tsx";
import { waitFor } from "@testing-library/react";

const ONE = 1;
const TWO = 2;
const NONE = 0;
const READ_AFTER = 2000;
const JUST_SHORT_OF_THE_NOTE = 4900;
const THE_REST = 100;
const LATEST = "Unread two in Deploy at noon?";
const MARKED = "Marked as read";

async function backInActivity(thread: ReadThread): Promise<readonly string[]> {
  await unreadAtLast({ count: TWO, thread });
  await waitFor(() => {
    expect(rowsAt({ label: "Activity", thread }).join(",")).toContain("2 new");
  });
  return rowsAt({ label: "Activity", thread }).filter((row) => row.includes("2 new"));
}

async function noteShown(): Promise<string> {
  const note = await inConversation().findByText(MARKED);
  return note.textContent;
}

async function markedRead(): Promise<string> {
  clicked("Mark conversation read");
  const note = await noteShown();
  return note;
}

async function noteGone(): Promise<boolean> {
  await waitFor(() => {
    expect(inConversation().element().textContent).not.toContain(MARKED);
  });
  return true;
}

it("a reply of your own in the open conversation marks its row read at once, with the note", {
  timeout: 8000,
}, async () => {
  expect.hasAssertions();

  const thread = await threadToRead("web-mark-read-reply");
  const opened = await openReading({ hash: thread.address, thread });
  await answeredAndShown({ opened, text: LATEST });
  await replied({ by: thread.reader, text: "On it", thread });
  await shown("On it");

  expect([await noteShown(), await readAtLast(thread)]).toStrictEqual([MARKED, NONE]);

  await opened.close();
});

it("mark read reads the row at once, and Undo brings it back unread", { timeout: 8000 }, async () => {
  expect.hasAssertions();

  const thread = await threadToRead("web-mark-read-undo");
  const opened = await openReading({ hash: thread.address, thread, waitingOn: ["inbox"] });
  await answeredAndShown({ opened, text: LATEST });
  await pressedAndAnswered({ button: "Mark conversation read", methods: ["ack"], opened });
  const read = [await readAtLast(thread), await noteShown()];
  await pressedAndAnswered({ button: "Undo", methods: ["markUnread", "inbox"], opened });

  expect([read, await backInActivity(thread), await noteGone()]).toStrictEqual([
    [NONE, MARKED],
    [expect.any(String)],
    true,
  ]);

  await opened.close();
});

it("the Marked as read note goes after 5 s", { timeout: 8000 }, async () => {
  expect.hasAssertions();

  const thread = await threadToRead("web-mark-read-note");
  const opened = await openReading({ hash: thread.address, thread });
  await answeredAndShown({ opened, text: LATEST });
  await markedRead();
  opened.advance(JUST_SHORT_OF_THE_NOTE);
  const meanwhile = await noteShown();
  opened.advance(THE_REST);

  expect([meanwhile, await noteGone()]).toStrictEqual([MARKED, true]);

  await opened.close();
});

it("mark unread puts a read row back in its section, and it stays unread while it stays selected", {
  timeout: 8000,
}, async () => {
  expect.hasAssertions();

  const thread = await threadToRead("web-mark-unread-held");
  const opened = await openReading({ hash: thread.address, thread, waitingOn: ["inbox"] });
  await answeredAndShown({ opened, text: LATEST });
  await opened.readAfter(READ_AFTER);
  await pressedAndAnswered({ button: "Mark unread", methods: ["markUnread", "inbox"], opened });
  const back = await backInActivity(thread);

  expect([back.length, await opened.unreadAfter(READ_AFTER)]).toStrictEqual([ONE, TWO]);

  await opened.close();
});

it("a row marked unread is read 2 s after it is selected again later", { timeout: 8000 }, async () => {
  expect.hasAssertions();

  const thread = await threadToRead("web-mark-unread-again");
  const other = await otherThread(thread);
  const opened = await openReading({ hash: thread.address, thread });
  await answeredAndShown({ opened, text: LATEST });
  clicked("Mark unread");
  await rowSelected({ opened, thread: other });
  await rowSelected({ opened, thread });

  await expect(opened.readAfter(READ_AFTER)).resolves.toBe(NONE);

  await opened.close();
});

it("mark read and Mark unread on a conversation that couldn't load change nothing", { timeout: 8000 }, async () => {
  expect.hasAssertions();

  const { answered, client } = answering(anonymousClient());
  const unmount = openAt({ client, hash: "#/inbox/general/1", session: sessionOf(adminClient()) });
  await answered("getThread");
  await inConversation().findByRole("alert");
  clicked("Mark conversation read");
  clicked("Mark unread");

  expect(inConversation().element().textContent).not.toContain(MARKED);

  unmount();
});
