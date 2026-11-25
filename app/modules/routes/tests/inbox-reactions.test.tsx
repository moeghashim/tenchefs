import type { CookoutClient, Message } from "../../sdk/index.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { people, post } from "./attention-posts.ts";
import { inPane } from "./regions.ts";
import { openAt } from "./render.tsx";
import { watched } from "./watched.ts";

interface Reacted {
  readonly reader: CookoutClient;
  readonly poster: string;
}

interface Reacting {
  readonly channel: string;
  readonly alsoDown?: boolean;
  readonly onReply?: boolean;
}

async function postedTo(by: CookoutClient, { channel, onReply }: Reacting, poster: CookoutClient): Promise<Message> {
  if (onReply !== true) {
    return post({ by, channel, text: "Deployed" });
  }
  const parent = await post({ by: poster, channel, text: "Deploy?" });
  return post({ by, channel, replyTo: parent, text: "Done" });
}

async function reactedTo(reacting: Reacting): Promise<Reacted> {
  const { poster, reader } = await people(reacting.channel);
  const message = await postedTo(reader, reacting, poster);
  await poster.react(message.id, "thumbs_up");
  if (reacting.alsoDown === true) {
    await poster.react(message.id, "thumbs_down");
  }
  return { poster: `@${reacting.channel}-poster`, reader };
}

async function reactedThenFollowedUp(channel: string): Promise<CookoutClient> {
  const { poster, reader } = await people(channel);
  const reacted = await post({ by: reader, channel, text: "Deployed" });
  await poster.react(reacted.id, "thumbs_up");
  await post({ by: poster, channel, text: "Thanks" });
  return reader;
}

async function forYouShown(): Promise<void> {
  await screen.findByRole("list", { name: "For you" });
}

it('the author\'s Inbox shows a reaction under For you as "@name reacted with 👍", linking to the message', {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-inbox-reacted";
  const { poster, reader } = await reactedTo({ alsoDown: true, channel });
  openAt({ client: reader, hash: "#/inbox" });
  await forYouShown();
  const why = `${poster} reacted with 👍, ${poster} reacted with 👎`;

  expect([
    inPane()
      .getByRole("link", { name: /reacted with/u })
      .getAttribute("href"),
    inPane().getByText(why).textContent,
    inPane().queryByRole("list", { name: "Activity" }),
  ]).toStrictEqual([`#/channels/${channel}`, why, null]);
});

it("a reaction on your reply is For you, and doesn't count as a new reply in its thread", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-inbox-reacted-reply";
  const { poster, reader } = await reactedTo({ channel, onReply: true });
  openAt({ client: reader, hash: `#/channels/${channel}` });
  await screen.findByText("Deploy?");
  const newsShown = screen.queryByText(/ new repl/u);
  globalThis.location.hash = "#/inbox";
  await forYouShown();

  expect([newsShown, inPane().getByText(`${poster} reacted with 👍`).textContent]).toStrictEqual([
    null,
    `${poster} reacted with 👍`,
  ]);
});

it("opening the channel of a reaction's message acks it, so it leaves the Inbox", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { reader } = await reactedTo({ channel: "web-inbox-reacted-open" });
  const { live, stream } = watched(reader);
  openAt({ client: reader, hash: "#/inbox", live });
  await stream;
  fireEvent.click(await inPane().findByRole("link", { name: /reacted with/u }));
  await screen.findByRole("feed", { name: "Messages" });
  globalThis.location.hash = "#/inbox";

  await waitFor(() => {
    expect(inPane().queryByRole("list", { name: "For you" })).toBeNull();
  });

  await expect(reader.inbox()).resolves.toMatchObject({ items: [] });
});

it("opening a channel clears a reaction on an earlier message there too, so it stays gone after a reload", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-inbox-reacted-earlier";
  const reader = await reactedThenFollowedUp(channel);
  const unmount = openAt({ client: reader, hash: `#/channels/${channel}` });
  await screen.findByText("Thanks");
  await waitFor(async () => {
    await expect(reader.inbox()).resolves.toMatchObject({ items: [] });
  });
  unmount();
  openAt({ client: reader, hash: "#/inbox" });

  await expect(screen.findByText("You're all caught up.")).resolves.toBeDefined();
});
