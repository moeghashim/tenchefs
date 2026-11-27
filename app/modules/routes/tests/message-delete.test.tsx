import type { CookoutClient, MessageId } from "../../sdk/index.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { idOf, postedIn } from "./feed.ts";
import { inPane, inThread } from "./regions.ts";
import type { Posted } from "./feed.ts";
import { adminClient } from "./identities.ts";
import { chose } from "./menus.ts";
import { openAt } from "./render.tsx";
import { refusalOf } from "../../sdk/index.ts";

const ASK = "Delete this message?";
const DELETED = "Message deleted";
const LAST_TWO = -2;

type Region = typeof inPane;

async function itemsOf(): Promise<readonly string[]> {
  const shown = await screen.findByRole("menu", { name: "Message actions" });
  const items: string[] = [];
  for (const item of within(shown).getAllByRole("menuitem")) {
    items.push(item.textContent);
  }
  return items;
}

async function menuEndOn(region: Region, text: string): Promise<readonly string[]> {
  fireEvent.contextMenu(await region().findByText(text));
  const items = await itemsOf();
  fireEvent.keyDown(await screen.findByRole("menu", { name: "Message actions" }), { key: "Escape" });
  return items.slice(LAST_TWO);
}

async function announced(text: string): Promise<void> {
  const region = await screen.findByRole("status", { name: "Announcements" });
  await waitFor(() => {
    expect(region).toHaveProperty("textContent", text);
  });
}

async function focusedArticle(text: string): Promise<HTMLElement> {
  const found = await inPane().findByText(text);
  const article = found.closest("article");
  if (article === null) {
    throw new TypeError(`${text} is in no message`);
  }
  article.focus();
  return article;
}

async function codeOf(client: CookoutClient, id: MessageId): Promise<string> {
  try {
    await client.getThread(id);
    return "found";
  } catch (error: unknown) {
    return refusalOf(error).code;
  }
}

interface Mine {
  readonly posted: Posted;
  readonly id: MessageId;
  readonly close: () => void;
}

interface Opening {
  readonly texts?: readonly string[];
  readonly replies?: readonly string[];
}

async function mineOpened(channel: string, { replies = [], texts = [] }: Opening = {}): Promise<Mine> {
  const posted = await postedIn({ channel, closed: [], texts });
  const { message } = await posted.reader.createMessage({ channel, text: "Mine." });
  await Promise.all(
    replies.map(async (text) => {
      await posted.poster.createMessage({ channel, replyTo: message.id, text });
    }),
  );
  const close = openAt({ client: posted.reader, hash: `#/channels/${channel}` });
  return { close, id: message.id, posted };
}

async function askedToDelete(title: string): Promise<HTMLElement> {
  fireEvent.contextMenu(await inPane().findByText("Mine."));
  await chose("Delete");
  const dialog = await screen.findByRole("alertdialog", { name: title });
  return dialog;
}

it("your own message's menu ends with Delete, showing its key, and someone else's has no Delete", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { close } = await mineOpened("web-delete-menu", { texts: ["Theirs."] });

  await expect(menuEndOn(inPane, "Mine.")).resolves.toStrictEqual(["Closex", "DeleteDelete"]);
  await expect(menuEndOn(inPane, "Theirs.")).resolves.toStrictEqual(["Copy textc", "Closex"]);

  close();
});

it("your own reply's menu in its thread ends with Delete, after its thread's Close", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const posted = await postedIn({ channel: "web-delete-reply-menu", closed: [], texts: ["Ship it?"] });
  const parent = idOf({ posted, text: "Ship it?" });
  await posted.reader.createMessage({ channel: posted.channel, replyTo: parent, text: "Shipped." });
  const close = openAt({ client: posted.reader, hash: `#/channels/${posted.channel}/threads/${String(parent)}` });

  await expect(menuEndOn(inThread, "Shipped.")).resolves.toStrictEqual(["Closex", "DeleteDelete"]);

  close();
});

it("choosing Delete asks to confirm, and Cancel keeps the message", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { close, id, posted } = await mineOpened("web-delete-cancel");
  const dialog = await askedToDelete(ASK);
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() => {
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  await expect(inPane().findByText("Mine.")).resolves.toBeInstanceOf(HTMLElement);
  await expect(codeOf(posted.reader, id)).resolves.toBe("found");

  close();
});

it("confirming Delete on a thread you started deletes it, shows Message deleted in place, and says so", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { close, id, posted } = await mineOpened("web-delete-thread", { replies: ["One.", "Two."] });
  const dialog = await askedToDelete("Delete this thread and its 2 replies?");
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
  await inPane().findByText(DELETED);
  await announced(DELETED);

  expect(within(inPane().element()).queryByText("Mine.")).toBeNull();
  await expect(codeOf(posted.reader, id)).resolves.toBe("message_not_found");

  close();
});

it("asking to delete a thread with one reply names one reply", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { close } = await mineOpened("web-delete-one-reply", { replies: ["Only."] });

  await expect(askedToDelete("Delete this thread and its 1 reply?")).resolves.toBeInstanceOf(HTMLElement);

  close();
});

it("the Delete key on your own focused message asks to confirm, and on someone else's does nothing", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { close } = await mineOpened("web-delete-key", { texts: ["Theirs."] });
  fireEvent.keyDown(await focusedArticle("Theirs."), { key: "Delete" });
  const none = screen.queryByRole("alertdialog");
  fireEvent.keyDown(await focusedArticle("Mine."), { key: "Delete" });

  await expect(screen.findByRole("alertdialog", { name: ASK })).resolves.toBeInstanceOf(HTMLElement);

  expect(none).toBeNull();

  close();
});

it("a refused delete says why, in the confirmation and through the announcements", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { close, id } = await mineOpened("web-delete-refused");
  const dialog = await askedToDelete(ASK);
  await adminClient().deleteMessage(id);
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
  const said = await within(dialog).findByText(/^Couldn't delete the message\./u);

  await announced(said.textContent);

  close();
});
