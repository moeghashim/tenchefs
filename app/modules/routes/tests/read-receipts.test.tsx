import type { ClientMethod, OpenedView } from "./view-opened.ts";
import type { CookoutClient, Message, ServerSentEvent } from "../../sdk/index.ts";
import { adminClient, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { messagesIn, parentShown } from "./messages.ts";
import { receiptsIn, timeTooltipOf } from "./time-tooltips.ts";
import { screen, waitFor } from "@testing-library/react";
import type { ScriptedLive } from "../../testing/web.ts";
import { alertsShown } from "./alerts.ts";
import { scriptedLive } from "../../testing/web.ts";
import { viewOpened } from "./view-opened.ts";
import { watched } from "./watched.ts";

interface Asked {
  readonly bob: CookoutClient;
  readonly asked: Message;
}

interface Refusing {
  readonly client: CookoutClient;
  readonly refuse: () => void;
}

interface Talk {
  readonly ann: CookoutClient;
  readonly bob: CookoutClient;
  readonly viewer: CookoutClient;
}

async function person(channel: string, who: string): Promise<CookoutClient> {
  const { client } = await newIdentity({ kind: "human", name: `${channel}-${who}` });
  return client;
}

async function talkIn(channel: string): Promise<Talk> {
  const ann = await person(channel, "ann");
  const bob = await person(channel, "bob");
  const viewer = await person(channel, "viewer");
  await adminClient().createChannel({ name: channel });
  return { ann, bob, viewer };
}

async function post(client: CookoutClient, channel: string, text: string): Promise<Message> {
  const { message } = await client.createMessage({ channel, text });
  return message;
}

async function receiptsShown(label: string, expected: readonly (string | null)[]): Promise<void> {
  await waitFor(async () => {
    await expect(receiptsIn(label)).resolves.toStrictEqual(expected);
  });
}

async function watchedChannel(channel: string): Promise<Asked> {
  const { ann, bob, viewer } = await talkIn(channel);
  const earlier = await post(ann, channel, `@${channel}-bob earlier`);
  await bob.ack(earlier.id);
  const asked = await post(ann, channel, `@${channel}-bob look`);
  const { live, stream } = watched(viewer);
  await viewOpened({ client: viewer, hash: `#/channels/${channel}`, live, waitingOn: ["listMessages"] });
  await stream;
  return { asked, bob };
}

interface Answered {
  readonly answered: OpenedView["answered"];
}

async function scriptedThread(
  channel: string,
  text = "Noon",
): Promise<Answered & ScriptedLive & { readonly reply: Message }> {
  const { ann, bob, viewer } = await talkIn(channel);
  const parent = await post(ann, channel, "Deploy?");
  const { message: reply } = await bob.createMessage({ channel, replyTo: parent.id, text });
  const opened = scriptedLive();
  const { answered } = await viewOpened({
    client: viewer,
    hash: `#/channels/${channel}/threads/${String(parent.id)}`,
    live: opened.live,
    waitingOn: ["getThread"],
  });
  return { ...opened, answered, reply };
}

async function scriptedChannel(channel: string): Promise<Answered & Asked & ScriptedLive> {
  const { ann, bob, viewer } = await talkIn(channel);
  const asked = await post(ann, channel, `@${channel}-bob look`);
  const opened = scriptedLive();
  const { answered } = await viewOpened({
    client: viewer,
    hash: `#/channels/${channel}`,
    live: opened.live,
    waitingOn: ["listMessages"],
  });
  return { ...opened, answered, asked, bob };
}

interface Relinking extends Answered {
  readonly methods: readonly ClientMethod[];
  readonly report: ScriptedLive["report"];
}

async function linkBack({ answered, methods, report }: Relinking): Promise<void> {
  report("up");
  await Promise.all(
    methods.map(async (method) => {
      await answered(method);
    }),
  );
}

function backfilled(identity: string, reply: Message): ServerSentEvent {
  return {
    data: JSON.stringify({ receipt: { identity, messageId: reply.id, seen: true }, type: "read-receipt" }),
    event: "read-receipt",
  };
}

async function refusedIf(refusing: boolean): Promise<void> {
  await Promise.resolve();
  if (refusing) {
    throw new Error("down");
  }
}

function refusingWhenAsked(client: CookoutClient): Refusing {
  let refusing = false;
  return {
    client: {
      ...client,
      getThread: async (id) => {
        await refusedIf(refusing);
        const thread = await client.getThread(id);
        return thread;
      },
      listMessages: async (name, query) => {
        await refusedIf(refusing);
        const page = await client.listMessages(name, query);
        return page;
      },
    },
    refuse: () => {
      refusing = true;
    },
  };
}

async function refusedThread(channel: string): Promise<Answered & ScriptedLive & Pick<Refusing, "refuse">> {
  const { ann, bob, viewer } = await talkIn(channel);
  const parent = await post(ann, channel, "Deploy?");
  await bob.createMessage({ channel, replyTo: parent.id, text: "Noon" });
  const { client, refuse } = refusingWhenAsked(viewer);
  const opened = scriptedLive();
  const { answered } = await viewOpened({
    client,
    hash: `#/channels/${channel}/threads/${String(parent.id)}`,
    live: opened.live,
    waitingOn: ["getThread"],
  });
  await receiptsShown("Replies", [`Not seen yet: @${channel}-ann`]);
  return { ...opened, answered, refuse };
}

it("a message mentioning @bob shows no receipt inline, its time's tooltip says bob hasn't seen it, and a read-receipt event changes the tooltip with no reload", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-receipts-live";
  const { asked, bob } = await watchedChannel(channel);

  await receiptsShown("Messages", [`Seen by @${channel}-bob just now`, `Not seen yet: @${channel}-bob`]);

  await bob.ack(asked.id);

  await receiptsShown("Messages", [`Seen by @${channel}-bob just now`, `Seen by @${channel}-bob just now`]);

  await expect(messagesIn("Messages")).resolves.toStrictEqual([
    `${channel}-ann@${channel}-bob earlier`,
    `@${channel}-bob look`,
  ]);
});

it("a reply's tooltip shows its parent author's receipt, a message that mentions nobody has none in its tooltip, and a backfilled receipt shows no time", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-receipts-thread";
  const { reply, send } = await scriptedThread(channel);

  await receiptsShown("Replies", [`Not seen yet: @${channel}-ann`]);

  send(backfilled(`${channel}-ann`, reply));

  await receiptsShown("Replies", [`Seen by @${channel}-ann`]);

  await expect(parentShown()).resolves.toBe(`${channel}-annDeploy?`);
  expect(timeTooltipOf(() => screen.getByRole("article", { name: "Parent message" }))).toStrictEqual([
    expect.any(String),
  ]);
});

it("receipts seen while the live link was down show once it is back", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const channel = "web-receipts-back";
  const { answered, asked, bob, report } = await scriptedChannel(channel);
  await receiptsShown("Messages", [`Not seen yet: @${channel}-bob`]);

  report("down");
  await bob.ack(asked.id);
  await linkBack({ answered, methods: ["listMessages"], report });

  await receiptsShown("Messages", [`Seen by @${channel}-bob just now`]);
});

it("a tooltip names everyone who has seen a message before everyone who hasn't, and an open thread fetches them again when the link is back", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-receipts-many";
  const { answered, reply, report, send } = await scriptedThread(channel, `@admin @${channel}-viewer Noon`);
  await receiptsShown("Replies", [`Not seen yet: @admin, @${channel}-viewer, @${channel}-ann`]);
  send(backfilled(`${channel}-viewer`, reply), backfilled(`${channel}-ann`, reply));

  await receiptsShown("Replies", [`Seen by @${channel}-viewer, @${channel}-ann · Not seen yet: @admin`]);

  report("down");
  await adminClient().ack(reply.id);
  await linkBack({ answered, methods: ["getThread"], report });

  await receiptsShown("Replies", [
    `Seen by @admin just now, @${channel}-viewer just now · Not seen yet: @${channel}-ann`,
  ]);
});

it("a channel and thread that can't be fetched again when the link is back say so", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { answered, refuse, report } = await refusedThread("web-receipts-refused");
  report("down");
  refuse();
  await linkBack({ answered, methods: ["listMessages", "getThread"], report });

  await waitFor(() => {
    expect(alertsShown()).toStrictEqual([
      "Couldn't mark the channel read (unreachable): Error: down",
      "Couldn't mark the thread read (unreachable): Error: down",
    ]);
  });
});
