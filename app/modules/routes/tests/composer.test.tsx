import type { CookoutClient, Message } from "../../sdk/index.ts";
import { adminClient, agentOption, clientWith, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, getDefaultNormalizer, screen, within } from "@testing-library/react";
import { inPane } from "./regions.ts";
import { openAt } from "./render.tsx";

async function threadIn(channel: string): Promise<Message> {
  await adminClient().createChannel({ name: channel });
  const { message } = await adminClient().createMessage({ channel, text: "The parent" });
  return message;
}

function hashOf(parent: Message): string {
  return `#/channels/${parent.channel}/threads/${String(parent.id)}`;
}

async function typeInReply(text: string): Promise<HTMLElement> {
  const box = await screen.findByLabelText("Reply", { selector: "textarea" });
  fireEvent.change(box, { target: { value: text } });
  return box;
}

async function suggested(): Promise<readonly (string | null)[]> {
  const list = await screen.findByRole("listbox", { name: "Mention suggestions" });
  const shown: (string | null)[] = [];
  for (const button of within(list).getAllByRole("option")) {
    shown.push(button.textContent);
  }
  return shown;
}

it("typing @ and a prefix suggests the identities whose names start with it, humans and agents", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await newIdentity({ kind: "human", name: "suggest-ada" });
  await newIdentity({ kind: "agent", name: "suggest-agent" });
  await newIdentity({ kind: "human", name: "other-grace" });
  const parent = await threadIn("web-composer-suggests");
  const close = openAt({ client: adminClient(), hash: hashOf(parent) });

  await typeInReply("Ping @sugg");

  await expect(suggested()).resolves.toStrictEqual(["@suggest-ada", agentOption("suggest-agent")]);

  close();
});

async function workersWithDisplayNames(): Promise<void> {
  const owner = await newIdentity({ kind: "human", name: "shown-owner" });
  await newIdentity({ kind: "agent", name: "shown-worker-1", owner: "shown-owner" });
  await newIdentity({ kind: "agent", name: "shown-worker-2", owner: "shown-owner" });
  await owner.client.setDisplayName("shown-worker-1", "Quokka (cloud)");
  await owner.client.setDisplayName("shown-worker-2", "Wombat (cloud)");
}

it("typing @ and the start of a display name, in any case, suggests that identity and inserts its name", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await workersWithDisplayNames();
  const parent = await threadIn("web-composer-display-names");
  const close = openAt({ client: adminClient(), hash: hashOf(parent) });

  const box = await typeInReply("Ping @qUOk");
  const shown = await suggested();
  fireEvent.mouseDown(inPane().getByRole("option", { name: /@shown-worker-1/u }));

  expect([shown, box]).toStrictEqual([
    ["@shown-worker-1Quokka (cloud)"],
    expect.objectContaining({ value: "Ping @shown-worker-1 " }),
  ]);

  close();
});

const MEMBERS = ["@member-dot", agentOption("member-cy"), "@member-bea"];
const FIRST = 0;

async function repliesBy(parent: Message, earlier: CookoutClient, latest: CookoutClient): Promise<void> {
  const reply = { channel: parent.channel, replyTo: parent.id, text: "Reply" };
  await earlier.createMessage(reply);
  const { message: read } = await latest.createMessage(reply);
  await earlier.createMessage({ ...reply, seen: read.id });
  await latest.createMessage(reply);
  await adminClient().createMessage(reply);
}

async function threadWithMembers(): Promise<Message> {
  await newIdentity({ kind: "human", name: "member-ada" });
  const starter = await newIdentity({ kind: "human", name: "member-bea" });
  const earlier = await newIdentity({ kind: "agent", name: "member-cy" });
  const latest = await newIdentity({ kind: "human", name: "member-dot" });
  await newIdentity({ kind: "human", name: "member-eve" });
  await adminClient().createChannel({ name: "web-composer-members" });
  const { message } = await starter.client.createMessage({ channel: "web-composer-members", text: "Hi" });
  await repliesBy(message, earlier.client, latest.client);
  return message;
}

it("in a thread, its members are suggested first, most recent poster first, then the other matches", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const close = openAt({ client: adminClient(), hash: hashOf(await threadWithMembers()) });
  await typeInReply("Ping @member");
  const matching = await suggested();
  await typeInReply("Ping @");
  const everyone = await suggested();
  await typeInReply("Ping @member-e");

  await expect(suggested()).resolves.toStrictEqual(["@member-eve"]);
  expect([matching, everyone.slice(FIRST, MEMBERS.length)]).toStrictEqual([
    [...MEMBERS, "@member-ada", "@member-eve"],
    MEMBERS,
  ]);

  close();
});

const MANY = 12;
const TWO_DIGITS = 2;
const MANY_NAMES = Array.from({ length: MANY }, (_value, at) => `many-match-${String(at).padStart(TWO_DIGITS, "0")}`);

it("every identity matching a prefix is suggested, in order, not only the first few", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await Promise.all(
    MANY_NAMES.map(async (name) => {
      await newIdentity({ kind: "human", name });
    }),
  );
  const parent = await threadIn("web-composer-many-matches");
  const close = openAt({ client: adminClient(), hash: hashOf(parent) });

  await typeInReply("Ping @many-match");

  await expect(suggested()).resolves.toStrictEqual(MANY_NAMES.map((name) => `@${name}`));

  close();
});

it("choosing a suggestion puts the mention in the reply box in place of the prefix", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await newIdentity({ kind: "human", name: "chosen-linus" });
  const parent = await threadIn("web-composer-chooses");
  const close = openAt({ client: adminClient(), hash: hashOf(parent) });

  const box = await typeInReply("Ping @chosen-l");
  await suggested();
  fireEvent.mouseDown(inPane().getByRole("option", { name: /^@chosen-linus/u }));

  expect([
    screen.queryByDisplayValue("Ping @chosen-linus ", { normalizer: getDefaultNormalizer({ trim: false }) }),
    screen.queryByRole("listbox", { name: "Mention suggestions" }),
  ]).toStrictEqual([box, null]);

  close();
});

it("text with no @ before the caret suggests nobody", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const parent = await threadIn("web-composer-quiet");
  const close = openAt({ client: adminClient(), hash: hashOf(parent) });

  await typeInReply("mail me at me@admin");

  expect(screen.queryByRole("listbox", { name: "Mention suggestions" })).toBeNull();

  close();
});

it("@ and a space, as dictation types it, still suggests, and @ g filters as @g does", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await newIdentity({ kind: "human", name: "spoken-grace" });
  const parent = await threadIn("web-composer-spoken");
  const close = openAt({ client: adminClient(), hash: hashOf(parent) });

  await typeInReply("Ping @ ");

  await expect(suggested()).resolves.not.toStrictEqual([]);

  await typeInReply("Ping @ spoken-g");

  await expect(suggested()).resolves.toStrictEqual(["@spoken-grace"]);

  close();
});

it("a spoken at, with no @, suggests nobody", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await newIdentity({ kind: "human", name: "spoken-at-grace" });
  const parent = await threadIn("web-composer-spoken-at");
  const close = openAt({ client: adminClient(), hash: hashOf(parent) });

  await typeInReply("Ping at spoken-at-g");

  expect(screen.queryByRole("listbox", { name: "Mention suggestions" })).toBeNull();

  close();
});

it("when the server refuses the identity list, typing @ suggests nobody and the box still takes text", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const parent = await threadIn("web-composer-refused");
  const refused = clientWith("cookout_not-a-real-token");
  const close = openAt({ client: { ...adminClient(), listIdentities: refused.listIdentities }, hash: hashOf(parent) });
  const box = await typeInReply("Ping @adm");

  await expect(refused.listIdentities()).rejects.toThrow("token");

  expect([
    screen.queryByRole("listbox", { name: "Mention suggestions" }),
    screen.queryByDisplayValue("Ping @adm"),
  ]).toStrictEqual([null, box]);

  close();
});
