import type { EarlierState, Unread, UnreadState } from "../../unread/index.ts";
import { expect, it } from "vitest";
import { people, post } from "./attention-posts.ts";
import type { MessageId } from "../../sdk/index.ts";
import { createUnread } from "../../unread/index.ts";
import { waitFor } from "@testing-library/react";

interface Store<State> {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => State;
}

interface Shown {
  readonly forYou: readonly MessageId[];
  readonly earlier: readonly MessageId[];
}

async function loaded<State extends { readonly status: string }>(store: Store<State>): Promise<State> {
  const statuses: string[] = [];
  store.subscribe(() => {
    statuses.push(store.snapshot().status);
  });
  await waitFor(() => {
    expect(statuses).toContain("loaded");
  });
  return store.snapshot();
}

function idsOf(state: UnreadState | EarlierState): readonly MessageId[] {
  if (state.status !== "loaded") {
    return [];
  }
  return state.items.map((item) => item.message.id);
}

async function shownOf(unread: Unread): Promise<Shown> {
  const forYou = idsOf(await loaded(unread));
  return { earlier: idsOf(await loaded(unread.earlier)), forYou };
}

it("a reaction on a reply you've read is For you and not also Earlier", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const channel = "web-earlier-reacted-reply";
  const { poster, reader } = await people(channel);
  const parent = await post({ by: poster, channel, text: "Deploy?" });
  const reply = await post({ by: reader, channel, replyTo: parent, text: "Done" });
  await poster.react(reply.id, "thumbs_up");
  const shown = await shownOf(createUnread({ client: reader }));

  expect(shown).toStrictEqual({ earlier: [], forYou: [reply.id] });
});
