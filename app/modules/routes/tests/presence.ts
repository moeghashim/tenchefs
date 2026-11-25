import type { CookoutClient, EventStream } from "../../sdk/index.ts";
import { screen, within } from "@testing-library/react";
import { newIdentity } from "./identities.ts";
import { onTestFinished } from "vitest";
import { openAt } from "./render.tsx";
import { testAgentDisplayName } from "../../testing/index.ts";
import { watched } from "./watched.ts";

interface Watcher {
  readonly client: CookoutClient;
  readonly watch: () => Promise<EventStream>;
}

interface Dot {
  readonly presence: string | undefined;
  readonly tooltip: string;
}

interface Opening {
  readonly client: CookoutClient;
  readonly hash: string;
}

interface Reading {
  readonly reader: string;
  readonly hash: string;
}

interface Named {
  readonly who: string;
  readonly label: string;
}

interface Looking extends Named {
  readonly at: string;
  readonly tooltip?: string;
}

async function dotWithin(region: (looking: Looking) => Promise<HTMLElement>, looking: Looking): Promise<Dot> {
  const found = await region(looking);
  const dot = await within(found).findByRole("img", { name: `${looking.who}, ${looking.label}` });
  return {
    presence: dot.dataset["presence"],
    tooltip: within(found).getByTitle(looking.tooltip ?? looking.label).title,
  };
}

async function articleWith({ at }: Looking): Promise<HTMLElement> {
  const messages = await screen.findByRole("feed", { name: "Messages" });
  const shown = await within(messages).findByText(at);
  return shown.closest("article") ?? messages;
}

async function rowNamed({ label, who }: Looking): Promise<HTMLElement> {
  const rows = await screen.findByRole("list", { name: "Identities" });
  const row = await within(rows).findByRole("link", {
    name: (shown) => [who, testAgentDisplayName(who)].some((each) => shown === `${each}, ${label}`),
  });
  return row;
}

async function suggestionNamed({ at, label, who }: Looking): Promise<HTMLElement> {
  const list = await screen.findByRole("listbox", { name: "Mention suggestions" });
  const named = new Set([`${who}, ${label}`, `${testAgentDisplayName(at)}, ${who}, ${label}`]);
  return within(list).getByRole("option", { name: (shown) => named.has(shown) });
}

async function openProfile(): Promise<HTMLElement> {
  const profile = await screen.findByRole("complementary", { name: "Profile" });
  return profile;
}

export async function agentNamed(name: string): Promise<Watcher> {
  const agent = await newIdentity({ kind: "agent", name, owner: "admin" });
  return {
    client: agent.client,
    watch: async () => {
      const events = await agent.client.watch();
      onTestFinished(events.close);
      return events;
    },
  };
}

export async function openedBy({ client, hash }: Opening): Promise<void> {
  const { live, stream } = watched(client);
  openAt({ client, hash, live });
  await stream;
}

export async function readerOn({ hash, reader }: Reading): Promise<void> {
  const { client } = await newIdentity({ kind: "human", name: reader });
  await openedBy({ client, hash });
}

export async function authorDot(looking: Looking): Promise<Dot> {
  const dot = await dotWithin(articleWith, looking);
  return dot;
}

export async function rowDot(named: Named): Promise<Dot> {
  const dot = await dotWithin(rowNamed, { ...named, at: named.who });
  return dot;
}

export async function suggestionDot({ label, who }: Named): Promise<Dot> {
  const dot = await dotWithin(suggestionNamed, { at: who, label, who: `@${who}` });
  return dot;
}

export async function profileDot(named: Named): Promise<Dot> {
  const dot = await dotWithin(openProfile, { ...named, at: named.who });
  return dot;
}

export function online(): Dot {
  return { presence: "online", tooltip: "Online" };
}

export function offline(tooltip = "Offline"): Dot {
  return { presence: "offline", tooltip };
}

export function warned(tooltip: string): Dot {
  return { presence: "warning", tooltip };
}
