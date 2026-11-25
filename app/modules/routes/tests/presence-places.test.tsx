import { adminClient, clientWith, newIdentity } from "./identities.ts";
import { agentNamed, offline, online, readerOn, suggestionDot } from "./presence.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Live } from "../../testing/web.ts";
import { inProfile } from "./regions.ts";
import { openAt } from "./render.tsx";
import { scriptedLive } from "../../testing/web.ts";
import { testAgentDisplayName } from "../../testing/index.ts";

it("the @-suggestions show each identity's dot", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const watching = await agentNamed("web-presence-suggest-on");
  await agentNamed("web-presence-suggest-off");
  await watching.watch();
  await adminClient().createChannel({ name: "web-presence-suggest" });
  await readerOn({ hash: "#/channels/web-presence-suggest", reader: "web-presence-suggest-reader" });

  fireEvent.change(await screen.findByLabelText("Message"), { target: { value: "Hi @web-presence-suggest-o" } });

  await expect(
    Promise.all([
      suggestionDot({ label: "Online", who: "web-presence-suggest-on" }),
      suggestionDot({ label: "Offline", who: "web-presence-suggest-off" }),
    ]),
  ).resolves.toStrictEqual([online(), offline()]);
});

it("an @-suggestion for an identity with a display name reads the display name, then the handle, then the presence", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await newIdentity({ displayName: "Grace Hopper", kind: "human", name: "web-presence-suggest-grace" });
  await adminClient().createChannel({ name: "web-presence-suggest-named" });
  await readerOn({ hash: "#/channels/web-presence-suggest-named", reader: "web-presence-suggest-named-reader" });

  fireEvent.change(await screen.findByLabelText("Message"), { target: { value: "Hi @web-presence-suggest-gr" } });
  const list = await screen.findByRole("listbox", { name: "Mention suggestions" });

  await expect(
    within(list).findByRole("option", { name: "Grace Hopper, @web-presence-suggest-grace, Offline" }),
  ).resolves.toBeDefined();
});

it("the logged-in human's own avatar in the sidebar shows them online while their tab watches", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await readerOn({ hash: "#/people", reader: "web-presence-own-reader" });
  const sidebar = screen.getByRole("navigation", { name: "Sidebar" });

  await expect(within(sidebar).findByRole("img", { name: "web-presence-own-reader, Online" })).resolves.toHaveProperty(
    "dataset.presence",
    "online",
  );
});

it("when the server refuses presence, the People rows show no dot", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await agentNamed("web-presence-refused-bot");
  const reader = await newIdentity({ kind: "human", name: "web-presence-refused-reader" });
  const asked: string[] = [];
  openAt({
    client: {
      ...reader.client,
      presence: async () => {
        asked.push("presence");
        const answer = await clientWith("cookout_not_a_token").presence();
        return answer;
      },
    },
    hash: "#/people",
  });
  await waitFor(() => {
    expect(asked).toStrictEqual(["presence"]);
  });
  const rows = await screen.findByRole("list", { name: "Identities" });
  const row = await within(rows).findByRole("link", {
    name: new RegExp(testAgentDisplayName("web-presence-refused-bot"), "u"),
  });

  expect(within(row).queryByRole("img")).toBeNull();
});

type Sent = Readonly<Record<string, unknown>>;

interface Sending {
  readonly live: Live;
  readonly send: (presence: Sent) => void;
}

const TAB_BOT = "web-presence-tab-bot";

function sending(): Sending {
  const { live, send } = scriptedLive();
  return {
    live,
    send: (presence) => {
      send({ data: JSON.stringify({ presence, type: "presence" }), event: "presence" });
    },
  };
}

async function detailAfter(send: Sending["send"], presence: Sent, text: string): Promise<string> {
  send({ identity: TAB_BOT, ...presence });
  const shown = await inProfile().findByText(text);
  return shown.textContent;
}

it("a profile says an identity is online in a web tab, or only that it is online when how is not known", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const reader = await newIdentity({ kind: "human", name: "web-presence-tab-reader" });
  await agentNamed(TAB_BOT);
  const { live, send } = sending();
  openAt({ client: reader.client, hash: `#/people/${TAB_BOT}`, live });
  await inProfile().findByRole("heading", { level: 3 });
  const inTab = await detailAfter(send, { connection: { via: "web" }, online: true }, "Online · web");
  const unknown = await detailAfter(send, { online: true }, "Online");

  expect([inTab, unknown]).toStrictEqual(["Online · web", "Online"]);
});
