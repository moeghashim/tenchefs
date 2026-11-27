import { expect, it } from "vitest";
import { focusedTag, pressed, rowAddresses, threadsWithReplies } from "./inbox-keys.ts";
import { inConversation } from "./regions.ts";
import { openWithClockStopped } from "./clock.ts";
import { waitFor } from "@testing-library/react";

const TWO = 2;
const NONE = 0;

interface Ahead {
  readonly before: HTMLElement;
  readonly first: string;
  readonly second: string;
  readonly unmount: () => void;
}

async function onFirstRow(channel: string): Promise<Ahead> {
  const { reader } = await threadsWithReplies({ channel, read: TWO, unread: NONE });
  const unmount = openWithClockStopped({ client: reader, hash: "#/inbox" });
  const [first = "", second = ""] = await rowAddresses({ count: TWO, label: "Earlier" });
  pressed("j");
  const before = await inConversation().findByRole("textbox", { name: "Reply" });
  return { before, first, second, unmount };
}

function rowOf(address: string): HTMLElement {
  const row = globalThis.document.querySelector(`a[data-feed-row][href="${address}"]`);
  if (!(row instanceof HTMLElement)) {
    throw new TypeError(`no row for ${address}`);
  }
  return row;
}

it("r pressed before the next row's conversation shows focuses that conversation's reply box once it shows", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const { before, second, unmount } = await onFirstRow("web-inbox-keys-ahead");
  pressed("j");
  pressed("r");
  const after = await waitFor(() => {
    const box = inConversation().getByRole("textbox", { name: "Reply" });

    expect([box === before, focusedTag()]).toStrictEqual([false, "TEXTAREA"]);

    return box;
  });

  expect([globalThis.document.activeElement === after, globalThis.location.hash]).toStrictEqual([true, second]);

  unmount();
});

it("r pressed before the next row's conversation shows leaves focus where it moved meanwhile", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const { before, first, unmount } = await onFirstRow("web-inbox-keys-ahead-moved");
  pressed("j");
  pressed("r");
  rowOf(first).focus();
  await waitFor(() => {
    expect(inConversation().getByRole("textbox", { name: "Reply" })).not.toBe(before);
  });

  expect(globalThis.document.activeElement).toBe(rowOf(first));

  unmount();
});
