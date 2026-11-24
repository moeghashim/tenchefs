import type { CookoutClient, Message } from "../../sdk/index.ts";
import { adminClient, newIdentity } from "./identities.ts";
import { alertSaying, alertsShown } from "./alerts.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { openAt } from "./render.tsx";
import { watched } from "./watched.ts";

interface Talk {
  readonly ann: CookoutClient;
  readonly bob: CookoutClient;
  readonly message: Message;
}

interface ChipShown {
  readonly name: string;
  readonly pressed: boolean;
  readonly tooltip: string | null;
}

async function talkIn(channel: string): Promise<Talk> {
  const ann = await newIdentity({ kind: "human", name: `${channel}-ann` });
  const bob = await newIdentity({ kind: "human", name: `${channel}-bob` });
  await adminClient().createChannel({ name: channel });
  const { message } = await ann.client.createMessage({ channel, text: "Ship it?" });
  return { ann: ann.client, bob: bob.client, message };
}

function messageArticle(): HTMLElement {
  return within(screen.getByRole("list", { name: "Messages" })).getByRole("article");
}

function chipsShown(): readonly ChipShown[] {
  const shown: ChipShown[] = [];
  for (const chip of within(messageArticle()).queryAllByRole("button", { name: /^[👍👎] \d+$/u })) {
    shown.push({
      name: chip.textContent,
      pressed: chip.getAttribute("aria-pressed") === "true",
      tooltip: chip.getAttribute("title"),
    });
  }
  return shown;
}

async function chipsBecome(expected: readonly ChipShown[]): Promise<void> {
  await waitFor(() => {
    expect(chipsShown()).toStrictEqual(expected);
  });
}

function reactWith(article: () => HTMLElement, symbol: string): void {
  fireEvent.click(within(article()).getByRole("button", { name: `React with ${symbol}` }));
}

async function openedAs(client: CookoutClient, channel: string): Promise<void> {
  openAt({ client, hash: `#/channels/${channel}` });
  await screen.findByText("Ship it?");
}

it("clicking 👍 in a message's hover actions shows a 👍 1 chip, highlighted as yours, naming you", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-react-hover";
  const { bob } = await talkIn(channel);
  await openedAs(bob, channel);
  fireEvent.click(within(messageArticle()).getByRole("button", { name: "React with 👍" }));

  await chipsBecome([{ name: "👍 1", pressed: true, tooltip: `${channel}-bob` }]);
});

it("clicking your own chip again removes your reaction, and the server forgets it", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const channel = "web-react-toggle";
  const { bob, message } = await talkIn(channel);
  await bob.react(message.id, "thumbs_up");
  await openedAs(bob, channel);
  await chipsBecome([{ name: "👍 1", pressed: true, tooltip: `${channel}-bob` }]);
  fireEvent.click(within(messageArticle()).getByRole("button", { name: "👍 1" }));
  await chipsBecome([]);
  const { messages } = await bob.listMessages(channel);

  expect(messages.map((shown) => "reactions" in shown)).toStrictEqual([false]);
});

it("a chip counts everyone's reaction, and clicking one that isn't yours adds yours", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const channel = "web-react-join";
  const { ann, bob, message } = await talkIn(channel);
  await ann.react(message.id, "thumbs_down");
  await openedAs(bob, channel);
  await chipsBecome([{ name: "👎 1", pressed: false, tooltip: `${channel}-ann` }]);
  fireEvent.click(within(messageArticle()).getByRole("button", { name: "👎 1" }));

  await chipsBecome([{ name: "👎 2", pressed: true, tooltip: `${channel}-ann, ${channel}-bob` }]);
});

it("the message menu, opened by right-clicking, offers 👍 and 👎", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const channel = "web-react-menu";
  const { bob } = await talkIn(channel);
  await openedAs(bob, channel);
  fireEvent.contextMenu(screen.getByText("Ship it?"));
  fireEvent.click(await screen.findByRole("menuitem", { name: "React with 👎" }));

  await chipsBecome([{ name: "👎 1", pressed: true, tooltip: `${channel}-bob` }]);

  expect(screen.queryByRole("menu")).toBeNull();
});

it("pressing + on a focused message reacts 👍 and - reacts 👎, and other keys or Ctrl with them don't", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-react-keys";
  const { bob } = await talkIn(channel);
  await openedAs(bob, channel);
  fireEvent.keyDown(messageArticle(), { key: "a" });
  fireEvent.keyDown(messageArticle(), { key: "+" });
  await chipsBecome([{ name: "👍 1", pressed: true, tooltip: `${channel}-bob` }]);
  fireEvent.keyDown(messageArticle(), { ctrlKey: true, key: "-" });
  fireEvent.keyDown(messageArticle(), { key: "-" });

  await chipsBecome([
    { name: "👍 1", pressed: true, tooltip: `${channel}-bob` },
    { name: "👎 1", pressed: true, tooltip: `${channel}-bob` },
  ]);
});

it("a reaction left in another tab shows at once", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const channel = "web-react-live";
  const { ann, bob, message } = await talkIn(channel);
  const { live, stream } = watched(bob);
  openAt({ client: bob, hash: `#/channels/${channel}`, live });
  await screen.findByText("Ship it?");
  await stream;
  await ann.react(message.id, "thumbs_up");

  await chipsBecome([{ name: "👍 1", pressed: false, tooltip: `${channel}-ann` }]);
});

interface RefusingOnce {
  readonly client: CookoutClient;
  readonly recover: () => void;
}

function refusingOnce(client: CookoutClient): RefusingOnce {
  let refusing = true;
  return {
    client: {
      ...client,
      react: async (id, reaction) => {
        if (refusing) {
          throw new Error("down");
        }
        const answer = await client.react(id, reaction);
        return answer;
      },
    },
    recover: () => {
      refusing = false;
    },
  };
}

async function openedRefusing(channel: string): Promise<() => void> {
  const { bob } = await talkIn(channel);
  const { client, recover } = refusingOnce(bob);
  await openedAs(client, channel);
  return recover;
}

it("a reaction the server refuses says why, and the next one that succeeds clears it", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const channel = "web-react-refused";
  const recover = await openedRefusing(channel);
  reactWith(messageArticle, "👍");
  const said = await alertSaying("Couldn't react to the message");
  recover();
  reactWith(messageArticle, "👍");
  await chipsBecome([{ name: "👍 1", pressed: true, tooltip: `${channel}-bob` }]);

  expect([said.textContent, alertsShown()]).toStrictEqual([
    "Couldn't react to the message (unreachable): Error: down",
    [],
  ]);
});

async function openThread(channel: string): Promise<CookoutClient> {
  const { ann, bob, message } = await talkIn(channel);
  await ann.createMessage({ channel, replyTo: message.id, text: "Tonight" });
  openAt({ client: bob, hash: `#/channels/${channel}/threads/${String(message.id)}` });
  return bob;
}

it("a thread's parent and replies take reactions too, and a key pressed on a message's button isn't one", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await openThread("web-react-thread");
  const parent = await screen.findByRole("article", { name: "Parent message" });
  fireEvent.keyDown(parent, { key: "-" });
  await within(parent).findByRole("button", { name: "👎 1", pressed: true });
  const reply = within(await screen.findByRole("list", { name: "Replies" })).getByRole("article");
  fireEvent.keyDown(within(reply).getByRole("button", { name: "React with 👍" }), { key: "-" });
  fireEvent.keyDown(reply, { key: "+" });
  await within(reply).findByRole("button", { name: "👍 1", pressed: true });

  expect(within(reply).queryByRole("button", { name: "👎 1" })).toBeNull();
});
