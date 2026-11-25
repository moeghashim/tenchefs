import { expect, it, onTestFinished, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { idOf, postedIn } from "./feed.ts";
import type { MessageId } from "../../sdk/index.ts";
import { inThread } from "./regions.ts";
import { openAt } from "./render.tsx";

const PAGE = 2;
const ONE = 1;
const RESULTS = { name: "Search results" } as const;

interface Thread {
  readonly close: () => void;
  readonly parent: MessageId;
  readonly reply: MessageId;
}

interface Row {
  readonly text: string;
  readonly marked: readonly string[];
}

function scrollingIntoView(): void {
  Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn<() => void>() });
  onTestFinished(() => {
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  });
}

async function typed(query: string): Promise<void> {
  fireEvent.input(await screen.findByRole("combobox", { name: "Search" }), { target: { value: query } });
}

function rowsNow(): readonly Row[] {
  const rows: Row[] = [];
  for (const item of within(screen.getByRole("listbox", RESULTS)).getAllByRole("option")) {
    const marked: string[] = [];
    for (const mark of item.querySelectorAll("mark")) {
      marked.push(mark.textContent);
    }
    rows.push({ marked, text: item.textContent });
  }
  return rows;
}

async function rowsShown(count: number): Promise<readonly Row[]> {
  const rows = await vi.waitFor(() => {
    const shown = rowsNow();

    expect(shown).toHaveLength(count);

    return shown;
  });
  return rows;
}

async function clickedResult(text: Readonly<RegExp>): Promise<void> {
  const link = await vi.waitFor(() => within(screen.getByRole("listbox", RESULTS)).getByRole("option", { name: text }));
  fireEvent.mouseDown(link);
}

async function highlightedIn(text: string): Promise<string | null> {
  const found = await inThread().findByText(text);
  const article = found.closest("article");
  if (article === null) {
    return null;
  }
  return article.getAttribute("aria-current");
}

it("typing a word shows the matching messages newest first, with channel, author, time, highlights and Closed", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const posted = await postedIn({
    channel: "web-search-rows",
    closed: ["Yakwords **first** yakwordsy"],
    texts: ["Yakwords **first** yakwordsy", "Nothing here", "Second yakwords"],
  });
  const close = openAt({ client: posted.reader, hash: "#/inbox" });
  await typed("YAKWORDS");

  await expect(rowsShown(PAGE)).resolves.toStrictEqual([
    {
      marked: ["yakwords"],
      text: "web-search-rows-adaposted in #web-search-rows · just nowSecond yakwords",
    },
    {
      marked: ["Yakwords", "yakwordsy"],
      text: "web-search-rows-adaposted in #web-search-rows · Closed · just nowYakwords first yakwordsy",
    },
  ]);

  close();
});

async function openedOnThread(channel: string): Promise<Thread> {
  scrollingIntoView();
  const posted = await postedIn({ channel, closed: [], texts: [`Okapiopen deploy? ${channel}`] });
  const parent = idOf({ posted, text: `Okapiopen deploy? ${channel}` });
  const { message } = await posted.poster.createMessage({
    channel,
    replyTo: parent,
    text: `Okapiopen at noon ${channel}`,
  });
  return { close: openAt({ client: posted.reader, hash: "#/inbox" }), parent, reply: message.id };
}

it("pressing a top-level result opens its thread beside its channel and closes the list", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const opened = await openedOnThread("web-search-top");
  await typed("okapiopen deploy web search top");
  await clickedResult(/Okapiopen deploy/u);

  await expect(inThread().findByText("Okapiopen deploy? web-search-top")).resolves.toBeDefined();
  expect([globalThis.location.hash, screen.queryByRole("listbox", RESULTS)]).toStrictEqual([
    `#/channels/web-search-top/threads/${String(opened.parent)}`,
    null,
  ]);

  opened.close();
});

it("pressing a reply's result opens its thread on that reply, highlighted", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const opened = await openedOnThread("web-search-reply");
  await typed("okapiopen noon web search reply");
  await clickedResult(/Okapiopen at noon/u);

  await expect(highlightedIn("Okapiopen at noon web-search-reply")).resolves.toBe("true");
  expect(globalThis.location.hash).toBe(
    `#/channels/web-search-reply/threads/${String(opened.parent)}/messages/${String(opened.reply)}`,
  );

  opened.close();
});

it("a query with no matches says so, and a refused query shows the server's message", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const posted = await postedIn({ channel: "web-search-none", closed: [], texts: ["Hello"] });
  const close = openAt({ client: posted.reader, hash: "#/inbox" });
  await typed("zzqxnothingmatchesthis");
  await screen.findByText("No messages match.");
  await typed("in:#web-search-no-such-channel");

  await expect(screen.findByText(/web-search-no-such-channel/u)).resolves.toBeDefined();
  expect(screen.queryByText("No messages match.")).toBeNull();

  close();
});

it("scrolling to the end of a long list loads the next page", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const posted = await postedIn({
    channel: "web-search-pages",
    closed: [],
    texts: ["Tapirpage 1", "Tapirpage 2", "Tapirpage 3"],
  });
  const close = openAt({ client: posted.reader, hash: "#/inbox", searchLimit: PAGE });
  await typed("tapirpage");
  await rowsShown(PAGE);
  fireEvent.scroll(screen.getByRole("listbox", RESULTS));

  await expect(rowsShown(PAGE + ONE)).resolves.toStrictEqual([
    { marked: ["Tapirpage"], text: "web-search-pages-adaposted in #web-search-pages · just nowTapirpage 3" },
    { marked: ["Tapirpage"], text: "web-search-pages-adaposted in #web-search-pages · just nowTapirpage 2" },
    { marked: ["Tapirpage"], text: "web-search-pages-adaposted in #web-search-pages · just nowTapirpage 1" },
  ]);

  close();
});

const NEWEST = [["zebrasort"], ["Zebrasort", "zebrasort", "zebrasort"]] as const;
const BEST = NEWEST.toReversed();

async function sortedTo(name: string, marked: readonly (readonly string[])[]): Promise<boolean> {
  fireEvent.click(screen.getByRole("radio", { name }));
  await vi.waitFor(() => {
    expect(rowsNow().map((row) => row.marked)).toStrictEqual(marked);
  });
  return screen.getByRole("radio", { name }).matches(":checked");
}

it("switching to Best match reorders the results, and back to Newest restores them", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const posted = await postedIn({
    channel: "web-search-sort",
    closed: [],
    texts: ["Zebrasort zebrasort zebrasort", "Lunch is at noon and the coffee is fixed, then zebrasort"],
  });
  const close = openAt({ client: posted.reader, hash: "#/inbox" });
  await typed("zebrasort");
  const before = await rowsShown(NEWEST.length);
  const best = await sortedTo("Best match", BEST);

  await expect(sortedTo("Newest", NEWEST)).resolves.toBe(true);
  expect([before.map((row) => row.marked), best]).toStrictEqual([NEWEST, true]);

  close();
});
