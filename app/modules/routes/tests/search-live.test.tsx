import type { CookoutClient, MessageId } from "../../sdk/index.ts";
import { expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { idOf, postedIn } from "./feed.ts";
import type { Posted } from "./feed.ts";
import { newIdentity } from "./identities.ts";
import { openAt } from "./render.tsx";
import { watched } from "./watched.ts";

const RESULTS = { name: "Search results" } as const;

interface Asking {
  readonly channel: string;
  readonly word: string;
  readonly closed: boolean;
  readonly query: string;
  readonly outsider: boolean;
}

interface Searched {
  readonly poster: CookoutClient;
  readonly parent: MessageId;
  readonly close: () => void;
}

function rowsNow(): readonly string[] {
  const rows: string[] = [];
  for (const option of within(screen.getByRole("listbox", RESULTS)).getAllByRole("option")) {
    rows.push(option.textContent);
  }
  return rows;
}

async function rowsAre(rows: readonly string[]): Promise<void> {
  await vi.waitFor(() => {
    expect(rowsNow()).toStrictEqual(rows);
  });
}

async function readerOf({ channel, outsider }: Asking, subscribed: CookoutClient): Promise<CookoutClient> {
  if (!outsider) {
    return subscribed;
  }
  const unsubscribed = await newIdentity({ kind: "human", name: `${channel}-carol` });
  return unsubscribed.client;
}

interface Thread {
  readonly posted: Posted;
  readonly parent: MessageId;
}

async function threadPosted({ channel, closed, word }: Asking): Promise<Thread> {
  const posted = await postedIn({ channel, closed: [], texts: [`${word} deploy?`] });
  const parent = idOf({ posted, text: `${word} deploy?` });
  await posted.poster.createMessage({ channel, replyTo: parent, text: `${word} at noon` });
  await (closed && posted.poster.closeThread(parent));
  return { parent, posted };
}

async function searchedLive(asking: Asking): Promise<Searched> {
  const { parent, posted } = await threadPosted(asking);
  const reader = await readerOf(asking, posted.reader);
  const { live, stream } = watched(reader);
  const close = openAt({ client: reader, hash: "#/inbox", live });
  await stream;
  fireEvent.input(await screen.findByRole("combobox", { name: "Search" }), { target: { value: asking.query } });
  return { close, parent, poster: posted.poster };
}

it("a result row shows its author's new display name and its thread closing live, with no new search", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-search-live";
  const searched = await searchedLive({
    channel,
    closed: false,
    outsider: false,
    query: "ibexlive",
    word: "Ibexlive",
  });
  await rowsAre([
    `${channel}-adareplied in #${channel} · just nowIbexlive at noon`,
    `${channel}-adaposted in #${channel} · just nowIbexlive deploy?`,
  ]);
  await searched.poster.setDisplayName(`${channel}-ada`, "Ada Byron");
  await rowsAre([
    `Ada Byronreplied in #${channel} · just nowIbexlive at noon`,
    `Ada Byronposted in #${channel} · just nowIbexlive deploy?`,
  ]);
  await searched.poster.closeThread(searched.parent);

  await expect(
    rowsAre([
      `Ada Byronreplied in #${channel} · Closed · just nowIbexlive at noon`,
      `Ada Byronposted in #${channel} · Closed · just nowIbexlive deploy?`,
    ]),
  ).resolves.toBeUndefined();

  searched.close();
});

it("a reply that reopens a closed thread takes Closed off a reply's result row live, for a reader outside the channel", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-search-reopen";
  const searched = await searchedLive({
    channel,
    closed: true,
    outsider: true,
    query: "lynxlive noon",
    word: "Lynxlive",
  });
  await rowsAre([`${channel}-adareplied in #${channel} · Closed · just nowLynxlive at noon`]);
  await searched.poster.createMessage({ channel, replyTo: searched.parent, text: "Moved to two" });

  await expect(rowsAre([`${channel}-adareplied in #${channel} · just nowLynxlive at noon`])).resolves.toBeUndefined();

  searched.close();
});
