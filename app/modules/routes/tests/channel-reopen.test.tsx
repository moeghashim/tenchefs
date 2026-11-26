import type { CookoutClient, InboxResponse } from "../../sdk/index.ts";
import { adminClient, newIdentity, revocableView } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { alertSaying } from "./alerts.ts";
import { inPane } from "./regions.ts";
import { messagesIn } from "./messages.ts";
import { openAt } from "./render.tsx";

const ONE_A_PAGE = 1;
const NONE = 0;
const FIRST = 0;
const REST = 1;

async function post(channel: string, text: string): Promise<void> {
  await adminClient().createMessage({ channel, text });
}

async function postInOrder(channel: string, texts: readonly string[]): Promise<void> {
  if (texts.length === NONE) {
    return;
  }
  await Promise.all(
    texts.slice(FIRST, REST).map(async (text) => {
      await post(channel, text);
    }),
  );
  await postInOrder(channel, texts.slice(REST));
}

async function channelWith(name: string, texts: readonly string[]): Promise<void> {
  await adminClient().createChannel({ name });
  await postInOrder(name, texts);
}

async function shownMessages(): Promise<readonly string[]> {
  const shown = await messagesIn("Messages");
  return shown;
}

async function inboxEmptied(client: CookoutClient): Promise<InboxResponse> {
  const inbox = await waitFor(async () => {
    const answer = await client.inbox();

    expect(answer.items).toHaveLength(NONE);

    return answer;
  });
  return inbox;
}

async function nothingHere(): Promise<void> {
  await screen.findByRole("heading", { level: 1, name: "Nothing here" });
}

async function leaveForTheList(): Promise<void> {
  globalThis.location.hash = "#/";
  await screen.findByRole("list", { name: "Channels" });
}

async function bothPagesLoaded(): Promise<void> {
  await shownMessages();
  fireEvent.click(inPane().getByRole("button", { name: "Load older messages" }));
  await screen.findByText("A");
}

async function openedThenLeft(
  client: CookoutClient,
  channel: string,
  settled: () => Promise<unknown>,
): Promise<() => void> {
  const close = openAt({ client, hash: `#/channels/${channel}` });
  await settled();
  await leaveForTheList();
  return close;
}

it("reopening a channel shows what was posted while it was closed, keeping the older pages loaded", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await channelWith("web-channel-reopen", ["A", "B"]);
  const close = openAt({ client: adminClient(), hash: "#/channels/web-channel-reopen", pageSize: ONE_A_PAGE });
  await bothPagesLoaded();
  await leaveForTheList();
  await post("web-channel-reopen", "C");

  globalThis.location.hash = "#/channels/web-channel-reopen";
  await screen.findByText("C");

  expect([await shownMessages(), inPane().queryByRole("button", { name: "Load older messages" })]).toStrictEqual([
    ["adminA", "B", "C"],
    null,
  ]);

  close();
});

it("reopening a channel that can no longer be read says so and keeps its messages shown", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await channelWith("web-channel-reopen-refused", ["Hello"]);
  const reader = await revocableView({
    methods: ["ack"],
    revoked: "web-channel-reopen-rotated",
    viewer: "web-channel-reopen-viewer",
  });
  const close = await openedThenLeft(reader.client, "web-channel-reopen-refused", shownMessages);
  await reader.rotateToken();

  globalThis.location.hash = "#/channels/web-channel-reopen-refused";
  const alert = await alertSaying("Couldn't mark the channel read");

  expect([alert.textContent, await shownMessages()]).toStrictEqual([
    expect.stringMatching(/^Couldn't mark the channel read \(token_revoked\)/u),
    ["adminHello"],
  ]);

  close();
});

it("reopening a channel that failed to load loads it again and acks it", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const reader = await newIdentity({ kind: "human", name: "web-channel-reopen-missing-reader" });
  const close = await openedThenLeft(reader.client, "web-channel-reopen-missing", nothingHere);
  await adminClient().createChannel({ name: "web-channel-reopen-missing" });
  await reader.client.subscribe("web-channel-reopen-missing");
  await post("web-channel-reopen-missing", "Here now");

  globalThis.location.hash = "#/channels/web-channel-reopen-missing";

  await expect(Promise.all([shownMessages(), inboxEmptied(reader.client)])).resolves.toStrictEqual([
    ["adminHere now"],
    expect.objectContaining({ items: [] }),
  ]);

  close();
});
