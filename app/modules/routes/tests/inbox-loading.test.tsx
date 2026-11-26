import type { BoardStore, Unread } from "./defaults.ts";
import { boardStoreFor, createUnread } from "./defaults.ts";
import { expect, it } from "vitest";
import { clockStopped } from "./clock.ts";
import { openBoard } from "./render.tsx";
import { screen } from "@testing-library/react";
import { subscribedReader } from "./inbox-reader.ts";

const LOADING = { status: "loading" } as const;

interface Loading {
  readonly channel: string;
  readonly loading: (unread: Unread) => Unread;
  readonly read: boolean;
}

async function openedLoading({ channel, loading, read }: Loading): Promise<() => void> {
  const { poster, reader } = await subscribedReader(channel);
  const { message } = await poster.createMessage({ channel, text: "Ship it?" });
  if (read) {
    await reader.ack(message.id);
  }
  const boardStore: BoardStore = boardStoreFor({ client: reader });
  clockStopped();
  return openBoard({
    boardStore,
    hash: `#/inbox/${channel}`,
    session: boardStore.session,
    unread: loading(createUnread({ boardStore })),
  });
}

function earlierLoading(unread: Unread): Unread {
  return { ...unread, earlier: { ...unread.earlier, snapshot: () => LOADING } };
}

function noticesLoading(unread: Unread): Unread {
  const { alerts, deactivatedQuietAgents, deactivationOffers, nudges } = unread;
  return {
    ...unread,
    alerts: { ...alerts, snapshot: () => LOADING },
    deactivatedQuietAgents: { ...deactivatedQuietAgents, snapshot: () => LOADING },
    deactivationOffers: { ...deactivationOffers, snapshot: () => LOADING },
    nudges: { ...nudges, snapshot: () => LOADING },
  };
}

it("while Earlier loads, a read channel's conversation and the Earlier list wait for it", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-inbox-earlier-loading";
  const unmount = await openedLoading({ channel, loading: earlierLoading, read: true });
  await screen.findByText("You're all caught up.");

  expect([screen.queryByText("Ship it?"), screen.queryByText("Nothing read yet.")]).toStrictEqual([null, null]);

  unmount();
});

it("while the notices load, Earlier lists no notices", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const channel = "web-inbox-notices-loading";
  const unmount = await openedLoading({ channel, loading: noticesLoading, read: false });
  await screen.findAllByText("Ship it?");

  await expect(screen.findByText("Nothing read yet.")).resolves.toBeDefined();

  unmount();
});
