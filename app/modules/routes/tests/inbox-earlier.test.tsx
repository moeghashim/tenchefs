import type { CookoutClient, MessageId } from "../../sdk/index.ts";
import { agentShown, anonymousClient } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { rowsOf, subscribedReader } from "./inbox-reader.ts";
import type { Answering } from "./answering.ts";
import { alertSaying } from "./alerts.ts";
import { answering } from "./answering.ts";
import { inPane } from "./regions.ts";
import { openWithClockStopped } from "./clock.ts";
import { testAgentDisplayName } from "../../testing/index.ts";

const NONE = 0;
const ONE = 1;
const TWO_A_PAGE = 2;

async function postAll(poster: CookoutClient, channel: string, texts: readonly string[]): Promise<MessageId> {
  const [text, ...rest] = texts;
  const { message } = await poster.createMessage({ channel, text: String(text) });
  if (rest.length === NONE) {
    return message.id;
  }
  const last = await postAll(poster, channel, rest);
  return last;
}

async function readThenUnread(channel: string): Promise<CookoutClient> {
  const { poster, reader } = await subscribedReader(channel);
  await reader.ack(await postAll(poster, channel, ["One", "Two", "Three"]));
  await postAll(poster, channel, ["Four", "Five", "Six"]);
  return reader;
}

function historyRefusedAfter(reader: CookoutClient, pages: number): CookoutClient {
  let asked = NONE;
  return {
    ...reader,
    inboxHistory: async (query) => {
      asked += ONE;
      if (asked > pages) {
        const refused = await anonymousClient().inboxHistory(query);
        return refused;
      }
      const page = await reader.inboxHistory(query);
      return page;
    },
  };
}

function answeredWith<Answer>(answer: Answer): () => Promise<Answer> {
  return async () => {
    const answered = await Promise.resolve(answer);
    return answered;
  };
}

async function readElsewhere(channel: string): Promise<CookoutClient> {
  const { poster, reader } = await subscribedReader(channel);
  const last = await postAll(poster, channel, ["One"]);
  const [inbox, positions] = await Promise.all([reader.inbox(), reader.readPositions()]);
  await reader.ack(last);
  return {
    ...reader,
    inbox: answeredWith(inbox),
    readPositions: answeredWith(positions),
  };
}

async function historyShown(answered: Answering["answered"], shown: () => Promise<void>): Promise<void> {
  await answered("inboxHistory");
  await shown();
}

function postedRow(channel: string, text: string): string {
  return `#/inbox/${channel} New in #${channel}${agentShown(`${channel}-poster`)}posted in#${channel}just now${text}`;
}

function newRow(channel: string, text: string): string {
  return `#/inbox/${channel} New in #${channel}${agentShown(`${channel}-poster`)}posted in#${channel}3 newjust now${text}`;
}

it("earlier lists read rows, a page at a time, merging each page into the rows it shows, until there are no more", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-inbox-earlier";
  const { answered, client } = answering(await readThenUnread(channel));
  const unmount = openWithClockStopped({ client, hash: "#/inbox", pageSize: TWO_A_PAGE });
  await historyShown(answered, async () => {
    await screen.findByRole("list", { name: "Earlier" });
  });

  expect([rowsOf("Earlier"), screen.queryByText("That's everything.")]).toStrictEqual([
    [postedRow(channel, "Three")],
    null,
  ]);

  fireEvent.click(inPane().getByRole("button", { name: "Show earlier" }));
  await historyShown(answered, async () => {
    await screen.findByText("That's everything.");
  });

  expect([
    rowsOf("Earlier"),
    rowsOf("Activity"),
    inPane().queryByRole("button", { name: "Show earlier" }),
  ]).toStrictEqual([[postedRow(channel, "Three")], [newRow(channel, "Six")], null]);

  unmount();
});

it("clicking Load more twice before it answers reads the next page once", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const channel = "web-inbox-double-click";
  const reader = await readThenUnread(channel);
  const unmount = openWithClockStopped({ client: reader, hash: "#/inbox", pageSize: TWO_A_PAGE });
  const more = await inPane().findByRole("button", { name: "Show earlier" });

  fireEvent.click(more);
  fireEvent.click(more);
  await screen.findByText("That's everything.");

  expect(rowsOf("Earlier")).toStrictEqual([postedRow(channel, "Three")]);

  unmount();
});

it("an Earlier page that can't be read says why, at first or on Load more", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const reader = await readThenUnread("web-inbox-earlier-refused");
  const unmount = openWithClockStopped({ client: historyRefusedAfter(reader, NONE), hash: "#/inbox" });
  const first = await alertSaying("Couldn't load what you've read (");
  unmount();
  const reopened = openWithClockStopped({
    client: historyRefusedAfter(reader, TWO_A_PAGE),
    hash: "#/inbox",
    pageSize: TWO_A_PAGE,
  });
  fireEvent.click(await inPane().findByRole("button", { name: "Show earlier" }));
  const more = await alertSaying("Couldn't load more (");

  expect([first.textContent, more.textContent]).toStrictEqual([
    expect.stringMatching(/^Couldn't load what you've read \(token_missing\): /u),
    expect.stringMatching(/^Couldn't load more \(token_missing\): /u),
  ]);

  reopened();
});

it("with nothing in it, the inbox says it is all caught up and nothing is read yet", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { reader } = await subscribedReader("web-inbox-empty");
  const unmount = openWithClockStopped({ client: reader, hash: "#/inbox" });

  await screen.findByText("Nothing read yet.");

  expect(screen.getByText("You're all caught up.")).toBeDefined();
  expect(screen.queryByRole("list", { name: "Activity" })).toBeNull();

  unmount();
});

it("an item read in another session after the inbox loaded stays in Activity, not Earlier, until it hears so", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-inbox-read-elsewhere";
  const unmount = openWithClockStopped({ client: await readElsewhere(channel), hash: "#/inbox" });
  await screen.findByText("Nothing read yet.");
  await inPane().findByRole("link", { name: testAgentDisplayName(`${channel}-poster`) });

  expect(rowsOf("Activity")).toStrictEqual([postedRow(channel, "One")]);

  unmount();
});
