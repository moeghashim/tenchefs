import type { CookoutClient, Message } from "../../sdk/index.ts";
import { adminClient, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { avatarPng } from "../../testing/index.ts";
import { openAt } from "./render.tsx";
import { watched } from "./watched.ts";
import { withNodeForms } from "./attachment-posts.ts";

interface Drawn {
  readonly agent: string | null;
  readonly hue: string;
  readonly tagged: boolean;
}

const ONE_COLOUR = 1;

function drawn(rows: () => readonly HTMLElement[]): readonly Drawn[] {
  const shown: Drawn[] = [];
  for (const row of rows()) {
    const avatar = within(row).getByTestId("avatar");
    shown.push({
      agent: avatar.dataset["agent"] ?? null,
      hue: avatar.className
        .split(" ")
        .filter((name) => name.startsWith("bg-[oklch"))
        .join(" "),
      tagged: within(row).queryByText("agent") !== null,
    });
  }
  return shown;
}

function messageRows(): readonly Drawn[] {
  const list = screen.getByRole("feed", { name: "Messages" });
  return drawn(() => within(list).getAllByRole("article"));
}

function threadRows(): readonly Drawn[] {
  const panel = screen.getByRole("complementary", { name: "Thread" });
  const parent = within(panel).getByRole("article", { name: "Parent message" });
  return drawn(() => [parent, ...within(within(panel).getByRole("feed", { name: "Replies" })).getAllByRole("article")]);
}

async function botThread(): Promise<Message> {
  const agent = await newIdentity({ kind: "agent", name: "web-avatar-bot" });
  await adminClient().createChannel({ name: "web-avatars" });
  const { message } = await agent.client.createMessage({ channel: "web-avatars", text: "Beep" });
  await adminClient().createMessage({ channel: "web-avatars", replyTo: message.id, text: "Hello bot" });
  return message;
}

async function goneAuthors(): Promise<void> {
  const owned = await newIdentity({ kind: "agent", name: "web-avatar-gone-bot", owner: "admin" });
  const person = await newIdentity({ kind: "human", name: "web-avatar-gone-human" });
  await adminClient().createChannel({ name: "web-avatars-gone" });
  await owned.client.createMessage({ channel: "web-avatars-gone", text: "Owned words" });
  await person.client.createMessage({ channel: "web-avatars-gone", text: "Human words" });
  await adminClient().deactivateIdentity("web-avatar-gone-bot");
  await adminClient().deactivateIdentity("web-avatar-gone-human");
}

it("an agent's messages are drawn as an agent's and a human's as a human's, one name in one colour everywhere", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const message = await botThread();
  const close = openAt({ client: adminClient(), hash: `#/channels/web-avatars/threads/${String(message.id)}` });

  await waitFor(() => {
    const rows = [...messageRows(), ...threadRows()];

    expect([
      rows.map((row) => [row.agent, row.tagged]),
      new Set(rows.filter((row) => row.tagged).map((row) => row.hue)).size,
    ]).toStrictEqual([
      [
        ["true", true],
        ["true", true],
        ["false", false],
      ],
      ONE_COLOUR,
    ]);
  });

  close();
});

it("a deactivated author is drawn as an agent if the message carries an owner, else as a human", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await goneAuthors();
  const close = openAt({ client: adminClient(), hash: "#/channels/web-avatars-gone" });

  await waitFor(() => {
    expect(messageRows().map((row) => [row.agent, row.tagged])).toStrictEqual([
      ["true", true],
      ["false", false],
    ]);
  });

  close();
});

interface Opened {
  readonly region: () => HTMLElement;
  readonly close: () => Promise<void>;
}

interface Opening {
  readonly hash: string;
  readonly region: () => Promise<HTMLElement>;
  readonly shown: string;
}

function displayNameOf(name: string): string {
  return `Face of ${name}`;
}

async function openWatching({ hash, region, shown }: Opening): Promise<Opened> {
  const { live, stream } = watched(adminClient());
  const unmount = openAt({ client: adminClient(), hash, live });
  const found = await region();
  await within(found).findByText(shown);
  const events = await stream;
  return {
    close: async () => {
      unmount();
      await events.close();
    },
    region: () => found,
  };
}

async function setAvatarOf(name: string, client: CookoutClient): Promise<string> {
  const { identity } = await withNodeForms(async () => {
    const answer = await client.setAvatar(name, avatarPng());
    return answer;
  });
  const avatar = identity.avatar ?? null;
  if (avatar === null) {
    throw new TypeError(`${name} came back with no avatar after setting one.`);
  }
  return `/v1/avatars/${avatar.id}`;
}

async function postedBy(name: string): Promise<CookoutClient> {
  const person = await newIdentity({ displayName: displayNameOf(name), kind: "human", name });
  await adminClient().createChannel({ name });
  await person.client.createMessage({ channel: name, text: "Watch my face" });
  return person.client;
}

interface Faces {
  readonly sources: readonly (string | null)[];
  readonly initials: boolean;
}

function facesIn(region: () => HTMLElement, name: string): Faces {
  const sources: (string | null)[] = [];
  for (const image of within(region()).queryAllByRole("img", { name: displayNameOf(name) })) {
    sources.push(image.getAttribute("src"));
  }
  return { initials: region().querySelector("[data-initials]") !== null, sources };
}

it("an avatar set while the board is open replaces the identity's initials beside its messages, without a reload", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const name = "web-avatar-live";
  const person = await postedBy(name);
  const { close, region } = await openWatching({
    hash: `#/channels/${name}`,
    region: async () => {
      const feed = await screen.findByRole("feed", { name: "Messages" });
      return feed;
    },
    shown: "Watch my face",
  });
  const before = facesIn(region, name);
  const shown = await setAvatarOf(name, person);

  await waitFor(() => {
    expect([before, facesIn(region, name)]).toStrictEqual([
      { initials: true, sources: [] },
      { initials: false, sources: [shown] },
    ]);
  });

  await close();
});

it("an avatar set while the people list is open shows on the identity's row at once", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const name = "web-avatar-live-row";
  const person = await postedBy(name);
  const { close, region } = await openWatching({
    hash: "#/people",
    region: async () => {
      const list = await screen.findByRole("list", { name: "Identities" });
      return list;
    },
    shown: displayNameOf(name),
  });
  const shown = await setAvatarOf(name, person);

  await waitFor(() => {
    expect(facesIn(region, name).sources).toStrictEqual([shown]);
  });

  await close();
});
