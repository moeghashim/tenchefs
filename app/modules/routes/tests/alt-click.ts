import type { CookoutClient, MessageId } from "../../sdk/index.ts";
import { adminClient, newIdentity } from "./identities.ts";
import { fireEvent, screen, within } from "@testing-library/react";
import { inSidebar } from "./regions.ts";
import { openAt } from "./render.tsx";
import { vi } from "vitest";
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

async function inboxEmptied(client: CookoutClient): Promise<void> {
  await vi.waitUntil(async () => {
    const inbox = await client.inbox();
    return inbox.items.length === NONE;
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

export async function boardOpen(channel: string): Promise<Board> {
  const posters = await postersIn(channel);
  const { reader } = posters;
  const parent = await postedThread(posters, channel);
  const { live, stream } = watched(reader);
  const unmount = openAt({ client: reader, hash: `#/channels/${channel}/threads/${String(parent)}`, live });
  await Promise.all([screen.findByText("Or one"), screen.findByText("Third")]);
  await inboxEmptied(reader);
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
  const list = screen.getByRole("list", { name: label });
  for (const item of within(list).queryAllByRole("listitem")) {
    if (within(item).queryByRole("separator", { name: "New" }) !== null) {
      return within(item).getByRole("article").textContent;
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
