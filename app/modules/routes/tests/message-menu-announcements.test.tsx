import { expect, it, onTestFinished, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { idOf, postedIn } from "./feed.ts";
import { inPane, inThread } from "./regions.ts";
import type { Mock } from "vitest";
import type { Posted } from "./feed.ts";
import { chose } from "./menus.ts";
import { openAt } from "./render.tsx";

const TEXT = "Ship it?";

function stubClipboard(): Mock<(text: string) => Promise<void>> {
  const writeText = vi.fn<(text: string) => Promise<void>>(async () => {
    await Promise.resolve();
  });
  Object.defineProperty(globalThis.navigator, "clipboard", { configurable: true, value: { writeText } });
  onTestFinished(() => {
    Reflect.deleteProperty(globalThis.navigator, "clipboard");
  });
  return writeText;
}

async function announced(text: string): Promise<void> {
  const region = await screen.findByRole("status", { name: "Announcements" });
  await waitFor(() => {
    expect(region).toHaveProperty("textContent", text);
  });
}

function linkTo(hash: string): string {
  return new URL(hash, globalThis.location.href).href;
}

interface Replied {
  readonly posted: Posted;
  readonly thread: string;
  readonly link: string;
}

async function repliedIn(channel: string): Promise<Replied> {
  const posted = await postedIn({ channel, closed: [], texts: [TEXT] });
  const parent = idOf({ posted, text: TEXT });
  const { message } = await posted.poster.createMessage({ channel, replyTo: parent, text: "Shipped." });
  const thread = `#/channels/${channel}/threads/${String(parent)}`;
  return { link: linkTo(`${thread}/messages/${String(message.id)}`), posted, thread };
}

it("copy link on a reply copies a link to the reply in its thread, and says Link copied", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const writeText = stubClipboard();
  const { link, posted, thread } = await repliedIn("web-menu-copy-link-reply");
  const close = openAt({ client: posted.reader, hash: thread });
  fireEvent.contextMenu(await inThread().findByText("Shipped."));
  await chose("Copy link");

  await announced("Link copied");

  expect(writeText).toHaveBeenCalledWith(link);

  close();
});

it("copy link on a top-level message copies a link to it in its own thread", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const writeText = stubClipboard();
  const posted = await postedIn({ channel: "web-menu-copy-link-top", closed: [], texts: [TEXT] });
  const id = String(idOf({ posted, text: TEXT }));
  const close = openAt({ client: posted.reader, hash: `#/channels/${posted.channel}` });
  fireEvent.contextMenu(await inPane().findByText(TEXT));
  await chose("Copy link");

  await announced("Link copied");

  expect(writeText).toHaveBeenCalledWith(linkTo(`#/channels/${posted.channel}/threads/${id}/messages/${id}`));

  close();
});

it("reacting again with a reaction you already gave says Reaction removed", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const posted = await postedIn({ channel: "web-menu-reaction-removed", closed: [], texts: [TEXT] });
  await posted.reader.react(idOf({ posted, text: TEXT }), "thumbs_up");
  const close = openAt({ client: posted.reader, hash: `#/channels/${posted.channel}` });
  await inPane().findByRole("button", { name: "👍 1" });
  fireEvent.contextMenu(await inPane().findByText(TEXT));
  await chose("React with 👍");

  await announced("Reaction removed");

  close();
});
