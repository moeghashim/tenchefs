import type { CookoutClient, Message } from "../../sdk/index.ts";
import { adminClient, agentShown, newIdentity, revocableView } from "./identities.ts";
import { expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { Cuttable } from "./cuttable.ts";
import { alertSaying } from "./alerts.ts";
import { answering } from "./answering.ts";
import { cuttable } from "./cuttable.ts";
import { inSidebar } from "./regions.ts";
import { messagesIn } from "./messages.ts";
import { openAt } from "./render.tsx";

interface Reading {
  readonly poster: CookoutClient;
  readonly reader: CookoutClient;
  readonly first: Message;
}

interface Opening {
  readonly client: CookoutClient;
  readonly hash: string;
  readonly pageSize?: number;
}

function countsOn(channel: string): readonly (string | null)[] {
  const link = inSidebar().getByRole("link", { name: new RegExp(`^#${channel}(?![a-z-])`, "u") });
  const counts: (string | null)[] = [];
  for (const count of within(link).queryAllByText(/^\d+ (?:unread|for you)$/u)) {
    counts.push(count.textContent);
  }
  return counts;
}

async function shownCounts(channel: string, counts: readonly string[]): Promise<void> {
  await waitFor(() => {
    expect(countsOn(channel)).toStrictEqual(counts);
  });
}

async function subscribed(reader: CookoutClient, channel: string): Promise<void> {
  await adminClient().createChannel({ name: channel });
  await reader.subscribe(channel);
}

async function reading(name: string, others: readonly string[] = []): Promise<Reading> {
  const poster = await newIdentity({ kind: "agent", name: `${name}-poster` });
  const reader = await newIdentity({ kind: "human", name: `${name}-reader` });
  await Promise.all(
    [name, ...others].map(async (channel) => {
      await subscribed(reader.client, channel);
    }),
  );
  const { message: first } = await poster.client.createMessage({ channel: name, text: "Deploy at noon?" });
  return { first, poster: poster.client, reader: reader.client };
}

function opened(opening: Opening): Cuttable["report"] {
  const { live, report } = cuttable();
  openAt({ ...opening, live });
  return report;
}

async function whileDown(report: Cuttable["report"], work: () => Promise<unknown>): Promise<void> {
  report("down");
  await work();
  report("up");
}

it("a message, a reply and an unread count from while the live link was down show once it is back, with no reload", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const other = "web-catch-up-other";
  const { first, poster, reader } = await reading("web-catch-up", [other]);
  const report = opened({ client: reader, hash: `#/channels/web-catch-up/threads/${String(first.id)}` });
  await screen.findByRole("complementary", { name: "Thread" });
  await shownCounts(other, []);

  await whileDown(report, async () => {
    await poster.createMessage({ channel: "web-catch-up", text: "Or at one?" });
    await poster.createMessage({ channel: "web-catch-up", replyTo: first.id, text: "Noon works" });
    await poster.createMessage({ channel: other, text: "Lunch?" });
  });

  await expect(screen.findByText("Or at one?")).resolves.toBeDefined();
  await expect(
    within(screen.getByRole("complementary", { name: "Thread" })).findByText("Noon works"),
  ).resolves.toBeDefined();

  await shownCounts(other, ["1 unread"]);
});

it("a channel read in another session while the live link was down shows no unread count once it is back", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { first, reader } = await reading("web-catch-up-read");
  const report = opened({ client: reader, hash: "#/" });
  await shownCounts("web-catch-up-read", ["1 unread"]);

  await whileDown(report, async () => {
    await reader.ack(first.id);
  });

  await shownCounts("web-catch-up-read", []);
});

it("a channel's only message marked unread in another session while the live link was down counts as unread once it is back, and through the next reconnect", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { first, poster, reader } = await reading("web-catch-up-unread", ["web-catch-up-unread-other"]);
  await reader.ack(first.id);
  const report = opened({ client: reader, hash: "#/" });
  await shownCounts("web-catch-up-unread", []);

  await whileDown(report, async () => {
    await reader.markUnread(first.id);
  });

  await shownCounts("web-catch-up-unread", ["1 unread"]);
  await whileDown(report, async () => {
    await poster.createMessage({ channel: "web-catch-up-unread-other", text: "Lunch?" });
  });

  await shownCounts("web-catch-up-unread", ["1 unread"]);
});

it("a later message marked unread in another session while the live link was down counts as unread once it is back", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { poster, reader } = await reading("web-catch-up-later");
  const { message } = await poster.createMessage({ channel: "web-catch-up-later", text: "Or at one?" });
  await reader.ack(message.id);
  const report = opened({ client: reader, hash: "#/" });
  await shownCounts("web-catch-up-later", []);

  await whileDown(report, async () => {
    await reader.markUnread(message.id);
  });

  await shownCounts("web-catch-up-later", ["1 unread"]);
});

it("every message posted while the live link was down shows once it is back, though they fill more than a page", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { poster, reader } = await reading("web-catch-up-pages");
  const { answered, client } = answering(reader);
  const report = opened({ client, hash: "#/channels/web-catch-up-pages", pageSize: 1 });
  await answered("ack");
  await screen.findByText("Deploy at noon?");

  await whileDown(report, async () => {
    await poster.createMessage({ channel: "web-catch-up-pages", text: "Or at one?" });
    await poster.createMessage({ channel: "web-catch-up-pages", text: "Or at two?" });
  });
  await answered("ack");
  await screen.findByText("Or at two?");

  await expect(messagesIn("Messages")).resolves.toStrictEqual([
    `${agentShown("web-catch-up-pages-poster")}agentDeploy at noon?`,
    "Or at one?",
    "Or at two?",
  ]);
});

it("an open channel and thread that can no longer be read once the live link is back say so and keep what they show", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await adminClient().createChannel({ name: "web-catch-up-refused" });
  const { message } = await adminClient().createMessage({ channel: "web-catch-up-refused", text: "Deploy at noon?" });
  const reader = await revocableView({
    methods: ["listMessages", "getThread"],
    revoked: "web-catch-up-refused-rotated",
    viewer: "web-catch-up-refused-viewer",
  });
  const report = opened({
    client: reader.client,
    hash: `#/channels/web-catch-up-refused/threads/${String(message.id)}`,
  });
  await within(await screen.findByRole("complementary", { name: "Thread" })).findByText("Deploy at noon?");

  await whileDown(report, reader.rotateToken);
  await Promise.all([
    alertSaying("Couldn't mark the channel read (token_revoked)"),
    alertSaying("Couldn't mark the thread read (token_revoked)"),
  ]);

  await expect(messagesIn("Messages")).resolves.toStrictEqual(["adminDeploy at noon?"]);
});
