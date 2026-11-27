import type { CookoutClient, MessageId } from "../../sdk/index.ts";
import { expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { inPane, inThread } from "./regions.ts";
import { openAt } from "./render.tsx";
import { subscribedReader } from "./inbox-reader.ts";
import { unreachableClient } from "../../testing/index.ts";

const TITLE_LENGTH = 100;
const LONGEST_TITLE = "x".repeat(TITLE_LENGTH);
const TOO_LONG_TITLE = `${LONGEST_TITLE}x`;

interface Opened {
  readonly channel: string;
  readonly poster: CookoutClient;
  readonly reader: CookoutClient;
  readonly parent: MessageId;
  readonly close: () => void;
}

interface Opening {
  readonly channel: string;
  readonly title: string | null;
  readonly through?: (reader: CookoutClient) => CookoutClient;
}

function asItIs(reader: CookoutClient): CookoutClient {
  return reader;
}

async function threadOpened({ channel, through = asItIs, title }: Opening): Promise<Opened> {
  const { poster, reader } = await subscribedReader(channel);
  const { message } = await poster.createMessage({ channel, text: "Deploy at noon?" });
  await poster.createMessage({ channel, replyTo: message.id, text: "Noon works." });
  if (title !== null) {
    await poster.setThreadTitle(message.id, title);
  }
  const close = openAt({ client: through(reader), hash: `#/channels/${channel}/threads/${String(message.id)}` });
  await inThread().findByText("Noon works.");
  return { channel, close, parent: message.id, poster, reader };
}

function titleForm(): HTMLElement {
  return inThread().getByRole("form", { name: "Thread title" });
}

function titleBox(): HTMLInputElement {
  const box = within(titleForm()).getByRole("textbox", { name: "Title" });
  if (!(box instanceof HTMLInputElement)) {
    throw new TypeError("The title field is no input");
  }
  return box;
}

async function opened(control: string): Promise<HTMLInputElement> {
  fireEvent.click(await inThread().findByRole("button", { name: control }));
  await vi.waitFor(() => {
    expect(globalThis.document.activeElement).toBe(titleBox());
  });
  return titleBox();
}

function saved(text: string): void {
  fireEvent.change(titleBox(), { target: { value: text } });
  fireEvent.submit(titleForm());
}

async function headingShows(heading: string): Promise<void> {
  await vi.waitFor(() => {
    expect(inThread().element().querySelector("header h2")).toHaveProperty("textContent", heading);
  });
}

async function headerAndListShow(title: string): Promise<void> {
  await headingShows(title);
  await vi.waitFor(() => {
    expect(inPane().getByRole("heading", { level: 3, name: title })).toBeDefined();
  });
}

async function storedTitle(thread: Opened): Promise<string | null> {
  const { parent } = await thread.poster.getThread(thread.parent);
  return parent.title ?? null;
}

async function storedSetter(thread: Opened): Promise<readonly (string | null)[]> {
  const { parent } = await thread.poster.getThread(thread.parent);
  return [parent.title ?? null, parent.titleSetBy ?? null];
}

interface Refused {
  readonly alert: string;
  readonly text: string;
  readonly invalid: string | null;
}

async function refused(): Promise<Refused> {
  const alert = await vi.waitFor(() => {
    const said = within(titleForm()).getByRole("alert").textContent;

    expect(said).not.toBe("");

    return said;
  });
  return { alert, invalid: titleBox().getAttribute("aria-invalid"), text: titleBox().value };
}

async function editClosedOn(control: string): Promise<void> {
  const button = await inThread().findByRole("button", { name: control });

  expect(inThread().queryByRole("form", { name: "Thread title" })).toBeNull();

  await vi.waitFor(() => {
    expect(globalThis.document.activeElement).toBe(button);
  });
}

it("add title on an untitled thread opens an empty field, and Enter saves the title as the reader", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const thread = await threadOpened({ channel: "web-title-add", title: null });
  await headingShows("Thread");

  const box = await opened("Add title");

  expect(box.value).toBe("");

  saved("Deploy window");
  await headerAndListShow("Deploy window");
  await editClosedOn("Edit title");

  await expect(storedSetter(thread)).resolves.toStrictEqual(["Deploy window", "web-title-add-reader"]);

  thread.close();
});

it("edit title on a titled thread holds the current title, and saving changes it", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const thread = await threadOpened({ channel: "web-title-change", title: "Deploy window" });
  await headingShows("Deploy window");

  const box = await opened("Edit title");

  expect(box.value).toBe("Deploy window");

  saved("Deploy moved to one");
  await headingShows("Deploy moved to one");
  await editClosedOn("Edit title");

  await expect(storedTitle(thread)).resolves.toBe("Deploy moved to one");

  thread.close();
});

it("saving an empty field clears the title, and the header goes back to Thread", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const thread = await threadOpened({ channel: "web-title-clear", title: "Deploy window" });
  await opened("Edit title");
  saved("");
  await headingShows("Thread");
  await editClosedOn("Add title");

  await expect(storedTitle(thread)).resolves.toBeNull();

  thread.close();
});

it("escape in the field cancels, leaving the title and the thread panel as they were", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const thread = await threadOpened({ channel: "web-title-cancel", title: "Deploy window" });
  const box = await opened("Edit title");
  fireEvent.change(box, { target: { value: "Not this" } });
  fireEvent.keyDown(box, { key: "Escape" });
  await editClosedOn("Edit title");
  await headingShows("Deploy window");

  expect(screen.getByRole("complementary", { name: "Thread" })).toBeDefined();
  await expect(storedTitle(thread)).resolves.toBe("Deploy window");

  thread.close();
});

it("letters typed in the field are typed, not taken as board shortcuts", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const thread = await threadOpened({ channel: "web-title-typing", title: null });
  const box = await opened("Add title");
  for (const key of ["x", "j", "k", "e", "?"]) {
    const typed = fireEvent.keyDown(box, { key });

    expect(typed).toBe(true);
  }

  expect(screen.queryByRole("dialog")).toBeNull();
  expect(globalThis.document.activeElement).toBe(box);

  thread.close();
});

it("a title over 100 characters is refused, keeping the field, its text and the old title", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const thread = await threadOpened({ channel: "web-title-long", title: "Deploy window" });
  await opened("Edit title");
  saved(TOO_LONG_TITLE);

  await expect(refused()).resolves.toStrictEqual({
    alert: "Use at most 100 characters.",
    invalid: "true",
    text: TOO_LONG_TITLE,
  });
  await expect(storedTitle(thread)).resolves.toBe("Deploy window");

  saved(LONGEST_TITLE);
  await headingShows(LONGEST_TITLE);

  thread.close();
});

function titlingUnreachable(reader: CookoutClient): CookoutClient {
  const { setThreadTitle } = unreachableClient({ token: "cookout_unused" });
  return { ...reader, setThreadTitle };
}

it("a title the server can't be reached to save keeps the field and its text, and says so", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const thread = await threadOpened({ channel: "web-title-unreachable", through: titlingUnreachable, title: null });
  await opened("Add title");
  saved("Never saved");
  const { invalid, text } = await refused();

  expect({ invalid, text }).toStrictEqual({ invalid: "true", text: "Never saved" });
  await expect(storedTitle(thread)).resolves.toBeNull();

  thread.close();
});
