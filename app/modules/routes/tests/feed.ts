import type { CookoutClient, MessageId } from "../../sdk/index.ts";
import { adminClient, newIdentity } from "./identities.ts";
import { screen, within } from "@testing-library/react";
import { answering } from "./answering.ts";
import { openAt } from "./render.tsx";

const FOLD = /^(?:\d+ closed threads?|\d+ more)$/u;

interface Posted {
  readonly channel: string;
  readonly poster: CookoutClient;
  readonly reader: CookoutClient;
  readonly readerName: string;
  readonly ids: ReadonlyMap<string, MessageId>;
}

interface Posting {
  readonly channel: string;
  readonly texts: readonly string[];
  readonly closed: readonly string[];
}

interface Lookup {
  readonly posted: Posted;
  readonly text: string;
}

function idOf({ posted, text }: Lookup): MessageId {
  const id = posted.ids.get(text);
  if (typeof id !== "number") {
    throw new TypeError(`Nothing posted says ${text}`);
  }
  return id;
}

interface Poster {
  readonly poster: CookoutClient;
  readonly channel: string;
}

async function postedAll(
  { channel, poster }: Poster,
  texts: readonly string[],
): Promise<readonly (readonly [string, MessageId])[]> {
  const [text, ...rest] = texts;
  if (typeof text !== "string") {
    return [];
  }
  const { message } = await poster.createMessage({ channel, text });
  const later = await postedAll({ channel, poster }, rest);
  return [[text, message.id], ...later];
}

async function postedIn(posting: Posting): Promise<Posted> {
  const { channel } = posting;
  const poster = await newIdentity({ kind: "human", name: `${channel}-ada` });
  const readerName = `${channel}-grace`;
  const reader = await newIdentity({ kind: "human", name: readerName });
  await adminClient().createChannel({ name: channel });
  await reader.client.subscribe(channel);
  const ids = new Map(await postedAll({ channel, poster: poster.client }, posting.texts));
  const posted = { channel, ids, poster: poster.client, reader: reader.client, readerName };
  await Promise.all(
    posting.closed.map(async (text) => {
      await poster.client.closeThread(idOf({ posted, text }));
    }),
  );
  return posted;
}

function shownIn(item: () => HTMLElement, texts: readonly string[]): string {
  const fold = within(item()).queryByRole("button", { name: FOLD });
  if (fold !== null) {
    return `<${fold.textContent}>`;
  }
  const text = item().textContent;
  return texts.find((each) => text.includes(each)) ?? text;
}

async function feedOf(texts: readonly string[]): Promise<readonly string[]> {
  const list = await screen.findByRole("feed", { name: "Messages" });
  const shown: string[] = [];
  for (const item of within(list).queryAllByRole("article")) {
    shown.push(shownIn(() => item, texts));
  }
  return shown;
}

interface FeedOpening {
  readonly hash: string;
  readonly pageSize?: number;
  readonly reader: CookoutClient;
}

interface OpenedFeed {
  readonly close: () => void;
  readonly pageRead: () => Promise<void>;
}

async function feedOpened({ hash, pageSize, reader }: FeedOpening): Promise<OpenedFeed> {
  const { answered, client } = answering(reader);
  const close = openAt({ client, hash, ...(typeof pageSize === "number" && { pageSize }) });
  async function pageRead(): Promise<void> {
    await answered("listMessages");
  }
  await pageRead();
  return { close, pageRead };
}

export { type Posted, feedOf, feedOpened, idOf, postedIn };
