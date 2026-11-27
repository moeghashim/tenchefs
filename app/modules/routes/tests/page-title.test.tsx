import { alertRaised, inboxCounts, inboxOfOwnerWithWatchingAgent } from "./owned-agent.ts";
import { anonymousClient, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { openAt } from "./render.tsx";
import { subscribedReader } from "./inbox-reader.ts";

async function titleAt(hash: string): Promise<string> {
  globalThis.location.hash = hash;
  globalThis.dispatchEvent(new HashChangeEvent("hashchange"));
  const before = globalThis.document.title;
  await waitFor(() => {
    expect(globalThis.document.title).not.toBe(before);
  });
  return globalThis.document.title;
}

async function titlesAt(hashes: readonly string[]): Promise<readonly string[]> {
  const [first = "", ...rest] = hashes;
  if (first === "") {
    return [];
  }
  const title = await titleAt(first);
  return [title, ...(await titlesAt(rest))];
}

async function loggedOutTitle(): Promise<string> {
  const close = openAt({ client: anonymousClient(), hash: "#/channels/general" });
  await screen.findByRole("form", { name: "Log in" });
  const { title } = globalThis.document;
  close();
  return title;
}

async function shownTitle(title: string): Promise<string> {
  await waitFor(() => {
    expect(globalThis.document.title).toBe(title);
  });
  return globalThis.document.title;
}

it("the page's title follows the route", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const { poster, reader } = await subscribedReader("web-title");
  const { message } = await poster.createMessage({ channel: "web-title", text: "Deploy at noon?" });
  const close = openAt({ client: reader, hash: "#/inbox" });
  const inbox = await shownTitle("Inbox · cookout");
  const others = await titlesAt([
    "#/channels/web-title",
    `#/channels/web-title/threads/${String(message.id)}`,
    "#/people",
    "#/people/web-title-poster",
    "#/settings",
    "#/login",
    "#/settings/nowhere",
  ]);

  expect([inbox, ...others]).toStrictEqual([
    "Inbox · cookout",
    "#web-title · cookout",
    "Thread in #web-title · cookout",
    "People · cookout",
    "@web-title-poster · cookout",
    "Settings · cookout",
    "Logged in · cookout",
    "Nothing here · cookout",
  ]);

  close();
});

it("the title leads with how many unread messages are for you", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const { poster, reader } = await subscribedReader("web-title-count");
  const { message } = await reader.createMessage({ channel: "web-title-count", text: "Deploy at noon?" });
  await poster.createMessage({ channel: "web-title-count", text: "@web-title-count-reader lunch?" });
  await poster.createMessage({ channel: "web-title-count", replyTo: message.id, text: "Noon works." });
  await poster.createMessage({ channel: "web-title-count", text: "No mention here." });
  const close = openAt({ client: reader, hash: "#/people" });

  await waitFor(() => {
    expect(globalThis.document.title).toBe("(2) People · cookout");
  });

  close();
});

it("the title counts an offline alert for you, as the sidebar's Inbox badge does", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const open = await inboxOfOwnerWithWatchingAgent({ owner: "web-title-alert" });
  await alertRaised(open);
  const title = await shownTitle("(1) Inbox · cookout");

  expect([title, inboxCounts()]).toStrictEqual(["(1) Inbox · cookout", ["1 for you"]]);

  await open.close();
});

it("logged out, and on an approval page, the title says what the page is for", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const loggedOut = await loggedOutTitle();
  const { client } = await newIdentity({ kind: "human", name: "web-title-approver" });
  const close = openAt({ client, hash: "#/approve/ABCD-EFGH" });
  const approving = await shownTitle("Approve a device · cookout");

  expect([loggedOut, approving]).toStrictEqual(["Log in · cookout", "Approve a device · cookout"]);

  close();
});
