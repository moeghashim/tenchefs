import type { Attachment, Message, NewAttachment } from "../../sdk/index.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { inConversation, inPane, inThread } from "./regions.ts";
import { adminClient } from "./identities.ts";
import { hillsPng } from "../../testing/index.ts";
import { openWithClockStopped } from "./clock.ts";
import { postedWithFiles } from "./attachment-posts.ts";
import { subscribedReader } from "./inbox-reader.ts";
import { viewOpened } from "./view-opened.ts";

const NOTES_LENGTH = 1536;
const LOG_LENGTH = 12_000;
const DUMP_LENGTH = 1_200_000;
const PNG_CUT_BEFORE_ITS_SIZE = "89504e470d0a1a0a0000000d494844520000";
const LOGO: NewAttachment = {
  bytes: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
  name: "logo.svg",
};
const NOTES: NewAttachment = { bytes: new TextEncoder().encode("x".repeat(NOTES_LENGTH)), name: "notes.txt" };

interface Shown {
  readonly images: readonly string[];
  readonly chips: readonly string[];
  readonly embedded: number;
}

interface FilesPost {
  readonly channel: string;
  readonly replyTo?: Message["id"];
}

function files(): readonly NewAttachment[] {
  return [{ bytes: hillsPng(), name: "hills.png" }, LOGO, NOTES];
}

function assetOf(message: Message, name: string): string {
  const ids = (message.attachments ?? [])
    .filter((attachment: Readonly<Attachment>) => attachment.name === name)
    .map((attachment: Readonly<Attachment>) => attachment.id);
  return `/v1/assets/${ids.join("")}`;
}

interface Shows {
  readonly element: () => HTMLElement;
}

function listIn(region: Shows): HTMLElement {
  return within(region.element()).getByRole("list", { name: "Attachments" });
}

function chipsIn(region: Shows): readonly string[] {
  const chips: string[] = [];
  for (const link of within(listIn(region)).getAllByRole("link")) {
    chips.push(`${link.textContent} ${link.getAttribute("href") ?? ""} ${link.getAttribute("download") ?? ""}`);
  }
  return chips;
}

function imagesIn(region: Shows): readonly string[] {
  const images: string[] = [];
  for (const image of within(listIn(region)).getAllByRole("img")) {
    images.push(`${image.getAttribute("alt") ?? ""} ${image.getAttribute("src") ?? ""}`);
  }
  return images;
}

function shownIn(region: Shows): Shown {
  return {
    chips: chipsIn(region),
    embedded: region.element().querySelectorAll("iframe, object, embed").length,
    images: imagesIn(region),
  };
}

function expected(message: Message): Shown {
  return {
    chips: [
      `logo.svg71 B ${assetOf(message, "logo.svg")} logo.svg`,
      `notes.txt1.5 KB ${assetOf(message, "notes.txt")} notes.txt`,
    ],
    embedded: 0,
    images: [`hills.png ${assetOf(message, "hills.png")}`],
  };
}

async function filesIn(post: FilesPost): Promise<Message> {
  const message = await postedWithFiles({
    attachments: files(),
    client: adminClient(),
    text: "Here are the files",
    ...post,
  });
  return message;
}

async function openFullSize(channel: string): Promise<Message> {
  await adminClient().createChannel({ name: channel });
  const message = await filesIn({ channel });
  return message;
}

it("a message's image shows as a thumbnail and its other files, SVG included, as chips under its text in the channel", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await adminClient().createChannel({ name: "web-attachments-channel" });
  const message = await filesIn({ channel: "web-attachments-channel" });
  const close = openWithClockStopped({ client: adminClient(), hash: "#/channels/web-attachments-channel" });
  await inPane().findByRole("list", { name: "Attachments" });

  expect(shownIn(inPane())).toStrictEqual(expected(message));

  close();
});

it("a thumbnail keeps the image's shape while it loads, scaled to fit", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await adminClient().createChannel({ name: "web-attachments-space" });
  await filesIn({ channel: "web-attachments-space" });
  const close = openWithClockStopped({ client: adminClient(), hash: "#/channels/web-attachments-space" });
  const image = await inPane().findByRole("img", { name: "hills.png" });

  expect([image.style.width, image.style.height]).toStrictEqual(["300px", "200px"]);

  close();
});

it("a reply's attachments show in the thread", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await adminClient().createChannel({ name: "web-attachments-thread" });
  const { message: parent } = await adminClient().createMessage({ channel: "web-attachments-thread", text: "Files?" });
  const reply = await filesIn({ channel: "web-attachments-thread", replyTo: parent.id });
  const close = openWithClockStopped({
    client: adminClient(),
    hash: `#/channels/web-attachments-thread/threads/${String(parent.id)}`,
  });
  await inThread().findByRole("list", { name: "Attachments" });

  expect(shownIn(inThread())).toStrictEqual(expected(reply));

  close();
});

it("a message's attachments show in the Inbox conversation", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { poster, reader } = await subscribedReader("web-attachments-inbox");
  const message = await postedWithFiles({
    attachments: files(),
    channel: "web-attachments-inbox",
    client: poster,
    text: "Here are the files",
  });
  const { close } = await viewOpened({
    client: reader,
    hash: "#/inbox/web-attachments-inbox",
    open: openWithClockStopped,
    waitingOn: ["inbox", "listMessages"],
  });
  await inConversation().findByRole("list", { name: "Attachments" });

  expect(shownIn(inConversation())).toStrictEqual(expected(message));

  close();
});

it("clicking a thumbnail opens the image at full size", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const message = await openFullSize("web-attachments-full");
  const close = openWithClockStopped({ client: adminClient(), hash: "#/channels/web-attachments-full" });
  fireEvent.click(await inPane().findByRole("button", { name: "hills.png" }));
  const full = within(await screen.findByRole("dialog", { name: "hills.png" })).getByRole("img", { name: "hills.png" });

  expect([full.getAttribute("src"), full.getAttribute("width"), full.getAttribute("height")]).toStrictEqual([
    assetOf(message, "hills.png"),
    "480",
    "320",
  ]);

  close();
});

it("the Escape key closes the full-size image", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await openFullSize("web-attachments-escape");
  const close = openWithClockStopped({ client: adminClient(), hash: "#/channels/web-attachments-escape" });
  fireEvent.click(await inPane().findByRole("button", { name: "hills.png" }));
  fireEvent.keyDown(await screen.findByRole("dialog", { name: "hills.png" }), { key: "Escape" });

  await waitFor(() => {
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  close();
});

it("a search result shows its message's image and the names of its other files", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await adminClient().createChannel({ name: "web-attachments-search" });
  const message = await postedWithFiles({
    attachments: files(),
    channel: "web-attachments-search",
    client: adminClient(),
    text: "Quokka photos",
  });
  const close = openWithClockStopped({ client: adminClient(), hash: "#/channels/web-attachments-search" });
  fireEvent.input(await screen.findByRole("combobox", { name: "Search" }), { target: { value: "quokka" } });
  const result = await waitFor(() =>
    within(screen.getByRole("listbox", { name: "Search results" })).getByRole("option", { name: /Quokka/u }),
  );
  const shown: Shows = { element: () => result };

  expect([imagesIn(shown), within(listIn(shown)).queryAllByRole("link"), listIn(shown).textContent]).toStrictEqual([
    [`hills.png ${assetOf(message, "hills.png")}`],
    [],
    "logo.svg71 Bnotes.txt1.5 KB",
  ]);

  close();
});

it("a file's size reads in kilobytes or megabytes once it is that big", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await adminClient().createChannel({ name: "web-attachments-sizes" });
  const message = await postedWithFiles({
    attachments: [
      { bytes: new TextEncoder().encode("x".repeat(LOG_LENGTH)), name: "log.txt" },
      { bytes: new Uint8Array(DUMP_LENGTH), name: "dump.bin" },
    ],
    channel: "web-attachments-sizes",
    client: adminClient(),
    text: "Logs",
  });
  const close = openWithClockStopped({ client: adminClient(), hash: "#/channels/web-attachments-sizes" });
  await inPane().findByRole("list", { name: "Attachments" });

  expect(chipsIn(inPane())).toStrictEqual([
    `log.txt12 KB ${assetOf(message, "log.txt")} log.txt`,
    `dump.bin1.2 MB ${assetOf(message, "dump.bin")} dump.bin`,
  ]);

  close();
});

it("an image whose size can't be read takes the whole thumbnail box, and opens at its own size", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await adminClient().createChannel({ name: "web-attachments-unsized" });
  await postedWithFiles({
    attachments: [{ bytes: Uint8Array.from(Buffer.from(PNG_CUT_BEFORE_ITS_SIZE, "hex")), name: "cut.png" }],
    channel: "web-attachments-unsized",
    client: adminClient(),
    text: "Cut",
  });
  const close = openWithClockStopped({ client: adminClient(), hash: "#/channels/web-attachments-unsized" });
  const thumbnail = await inPane().findByRole("img", { name: "cut.png" });
  fireEvent.click(inPane().getByRole("button", { name: "cut.png" }));
  const full = within(await screen.findByRole("dialog", { name: "cut.png" })).getByRole("img", { name: "cut.png" });

  expect([thumbnail.style.width, thumbnail.style.height, full.hasAttribute("width")]).toStrictEqual([
    "300px",
    "200px",
    false,
  ]);

  close();
});
