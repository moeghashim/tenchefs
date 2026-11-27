import { adminClient, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { EventStream } from "../../sdk/index.ts";
import { boardStoreFor } from "./defaults.ts";
import { inPane } from "./regions.ts";
import { openAt } from "./render.tsx";
import { testAgentDisplayName } from "../../testing/index.ts";
import { type } from "./webhook-commands.ts";
import { watched } from "./watched.ts";

type BoardStore = ReturnType<typeof boardStoreFor>;

interface OpenLive {
  readonly boardStore: BoardStore;
  readonly close: () => Promise<void>;
}

async function openBoardAs(reader: string, hash: string): Promise<OpenLive> {
  const { client } = await newIdentity({ kind: "human", name: reader });
  const { live, stream } = watched(client);
  const boardStore = boardStoreFor({ client, live });
  const unmount = openAt({ boardStore, client, hash, live });
  const events: EventStream = await stream;
  return {
    boardStore,
    close: async () => {
      unmount();
      await events.close();
    },
  };
}

async function openLiveAs(reader: string, hash: string): Promise<() => Promise<void>> {
  const { close } = await openBoardAs(reader, hash);
  return close;
}

async function heardDeleted(boardStore: BoardStore, name: string): Promise<void> {
  await waitFor(() => {
    expect([...boardStore.snapshot().identities.deleted]).toContain(name);
  });
}

async function deletedAndHeard(boardStore: BoardStore, name: string): Promise<void> {
  await adminClient().deleteIdentity(name);
  await heardDeleted(boardStore, name);
}

async function deletedElsewhere(name: string): Promise<HTMLElement> {
  await adminClient().deleteIdentity(name);
  const notice = await screen.findByRole("status", { name: "" });
  return notice;
}

async function leftPeople(name: string): Promise<void> {
  await waitFor(() => {
    expect(inPane().queryByRole("link", { name: new RegExp(name, "u") })).toBeNull();
  });
}

async function mentioning(text: string): Promise<void> {
  await screen.findByLabelText("Message");
  type(text);
  await screen.findByRole("listbox", { name: "Mention suggestions" });
}

function mentionNames(): readonly (string | null)[] {
  const list = screen.queryByRole("listbox", { name: "Mention suggestions" });
  const shown: (string | null)[] = [];
  for (const item of within(list ?? document.createElement("ul")).queryAllByRole("option")) {
    shown.push(item.textContent);
  }
  return shown;
}

it("an identity deleted elsewhere closes its open profile page with a notice and leaves People", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await newIdentity({ kind: "agent", name: "web-live-gone-bot" });
  const close = await openLiveAs("web-live-gone-reader", "#/people/web-live-gone-bot");
  await inPane().findByRole("link", { name: `${testAgentDisplayName("web-live-gone-bot")}, Offline` });
  const notice = await deletedElsewhere("web-live-gone-bot");

  expect([notice.textContent, globalThis.location.hash]).toStrictEqual([
    "@web-live-gone-bot was deleted, so its profile closed.Dismiss",
    "#/people",
  ]);

  await leftPeople("web-live-gone-bot");
  fireEvent.click(within(notice).getByRole("button", { name: "Dismiss" }));

  expect(screen.queryByText(/was deleted, so its profile closed/u)).toBeNull();

  await close();
});

it("an identity deleted elsewhere closes its profile panel beside a channel and leaves the @ suggestions", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await newIdentity({ kind: "agent", name: "web-live-gone-panel-bot" });
  await adminClient().createChannel({ name: "web-live-gone-panel" });
  const close = await openLiveAs(
    "web-live-gone-panel-reader",
    "#/channels/web-live-gone-panel?profile=web-live-gone-panel-bot",
  );
  await mentioning("@web-live-gone-panel-b");
  const notice = await deletedElsewhere("web-live-gone-panel-bot");

  expect([notice.textContent, globalThis.location.hash]).toStrictEqual([
    "@web-live-gone-panel-bot was deleted, so its profile closed.Dismiss",
    "#/channels/web-live-gone-panel",
  ]);

  await waitFor(() => {
    expect(mentionNames()).toStrictEqual([]);
  });

  await close();
});

it("an identity deleted elsewhere shows no notice on a page not open on its profile", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await newIdentity({ kind: "agent", name: "web-live-gone-other-bot" });
  const { boardStore, close } = await openBoardAs("web-live-gone-other-reader", "#/people");
  await inPane().findByRole("link", { name: `${testAgentDisplayName("web-live-gone-other-bot")}, Offline` });
  await adminClient().deleteIdentity("web-live-gone-other-bot");
  await leftPeople("web-live-gone-other-bot");
  await heardDeleted(boardStore, "web-live-gone-other-bot");

  expect([screen.queryByText(/was deleted/u), globalThis.location.hash]).toStrictEqual([null, "#/people"]);

  await close();
});

it("a profile opened again after its identity was deleted stays open when another identity is deleted", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await newIdentity({ kind: "agent", name: "web-live-gone-again-bot" });
  const { boardStore, close } = await openBoardAs("web-live-gone-again-reader", "#/people");
  await deletedAndHeard(boardStore, "web-live-gone-again-bot");
  globalThis.location.hash = "#/people/web-live-gone-again-bot";
  await newIdentity({ kind: "agent", name: "web-live-gone-later-bot" });
  await deletedAndHeard(boardStore, "web-live-gone-later-bot");

  expect([screen.queryByText(/was deleted/u), globalThis.location.hash]).toStrictEqual([
    null,
    "#/people/web-live-gone-again-bot",
  ]);

  await close();
});
