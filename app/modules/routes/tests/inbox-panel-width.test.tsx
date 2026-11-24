import { expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { inConversation, inPane } from "./regions.ts";
import type { CookoutClient } from "../../sdk/index.ts";
import { openWithClockStopped } from "./clock.ts";
import { subscribedReader } from "./inbox-reader.ts";

const EDGE = "Resize the thread panel";
const START_X = 900;
const WIDENED = 64;
const NARROWED = -96;

interface Row {
  readonly name: Readonly<RegExp>;
  readonly text: string;
}

interface Rows {
  readonly reader: CookoutClient;
  readonly channel: Row;
  readonly thread: Row;
}

async function inboxWithBothRows(channel: string): Promise<Rows> {
  const { poster, reader } = await subscribedReader(channel);
  const { message: parent } = await poster.createMessage({ channel, text: "Deploy at noon?" });
  await reader.follow(parent.id);
  await reader.ack(parent.id);
  await poster.createMessage({ channel, replyTo: parent.id, text: "Not yet" });
  await poster.createMessage({ channel, text: "Lunch?" });
  return {
    channel: { name: /Lunch\?/u, text: "Lunch?" },
    reader,
    thread: { name: /re: Deploy at noon\?/u, text: "Not yet" },
  };
}

async function openedRow(row: Row): Promise<number> {
  fireEvent.click(inPane().getByRole("link", { name: row.name }));
  await inConversation().findByText(row.text);
  const edge = await inConversation().findByRole("separator", { name: EDGE });
  return Number(edge.getAttribute("aria-valuenow"));
}

function dragged(by: number): number {
  const edge = screen.getByRole("separator", { name: EDGE });
  fireEvent.pointerDown(edge, { button: 0, clientX: START_X });
  fireEvent.pointerMove(globalThis.document, { clientX: START_X - by });
  fireEvent.pointerUp(globalThis.document, { clientX: START_X - by });
  return Number(screen.getByRole("separator", { name: EDGE }).getAttribute("aria-valuenow"));
}

async function draggedThenOpened(by: number, row: Row): Promise<readonly [number, number]> {
  const width = dragged(by);
  return [width, await openedRow(row)];
}

it("a channel row and a thread row in the Inbox open at one width, and dragging either one's edge resizes both", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const rows = await inboxWithBothRows("web-inbox-panel-width");
  const unmount = openWithClockStopped({ client: rows.reader, hash: "#/inbox" });
  await screen.findByRole("list", { name: "Activity" });
  const channelAtStart = await openedRow(rows.channel);
  const threadAtStart = await openedRow(rows.thread);
  const [widened, channelWidened] = await draggedThenOpened(WIDENED, rows.channel);
  const [narrowed, threadNarrowed] = await draggedThenOpened(NARROWED, rows.thread);
  unmount();

  expect([threadAtStart, widened - channelAtStart, channelWidened, threadNarrowed, narrowed - widened]).toStrictEqual([
    channelAtStart,
    WIDENED,
    widened,
    narrowed,
    NARROWED,
  ]);
});
