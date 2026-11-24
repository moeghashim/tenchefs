import { expect, it, vi } from "vitest";
import { feedOf, idOf, postedIn } from "./feed.ts";
import { fireEvent, within } from "@testing-library/react";
import { inPane, inThread } from "./regions.ts";
import type { Posted } from "./feed.ts";
import { adminClient } from "./identities.ts";
import { alertSaying } from "./alerts.ts";
import { chose } from "./menus.ts";
import { openAt } from "./render.tsx";

const CLOSED_JUST_NOW = /^Closed by @[\w-]+ (?:just now|\d+ seconds ago)$/u;
const TEXTS = ["Before.", "Deploy?", "After."] as const;

async function feedShows(shown: readonly string[]): Promise<void> {
  await vi.waitFor(async () => {
    await expect(feedOf(TEXTS)).resolves.toStrictEqual(shown);
  });
}

async function threadWithReplies(channel: string, closed: readonly string[]): Promise<Posted> {
  const posted = await postedIn({ channel, closed: [], texts: TEXTS });
  const parent = idOf({ posted, text: "Deploy?" });
  await posted.poster.createMessage({ channel, replyTo: parent, text: "Noon works." });
  await posted.poster.createMessage({ channel, replyTo: parent, text: "Or one." });
  await Promise.all(
    closed.map(async (text) => {
      await posted.poster.closeThread(idOf({ posted, text }));
    }),
  );
  return posted;
}

function threadHash(posted: Posted): string {
  return `#/channels/${posted.channel}/threads/${String(idOf({ posted, text: "Deploy?" }))}`;
}

async function closedBarText(name: string): Promise<string> {
  const link = await inThread().findByRole("link", { name: `@${name}` });
  const bar = link.closest("p");
  if (bar === null) {
    throw new TypeError("The name is in no bar");
  }
  return bar.textContent;
}

async function closedByOf(posted: Posted): Promise<string | null> {
  const { parent } = await posted.poster.getThread(idOf({ posted, text: "Deploy?" }));
  return parent.closedBy ?? null;
}

function articleIn(text: string): HTMLElement {
  const article = inThread().getByText(text).closest("article");
  if (article === null) {
    throw new TypeError(`"${text}" is in no article`);
  }
  return article;
}

async function toggleThumbsUp(text: string, chip: string): Promise<void> {
  fireEvent.click(within(articleIn(text)).getByRole("button", { name: "React with 👍" }));
  await within(articleIn(text)).findByRole("button", { name: chip });
}

async function takeBackThumbsUp(text: string): Promise<void> {
  fireEvent.click(within(articleIn(text)).getByRole("button", { name: "👍 1" }));
  await vi.waitFor(() => {
    expect(within(articleIn(text)).queryByRole("button", { name: "👍 1" })).toBeNull();
  });
}

interface Opened {
  readonly posted: Posted;
  readonly close: () => void;
}

async function openedClosed(channel: string): Promise<Opened> {
  const posted = await threadWithReplies(channel, ["Deploy?"]);
  const close = openAt({ client: posted.reader, hash: threadHash(posted) });
  await inThread().findByText("Or one.");
  return { close, posted };
}

it("opening a closed thread by its address shows it all, who closed it and when, and Reopen", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { close, posted } = await openedClosed("web-closed-panel");

  await expect(closedBarText(`${posted.channel}-ada`)).resolves.toMatch(CLOSED_JUST_NOW);
  expect([inThread().getByText("Deploy?").textContent, inThread().getByText("Noon works.").textContent]).toStrictEqual([
    "Deploy?",
    "Noon works.",
  ]);
  expect(inThread().getByRole("button", { name: "Reopen thread" }).querySelector("svg")).not.toBeNull();

  await feedShows(["Before.", "<1 closed thread>", "After."]);

  close();
});

it("reopen in a closed thread's panel removes its bar, and the thread leaves its divider", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { close, posted } = await openedClosed("web-reopen-panel");
  fireEvent.click(inThread().getByRole("button", { name: "Reopen thread" }));
  await inThread().findByRole("button", { name: "Close thread" });

  expect(inThread().queryByRole("link", { name: `@${posted.channel}-ada` })).toBeNull();

  await feedShows(["Before.", "Deploy?", "After."]);

  await expect(closedByOf(posted)).resolves.toBeNull();

  close();
});

it("close in the thread panel closes the thread as the person", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const posted = await threadWithReplies("web-close-panel", []);
  const close = openAt({ client: posted.reader, hash: threadHash(posted) });
  fireEvent.click(await inThread().findByRole("button", { name: "Close thread" }));
  await inThread().findByRole("button", { name: "Reopen thread" });

  await expect(closedBarText(posted.readerName)).resolves.toMatch(CLOSED_JUST_NOW);
  await expect(closedByOf(posted)).resolves.toBe(posted.readerName);

  await feedShows(["Before.", "<1 closed thread>", "After."]);

  close();
});

it("close in a top-level message's menu closes its thread as the person", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const posted = await threadWithReplies("web-close-menu", []);
  const close = openAt({ client: posted.reader, hash: `#/channels/${posted.channel}` });
  fireEvent.contextMenu(await inPane().findByText("Deploy?"));
  await chose("Close");
  await feedShows(["Before.", "<1 closed thread>", "After."]);

  await expect(closedByOf(posted)).resolves.toBe(posted.readerName);

  close();
});

it("reopen in a closed top-level message's menu reopens its thread", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const posted = await threadWithReplies("web-reopen-menu", ["Deploy?"]);
  const close = openAt({ client: posted.reader, hash: `#/channels/${posted.channel}` });
  fireEvent.click(await inPane().findByRole("button", { name: "1 closed thread" }));
  fireEvent.contextMenu(await inPane().findByText("Deploy?"));
  await chose("Reopen");

  await vi.waitFor(async () => {
    await expect(closedByOf(posted)).resolves.toBeNull();
  });

  close();
});

it("a refused close says why", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const posted = await threadWithReplies("web-close-refused", []);
  const close = openAt({ client: posted.reader, hash: threadHash(posted) });
  await inThread().findByText("Or one.");
  await adminClient().deleteChannel(posted.channel);
  fireEvent.click(inThread().getByRole("button", { name: "Close thread" }));
  const alert = await alertSaying("Couldn't close the thread");

  expect(alert.textContent).toMatch(/^Couldn't close the thread \(message_not_found\): /u);
  expect(inThread().queryByRole("button", { name: "Reopen thread" })).toBeNull();

  close();
});

it("reacting in a closed thread's panel, and taking the reaction back, keeps the thread folded and closed", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { close, posted } = await openedClosed("web-closed-react");
  await toggleThumbsUp("Deploy?", "👍 1");
  await toggleThumbsUp("Noon works.", "👍 1");
  await feedShows(["Before.", "<1 closed thread>", "After."]);
  await takeBackThumbsUp("Noon works.");

  await feedShows(["Before.", "<1 closed thread>", "After."]);

  await expect(closedByOf(posted)).resolves.toBe(`${posted.channel}-ada`);
  expect(inThread().getByRole("button", { name: "Reopen thread" }).querySelector("svg")).not.toBeNull();

  close();
});
