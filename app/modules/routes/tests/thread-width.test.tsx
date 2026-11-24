import { expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { inConversation, inThread } from "./regions.ts";
import type { Message } from "../../sdk/index.ts";
import { adminClient } from "./identities.ts";
import { openAt } from "./render.tsx";

const EDGE = "Resize the thread panel";
const STEP = 32;
const START_X = 900;
const DRAGGED = 100;
const PAST_THE_MINIMUM = -800;
const PAST_THE_MAXIMUM = 1600;
const IN_TAB_ORDER = 0;
const SECONDARY = 2;

async function threadIn(channel: string): Promise<Message> {
  const admin = adminClient();
  await admin.createChannel({ name: channel });
  const { message } = await admin.createMessage({ channel, text: "The parent" });
  await admin.createMessage({ channel, replyTo: message.id, text: "A reply" });
  return message;
}

function threadHash(parent: Message): string {
  return `#/channels/${parent.channel}/threads/${String(parent.id)}`;
}

function edgeNow(): HTMLElement {
  return screen.getByRole("separator", { name: EDGE });
}

function widthNow(): number {
  return Number(edgeNow().getAttribute("aria-valuenow"));
}

async function threadWidth(): Promise<number> {
  await inThread().findByRole("separator", { name: EDGE });
  return widthNow();
}

function pressed(keys: readonly string[]): number {
  for (const key of keys) {
    fireEvent.keyDown(edgeNow(), { key });
  }
  return widthNow();
}

function dragged(by: number): number {
  fireEvent.pointerDown(edgeNow(), { button: 0, clientX: START_X });
  fireEvent.pointerMove(globalThis.document, { clientX: START_X - by });
  fireEvent.pointerUp(globalThis.document, { clientX: START_X - by });
  return widthNow();
}

function shapeOf(): readonly (string | number | null)[] {
  const edge = edgeNow();
  return [edge.getAttribute("aria-orientation"), edge.tabIndex, edge.getAttribute("aria-valuemax")];
}

async function widthAfterReopening(hash: string): Promise<number> {
  const close = openAt({ client: adminClient(), hash });
  const width = await threadWidth();
  close();
  return width;
}

it("the thread panel's edge is a vertical separator that the arrow keys resize, and a reload keeps the width", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const parent = await threadIn("web-thread-width-keys");
  const close = openAt({ client: adminClient(), hash: threadHash(parent) });
  const before = await threadWidth();
  const widened = pressed(["ArrowLeft"]);
  const narrowed = pressed(["ArrowRight", "ArrowRight"]);
  const shape = shapeOf();
  close();

  expect([shape, widened - before, narrowed - before, await widthAfterReopening(threadHash(parent))]).toStrictEqual([
    ["vertical", IN_TAB_ORDER, "768"],
    STEP,
    -STEP,
    narrowed,
  ]);
});

it("dragging the thread panel's edge left widens it, within its bounds, and a reload keeps the width", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const parent = await threadIn("web-thread-width-drag");
  const close = openAt({ client: adminClient(), hash: threadHash(parent) });
  await threadWidth();
  const narrowest = pressed(["Home"]);
  const widened = dragged(DRAGGED);
  const widest = dragged(PAST_THE_MAXIMUM);
  const end = pressed(["End"]);
  close();

  expect([widened - narrowest, widest, await widthAfterReopening(threadHash(parent))]).toStrictEqual([
    DRAGGED,
    end,
    widest,
  ]);
});

it("dragging the thread panel's edge past its narrowest closes the thread, as its close link does", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const parent = await threadIn("web-thread-width-close");
  const close = openAt({ client: adminClient(), hash: threadHash(parent) });
  await threadWidth();
  dragged(PAST_THE_MINIMUM);
  await waitFor(() => {
    expect(screen.queryByRole("complementary", { name: "Thread" })).toBeNull();
  });

  expect(globalThis.location.hash).toBe(`#/channels/${parent.channel}`);

  close();
});

it("a thread opened from the Inbox has the same edge, at the same width, and dragging past it goes back to the Inbox", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const parent = await threadIn("web-thread-width-inbox");
  const width = await widthAfterReopening(threadHash(parent));
  const close = openAt({ client: adminClient(), hash: `#/inbox/${parent.channel}/${String(parent.id)}` });
  await inConversation().findByRole("separator", { name: EDGE });
  const shown = widthNow();
  dragged(PAST_THE_MINIMUM);
  await waitFor(() => {
    expect(globalThis.location.hash).toBe("#/inbox");
  });

  expect(shown).toBe(width);

  close();
});

it("other keys and a secondary-button drag leave the thread panel's width as it is", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const parent = await threadIn("web-thread-width-ignored");
  const close = openAt({ client: adminClient(), hash: threadHash(parent) });
  const before = await threadWidth();
  const afterKey = pressed(["a"]);
  fireEvent.pointerDown(edgeNow(), { button: SECONDARY, clientX: START_X });
  fireEvent.pointerMove(globalThis.document, { clientX: START_X - DRAGGED });

  expect([afterKey, widthNow()]).toStrictEqual([before, before]);

  close();
});
