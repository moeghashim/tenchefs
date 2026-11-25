import type { CookoutClient, MessageId } from "../../sdk/index.ts";
import { adminClient, newIdentity } from "./identities.ts";
import { answeredUntil, answering } from "./answering.ts";
import { fireEvent, screen, within } from "@testing-library/react";
import type { Answering } from "./answering.ts";
import type { Live } from "../../testing/web.ts";
import { inSidebar } from "./regions.ts";
import { openAt } from "./render.tsx";
import { watched } from "./watched.ts";

const NONE = 0;

interface Board {
  readonly channel: string;
  readonly unreadTexts: () => Promise<readonly string[]>;
  readonly close: () => Promise<void>;
}

interface Posters {
  readonly poster: CookoutClient;
  readonly reader: CookoutClient;
}

async function inboxEmptied(client: CookoutClient, answered: Answering["answered"]): Promise<void> {
  await answeredUntil({
    answered,
    done: async () => {
      const inbox = await client.inbox();
      return inbox.items.length === NONE;
    },
    method: "ack",
  });
}

async function postersIn(channel: string): Promise<Posters> {
  const poster = await newIdentity({ kind: "human", name: `${channel}-ada` });
  const reader = await newIdentity({ kind: "human", name: `${channel}-grace` });
  await adminClient().createChannel({ name: channel });
  await reader.client.subscribe(channel);
  return { poster: poster.client, reader: reader.client };
}

async function postedThread({ poster, reader }: Posters, channel: string): Promise<MessageId> {
  const { message: parent } = await reader.createMessage({ channel, text: "Deploy?" });
  await poster.createMessage({ channel, replyTo: parent.id, text: "Noon works" });
  await poster.createMessage({ channel, replyTo: parent.id, text: "Or one" });
  await poster.createMessage({ channel, text: "First" });
  await poster.createMessage({ channel, text: "Second" });
  await poster.createMessage({ channel, text: "Third" });
  return parent.id;
}

async function unreadTextsOf(reader: CookoutClient): Promise<readonly string[]> {
  const inbox = await reader.inbox();
  return inbox.items.map((item) => item.message.text);
}

interface ThreadOpening {
  readonly hash: string;
  readonly live: Live;
  readonly reader: CookoutClient;
}

async function threadRead({ hash, live, reader }: ThreadOpening): Promise<() => void> {
  const { answered, client } = answering(reader);
  const unmount = openAt({ client, hash, live });
  await Promise.all([answered("listMessages"), answered("getThread")]);
  await Promise.all([screen.findByText("Or one"), screen.findByText("Third")]);
  await inboxEmptied(reader, answered);
  return unmount;
}

export async function boardOpen(channel: string): Promise<Board> {
  const posters = await postersIn(channel);
  const { reader } = posters;
  const parent = await postedThread(posters, channel);
  const { live, stream } = watched(reader);
  const unmount = await threadRead({ hash: `#/channels/${channel}/threads/${String(parent)}`, live, reader });
  const events = await stream;
  return {
    channel,
    close: async () => {
      unmount();
      await events.close();
    },
    unreadTexts: async () => {
      const texts = await unreadTextsOf(reader);
      return texts;
    },
  };
}

export function altClicked(element: () => HTMLElement): { readonly pressKeptItsDefault: boolean } {
  const pressKeptItsDefault = fireEvent.mouseDown(element(), { altKey: true });
  fireEvent.mouseUp(element(), { altKey: true });
  fireEvent.click(element(), { altKey: true });
  return { pressKeptItsDefault };
}

export function newAbove(label: string): string | null {
  const feed = screen.getByRole("feed", { name: label });
  for (const article of within(feed).queryAllByRole("article")) {
    const item = article.parentElement;
    if (item !== null && within(item).queryByRole("separator", { name: "New" }) !== null) {
      return article.textContent;
    }
  }
  return null;
}

export function countsOn(channel: string): readonly string[] {
  const link = inSidebar().getByRole("link", { name: new RegExp(`^#${channel}(?![a-z-])`, "u") });
  const counts: string[] = [];
  for (const count of within(link).queryAllByText(/^\d+ (?:unread|for you)$/u)) {
    counts.push(count.textContent);
  }
  return counts;
}
