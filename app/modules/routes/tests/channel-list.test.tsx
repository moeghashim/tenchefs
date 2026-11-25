import type { CookoutClient, CreateChannelRequest, ListChannelsResponse } from "../../sdk/index.ts";
import { adminClient, clientWith, sessionOf } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { openAt, openBoard } from "./render.tsx";
import { createBoardStore } from "../../board/index.ts";
import { inSidebar } from "./regions.ts";
import { unreachableClient } from "../../testing/index.ts";
import { watched } from "./watched.ts";
import { webTestCookout } from "../../../../scripts/web-test-server.ts";

async function adminWithChannels(...channels: readonly CreateChannelRequest[]): Promise<CookoutClient> {
  const client = adminClient();
  await Promise.all(
    channels.map(async (channel) => {
      const created = await client.createChannel(channel);
      return created;
    }),
  );
  return client;
}

interface Counted {
  readonly calls: readonly string[];
  readonly client: CookoutClient;
}

async function shownHrefs(): Promise<readonly (string | null)[]> {
  const list = await screen.findByRole("list", { name: "Channels" });
  const hrefs: (string | null)[] = [];
  for (const link of within(list).getAllByRole("link")) {
    hrefs.push(link.getAttribute("href"));
  }
  return hrefs;
}

interface Answering {
  readonly answered: Promise<ListChannelsResponse>;
  readonly client: CookoutClient;
}

function answering(client: CookoutClient): Answering {
  const { promise, resolve } = Promise.withResolvers<ListChannelsResponse>();
  return {
    answered: promise,
    client: {
      ...client,
      listChannels: async (): Promise<ListChannelsResponse> => {
        const answer = await client.listChannels();
        resolve(answer);
        return answer;
      },
    },
  };
}

function counting(client: CookoutClient): Counted {
  const calls: string[] = [];
  return {
    calls,
    client: {
      ...client,
      listChannels: async (): Promise<ListChannelsResponse> => {
        calls.push("listChannels");
        const answer = await client.listChannels();
        return answer;
      },
    },
  };
}

async function openLive(client: CookoutClient, shown: string): Promise<() => Promise<void>> {
  const { live, stream } = watched(client);
  const unmount = openAt({ client, hash: "#/", live });
  await inSidebar().findByRole("link", { name: shown });
  const events = await stream;
  return async () => {
    unmount();
    await events.close();
  };
}

function shownLink(name: string): readonly (string | null)[] {
  const link = inSidebar().getByRole("link", { name });
  return [link.textContent, link.getAttribute("href")];
}

it("the sidebar lists the channels the server has, each linking to its channel", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { answered, client } = answering(
    await adminWithChannels({ name: "web-list-general" }, { name: "web-list-deploys" }),
  );
  const close = openAt({ client, hash: "" });

  const hrefs = await shownHrefs();

  const { channels } = await answered;

  expect(hrefs).toStrictEqual(expect.arrayContaining(channels.map((channel) => `#/channels/${channel.name}`)));
  expect(shownLink("#web-list-general")).toStrictEqual(["#web-list-general", "#/channels/web-list-general"]);
  expect(shownLink("#web-list-deploys")).toStrictEqual(["#web-list-deploys", "#/channels/web-list-deploys"]);

  close();
});

it("a channel's pane is headed by its name and its description", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const client = await adminWithChannels({ description: "Where the web lists channels.", name: "web-list-described" });
  const close = openAt({ client, hash: "#/channels/web-list-described" });

  const description = await screen.findByText("Where the web lists channels.");

  expect([screen.getByRole("heading", { level: 1 }).textContent, description.tagName]).toStrictEqual([
    "#web-list-described",
    "P",
  ]);

  close();
});

it("a deleted channel is gone from the channel list on the next load", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const client = await adminWithChannels({ name: "web-list-kept" }, { name: "web-list-deleted" });
  await client.deleteChannel("web-list-deleted");
  const close = openAt({ client, hash: "#/" });

  const hrefs = await shownHrefs();

  expect([hrefs.includes("#/channels/web-list-kept"), hrefs.includes("#/channels/web-list-deleted")]).toStrictEqual([
    true,
    false,
  ]);

  close();
});

it("following a channel's link opens that channel's route", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = openAt({ client: await adminWithChannels({ name: "web-link-target" }), hash: "#/" });

  fireEvent.click(await inSidebar().findByRole("link", { name: "#web-link-target" }));
  const heading = await screen.findByRole("heading", { level: 1, name: "#web-link-target" });

  expect([globalThis.location.hash, heading.textContent]).toStrictEqual([
    "#/channels/web-link-target",
    "#web-link-target",
  ]);

  close();
});

it("coming back to the channel list shows the channels already loaded, without asking the server again", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const client = await adminWithChannels({ name: "web-loaded-once" });
  const counted = counting(client);
  const opening = {
    boardStore: createBoardStore({ client: counted.client, live: null, url: webTestCookout().url }),
    hash: "#/",
    session: sessionOf(client),
  };
  const closeFirst = openBoard(opening);
  await inSidebar().findByRole("link", { name: "#web-loaded-once" });
  closeFirst();

  const close = openBoard(opening);

  expect([shownLink("#web-loaded-once"), counted.calls]).toStrictEqual([
    ["#web-loaded-once", "#/channels/web-loaded-once"],
    ["listChannels"],
  ]);

  close();
});

it("the sidebar's channel list shows the server's refusal when the token is refused", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = openAt({
    client: clientWith("cookout_not-a-real-token"),
    hash: "#/",
    session: sessionOf(adminClient()),
  });

  const alert = await within(await screen.findByRole("navigation", { name: "Sidebar" })).findByRole("alert");

  expect(alert.textContent).toContain("token_unknown");

  close();
});

it("a message in a channel created after the list loaded adds that channel to the list, without a reload", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const client = await adminWithChannels({ name: "web-list-live-known" });
  const close = await openLive(client, "#web-list-live-known");
  await client.createChannel({ name: "web-list-live-new" });
  await client.createMessage({ channel: "web-list-live-new", text: "Incident open" });

  const added = await inSidebar().findByRole("link", { name: "#web-list-live-new" });

  expect(added.getAttribute("href")).toBe("#/channels/web-list-live-new");

  await close();
});

it("the sidebar's channel list says so when the server can't be reached", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const client = unreachableClient({ token: "cookout_any" });
  const close = openAt({ client, hash: "#/", session: sessionOf(adminClient()) });

  const alert = await within(await screen.findByRole("navigation", { name: "Sidebar" })).findByRole("alert");

  expect(alert.textContent).toContain("unreachable");

  close();
});

it.each([
  { hash: "#/channels/general/threads/not-a-number", heading: "Nothing here" },
  { hash: "#/channels/Not_A_Channel", heading: "Nothing here" },
  { hash: "#/channels/Not_A_Channel/threads/1", heading: "Nothing here" },
  { hash: "#/no-such-page", heading: "Inbox" },
] as const)("$hash shows $heading", { timeout: 5000 }, async (route) => {
  expect.hasAssertions();

  const close = openAt({ client: adminClient(), hash: route.hash });

  const heading = await screen.findByRole("heading", { level: 1, name: route.heading });

  expect(heading.textContent).toBe(route.heading);

  close();
});
