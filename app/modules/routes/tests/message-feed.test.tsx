import { expect, it } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { adminClient } from "./identities.ts";
import { inPane } from "./regions.ts";
import { openWithClockStopped } from "./clock.ts";

const TWO_A_PAGE = 2;
const NONE = 0;
const LABEL = /^admin, \S/u;

interface Placed {
  readonly label: string;
  readonly position: string | null;
  readonly size: string | null;
  readonly tabIndex: number;
}

async function postInOrder(channel: string, texts: readonly string[]): Promise<void> {
  const [text, ...rest] = texts;
  if (typeof text !== "string") {
    return;
  }
  await adminClient().createMessage({ channel, text });
  if (rest.length > NONE) {
    await postInOrder(channel, rest);
  }
}

function placedIn(feed: () => HTMLElement): readonly Placed[] {
  const placed: Placed[] = [];
  for (const article of within(feed()).getAllByRole("article")) {
    placed.push({
      label: article.getAttribute("aria-label") ?? "",
      position: article.getAttribute("aria-posinset"),
      size: article.getAttribute("aria-setsize"),
      tabIndex: article.tabIndex,
    });
  }
  return placed;
}

interface Opened {
  readonly close: () => void;
  readonly feed: HTMLElement;
}

async function openedFeed(channel: string): Promise<Opened> {
  await adminClient().createChannel({ name: channel });
  await postInOrder(channel, ["One", "Two", "Three"]);
  const close = openWithClockStopped({ client: adminClient(), hash: `#/channels/${channel}`, pageSize: TWO_A_PAGE });
  const feed = await screen.findByRole("feed", { name: "Messages" });
  await within(feed).findByText("Three");
  return { close, feed };
}

it("a channel's messages are a feed of articles, each labelled by its author and time, with its place in the feed", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { close, feed } = await openedFeed("web-message-feed");
  const firstPage = placedIn(() => feed);

  fireEvent.click(inPane().getByRole("button", { name: "Load older messages" }));
  await within(feed).findByText("One");

  expect([firstPage.map(({ label }) => LABEL.test(label)), firstPage, placedIn(() => feed)]).toStrictEqual([
    [true, true],
    [
      expect.objectContaining({ position: "1", size: "-1", tabIndex: -1 }),
      expect.objectContaining({ position: "2", size: "-1", tabIndex: 0 }),
    ],
    [
      expect.objectContaining({ position: "1", size: "3", tabIndex: -1 }),
      expect.objectContaining({ position: "2", size: "3", tabIndex: -1 }),
      expect.objectContaining({ position: "3", size: "3", tabIndex: 0 }),
    ],
  ]);

  close();
});
