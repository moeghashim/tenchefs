import { expect, it } from "vitest";
import type { Message } from "../../sdk/index.ts";
import { adminClient } from "./identities.ts";
import { inThread } from "./regions.ts";
import { openAt } from "./render.tsx";
import { screen } from "@testing-library/react";

async function threadIn(channel: string): Promise<Message> {
  const admin = adminClient();
  await admin.createChannel({ name: channel });
  const { message } = await admin.createMessage({ channel, text: "The parent on its own" });
  return message;
}

function threadHash(parent: Message): string {
  return `#/channels/${parent.channel}/threads/${String(parent.id)}`;
}

function firstHeaderLink(): string | null {
  const link = inThread().element().querySelector("header a[href]");
  if (link === null) {
    return null;
  }
  return link.getAttribute("aria-label");
}

it("the thread panel's header links to the thread on its own after its close link, which Escape follows", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const parent = await threadIn("web-thread-alone-link");
  const close = openAt({ client: adminClient(), hash: threadHash(parent) });
  const link = await inThread().findByRole("link", { name: "Open thread on its own" });
  const shown = [
    link.getAttribute("href"),
    screen.queryByRole("heading", { level: 1, name: `#${parent.channel}` }) === null,
    screen.queryByRole("separator", { name: "Resize the thread panel" }) === null,
    firstHeaderLink(),
  ];
  close();

  expect(shown).toStrictEqual([`${threadHash(parent)}/alone`, false, false, "Close panel"]);
});

it("the thread on its own hides the channel and the panel's edge, and its first header link, which Escape follows, goes back to the channel", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const parent = await threadIn("web-thread-alone-back");
  const close = openAt({ client: adminClient(), hash: `${threadHash(parent)}/alone` });
  await inThread().findByText("The parent on its own");
  const link = await inThread().findByRole("link", { name: "Back to channel" });
  const shown = [
    link.getAttribute("href"),
    screen.queryByRole("heading", { level: 1, name: `#${parent.channel}` }) === null,
    screen.queryByRole("separator", { name: "Resize the thread panel" }) === null,
    firstHeaderLink(),
  ];
  close();

  expect(shown).toStrictEqual([threadHash(parent), true, true, "Back to channel"]);
});
