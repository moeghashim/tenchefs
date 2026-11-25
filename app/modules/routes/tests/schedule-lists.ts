import type { CookoutClient, ScheduledMessage } from "../../sdk/index.ts";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { adminClient } from "./identities.ts";
import { chose } from "./menus.ts";
import { inSidebar } from "./regions.ts";
import { openAt } from "./render.tsx";

export const LIST = "Scheduled messages";

export interface Making {
  readonly by: CookoutClient;
  readonly channel: string;
  readonly text: string;
  readonly cron?: string;
}

export async function made({ by, channel, cron = "0 9 * * *", text }: Making): Promise<ScheduledMessage> {
  const { scheduledMessage } = await by.createScheduledMessage({ channel, cron, text, timeZone: "UTC" });
  return scheduledMessage;
}

export async function channelMade(channel: string): Promise<void> {
  await adminClient().createChannel({ name: channel });
}

export function listDialog(): HTMLElement {
  return screen.getByRole("dialog", { name: LIST });
}

export interface Opening {
  readonly client: CookoutClient;
  readonly channel: string;
}

export async function listOpened({ channel, client }: Opening): Promise<() => void> {
  const close = openAt({ client, hash: `#/channels/${channel}` });
  const link = await inSidebar().findByRole("link", { name: new RegExp(`^#${channel}(?!-)`, "u") });
  fireEvent.contextMenu(link);
  await chose(LIST);
  await screen.findByRole("dialog", { name: LIST });
  return close;
}

export async function rowOf(text: string): Promise<HTMLElement> {
  const paragraph = await waitFor(() => within(listDialog()).getByText(text, { selector: "p" }));
  const row = paragraph.closest("li");
  if (row === null) {
    throw new TypeError(`${text} isn't in a row`);
  }
  return row;
}

export async function linesOf(text: string): Promise<readonly (string | null)[]> {
  const row = await rowOf(text);
  const lines: (string | null)[] = [];
  for (const line of row.querySelectorAll("p, span")) {
    lines.push(line.textContent);
  }
  return lines;
}

export async function buttonsOf(text: string): Promise<readonly string[]> {
  const row = await rowOf(text);
  const names: string[] = [];
  for (const button of within(row).queryAllByRole("button")) {
    names.push(button.textContent);
  }
  return names;
}

export interface Pressing {
  readonly text: string;
  readonly button: string;
}

export async function pressedIn({ button, text }: Pressing): Promise<void> {
  const row = await rowOf(text);
  fireEvent.click(within(row).getByRole("button", { name: button }));
}
