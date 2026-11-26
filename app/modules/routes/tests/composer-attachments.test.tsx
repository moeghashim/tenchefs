import {
  dragInto,
  dragNothingOverPage,
  dragOnto,
  dragOutOf,
  dragTextOnto,
  dropInto,
  dropOn,
  dropOnPage,
  filesSupported,
  formNamed,
  hills,
  litZones,
  namesIn,
  notes,
  pasteInto,
  pasteItemsInto,
  pasteText,
  pendingIn,
  pickIn,
  pickNothingIn,
  pickerIn,
  sized,
} from "./composer-files.ts";
import { expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { inPane, inThread } from "./regions.ts";
import { adminClient } from "./identities.ts";
import { alertSaying } from "./alerts.ts";
import { openWithClockStopped } from "./clock.ts";

const CHANNEL_FORM = "Post to the channel";
const REPLY_FORM = "Reply to the thread";
const OVER_TEN_MB = 10_000_001;
const ELEVEN = 11;
const MOST_FILES = 10;
const EMPTY = 0;
const ONCE = 1;
const HILLS = `hills.png blob:preview/${String(hills.bytes.length)}`;
const NOTES = "notes.txt1.5 KB";

async function channelOpen(channel: string): Promise<() => void> {
  await filesSupported();
  await adminClient().createChannel({ name: channel });
  await adminClient().createMessage({ channel, text: "Earlier" });
  const close = openWithClockStopped({ client: adminClient(), hash: `#/channels/${channel}` });
  await inPane().findByRole("form", { name: CHANNEL_FORM });
  return close;
}

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

function numbered(count: number): readonly ReturnType<typeof sized>[] {
  return Array.from({ length: count }, (_unused, index) =>
    sized({ name: `file-${String(index)}.txt`, size: index + MOST_FILES }),
  );
}

function typed(form: string, text: string): void {
  fireEvent.change(within(formNamed(form)).getByRole("textbox"), { target: { value: text } });
}

function send(form: string): void {
  fireEvent.click(within(formNamed(form)).getByRole("button", { name: "Send" }));
}

it("an image pasted into the message box waits above the text as a thumbnail, and pasted text still pastes", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const close = await channelOpen("web-compose-paste");
  const filesTakenAsText = pasteInto({ files: [hills], form: CHANNEL_FORM });

  expect([filesTakenAsText, pasteText(CHANNEL_FORM), pendingIn(CHANNEL_FORM)]).toStrictEqual([false, true, [HILLS]]);

  close();
});

it("an image pasted with its file only in the clipboard's items waits above the text as a thumbnail", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const close = await channelOpen("web-compose-paste-items");
  const filesTakenAsText = pasteItemsInto({ files: [hills], form: CHANNEL_FORM });

  expect([filesTakenAsText, pendingIn(CHANNEL_FORM)]).toStrictEqual([false, [HILLS]]);

  close();
});

it("a channel lights up while files are dragged over its messages, until the last of them leaves", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const close = await channelOpen("web-compose-drop-lit");
  const over = { files: [notes], region: "Messages in #web-compose-drop-lit" };
  dragInto(over);
  dragInto(over);
  dragOutOf(over);
  const litInside = litZones();
  dragOutOf(over);

  expect([litInside, litZones()]).toStrictEqual([ONCE, EMPTY]);

  close();
});

it("files dropped on a channel's messages wait in its box, unlit, files dropped off any conversation are refused, and a drag of nothing is left alone", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const close = await channelOpen("web-compose-drop-list");
  const over = { files: [notes], region: "Messages in #web-compose-drop-list" };
  dragInto(over);
  dropInto(over);
  const strayTaken = dropOnPage([notes]);
  const nothingPasses = dragNothingOverPage();

  expect([litZones(), strayTaken, nothingPasses, pendingIn(CHANNEL_FORM)]).toStrictEqual([EMPTY, false, true, [NOTES]]);

  close();
});

it("files dragged over the message box can be dropped there, and wait as chips with their name and size", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const close = await channelOpen("web-compose-drop");
  const filesPassOver = dragOnto({ files: [notes], form: CHANNEL_FORM });
  const textPassesOver = dragTextOnto(CHANNEL_FORM);
  dropOn({ files: [notes], form: CHANNEL_FORM });

  expect([filesPassOver, textPassesOver, pendingIn(CHANNEL_FORM)]).toStrictEqual([false, true, [NOTES]]);

  close();
});

it("the Attach files button is a named button that opens the file picker, whose files wait in the box", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const close = await channelOpen("web-compose-pick");
  const button = within(formNamed(CHANNEL_FORM)).getByRole("button", { name: "Attach files" });
  const opened = vi.spyOn(pickerIn(CHANNEL_FORM), "click");
  fireEvent.click(button);
  pickNothingIn(CHANNEL_FORM);
  pickIn({ files: [hills, notes], form: CHANNEL_FORM });

  expect([button.tagName, button.title, opened.mock.calls.length, pickerIn(CHANNEL_FORM).multiple]).toStrictEqual([
    "BUTTON",
    "Attach files",
    ONCE,
    true,
  ]);
  expect(pendingIn(CHANNEL_FORM)).toStrictEqual([HILLS, NOTES]);

  close();
});

it("a waiting file's remove button takes it out of the box before sending", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = await channelOpen("web-compose-remove");
  pickIn({ files: [hills, notes], form: CHANNEL_FORM });
  fireEvent.click(within(formNamed(CHANNEL_FORM)).getByRole("button", { name: "Remove hills.png" }));

  expect(pendingIn(CHANNEL_FORM)).toStrictEqual([NOTES]);

  close();
});

it("removing a waiting file focuses the next file's remove button", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = await channelOpen("web-compose-remove-focus");
  pickIn({ files: [hills, notes], form: CHANNEL_FORM });
  fireEvent.click(within(formNamed(CHANNEL_FORM)).getByRole("button", { name: "Remove hills.png" }));

  await waitFor(() => {
    expect(document.activeElement).toBe(
      within(formNamed(CHANNEL_FORM)).getByRole("button", { name: "Remove notes.txt" }),
    );
  });

  close();
});

it("a file over 10 MB is refused in the box with the server's wording, and the others still wait", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const close = await channelOpen("web-compose-large");
  dropOn({ files: [sized({ name: "dump.bin", size: OVER_TEN_MB }), notes], form: CHANNEL_FORM });
  const alert = await alertSaying("Couldn't attach");

  expect([alert.textContent, pendingIn(CHANNEL_FORM)]).toStrictEqual([
    "Couldn't attach dump.bin (attachment_too_large): An attachment is over 10 MB: each attachment can be at most 10 MB (10000000 bytes).",
    [NOTES],
  ]);

  close();
});

it("an 11th file is refused in the box with the server's wording, and the first 10 still wait", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const close = await channelOpen("web-compose-many");
  pickIn({ files: numbered(ELEVEN), form: CHANNEL_FORM });
  const alert = await alertSaying("Couldn't attach");

  expect([alert.textContent, pendingIn(CHANNEL_FORM).length]).toStrictEqual([
    "Couldn't attach file-10.txt (too_many_attachments): A message can have at most 10 attachments.",
    MOST_FILES,
  ]);

  close();
});

it("a post the server refuses says so and keeps its text and its files in the box", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = await channelOpen("web-compose-refused");
  typed(CHANNEL_FORM, "Here it is");
  pickIn({ files: [notes, sized({ name: "empty.txt", size: EMPTY })], form: CHANNEL_FORM });
  send(CHANNEL_FORM);
  const alert = await alertSaying("Couldn't post the message");

  expect([alert.textContent, screen.queryByDisplayValue("Here it is"), pendingIn(CHANNEL_FORM)]).toStrictEqual([
    "Couldn't post the message (attachment_empty): empty.txt is empty: an attachment needs at least 1 byte.",
    within(formNamed(CHANNEL_FORM)).getByRole("textbox"),
    [NOTES, "empty.txt0 B"],
  ]);

  close();
});

it("sending posts one message with its files, which shows them in the channel, and the box clears", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const close = await channelOpen("web-compose-send");
  typed(CHANNEL_FORM, "The view");
  pickIn({ files: [hills, notes], form: CHANNEL_FORM });
  send(CHANNEL_FORM);
  const shown = await inPane().findByRole("list", { name: "Attachments" });
  const { messages } = await adminClient().listMessages("web-compose-send");

  expect([
    within(shown).getByRole("img", { name: "hills.png" }).tagName,
    within(shown).getByRole("link").textContent,
    namesIn(messages),
    pendingIn(CHANNEL_FORM),
    screen.queryByDisplayValue("The view"),
  ]).toStrictEqual([
    "IMG",
    NOTES,
    [
      ["Earlier", []],
      ["The view", ["hills.png", "notes.txt"]],
    ],
    [],
    null,
  ]);

  close();
});

it("a reply sent with only a file shows it in the thread", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = await threadOpen("web-compose-reply");
  dropOn({ files: [notes], form: REPLY_FORM });
  send(REPLY_FORM);
  const shown = await inThread().findByRole("list", { name: "Attachments" });

  expect([within(shown).getByRole("link").textContent, pendingIn(REPLY_FORM)]).toStrictEqual([NOTES, []]);

  close();
});
