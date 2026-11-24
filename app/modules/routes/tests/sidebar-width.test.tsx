import { expect, it } from "vitest";
import { adminClient } from "./identities.ts";
import { fireEvent } from "@testing-library/react";
import { inSidebar } from "./regions.ts";
import { openAt } from "./render.tsx";

const EDGE = "Resize the sidebar";
const STEP = 32;
const START_X = 300;
const DRAGGED = 100;
const PAST_THE_MINIMUM = -800;
const PAST_THE_MAXIMUM = 1600;
const IN_TAB_ORDER = 0;
const SECONDARY = 2;

function edgeNow(): HTMLElement {
  return inSidebar().getByRole("separator", { name: EDGE });
}

function widthNow(): number {
  return Number(edgeNow().getAttribute("aria-valuenow"));
}

async function sidebarWidth(): Promise<number> {
  await inSidebar().findByRole("separator", { name: EDGE });
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
  fireEvent.pointerMove(globalThis.document, { clientX: START_X + by });
  fireEvent.pointerUp(globalThis.document, { clientX: START_X + by });
  return widthNow();
}

function shapeOf(): readonly (string | number | null)[] {
  const edge = edgeNow();
  return [
    edge.getAttribute("aria-orientation"),
    edge.tabIndex,
    edge.getAttribute("aria-valuemin"),
    edge.getAttribute("aria-valuemax"),
  ];
}

async function widthAfterReload(): Promise<number> {
  const close = openAt({ client: adminClient(), hash: "#/" });
  const width = await sidebarWidth();
  close();
  return width;
}

it("the sidebar's edge is a vertical separator that the arrow keys resize, Right widening, and a reload keeps the width", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const close = openAt({ client: adminClient(), hash: "#/" });
  const before = await sidebarWidth();
  const widened = pressed(["ArrowRight"]);
  const narrowed = pressed(["ArrowLeft", "ArrowLeft"]);
  const shape = shapeOf();
  close();

  expect([shape, widened - before, narrowed - before, await widthAfterReload()]).toStrictEqual([
    ["vertical", IN_TAB_ORDER, "192", "448"],
    STEP,
    -STEP,
    narrowed,
  ]);
});

it("dragging the sidebar's edge right widens it, within its bounds, and a reload keeps the width", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const close = openAt({ client: adminClient(), hash: "#/" });
  await sidebarWidth();
  const narrowest = pressed(["Home"]);
  const widened = dragged(DRAGGED);
  const widest = dragged(PAST_THE_MAXIMUM);
  const end = pressed(["End"]);
  close();

  expect([widened - narrowest, widest, await widthAfterReload()]).toStrictEqual([DRAGGED, end, widest]);
});

it("dragging the sidebar's edge past its narrowest stops it there, and the sidebar stays open", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const close = openAt({ client: adminClient(), hash: "#/" });
  await sidebarWidth();
  const narrowest = pressed(["Home"]);
  pressed(["End"]);
  const stopped = dragged(PAST_THE_MINIMUM);
  const { hash } = globalThis.location;

  expect([stopped, inSidebar().queryByRole("link", { name: /^Inbox/u }) !== null, hash]).toStrictEqual([
    narrowest,
    true,
    "#/",
  ]);

  close();
});

it("other keys and a secondary-button drag leave the sidebar's width as it is", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = openAt({ client: adminClient(), hash: "#/" });
  const before = await sidebarWidth();
  const afterKey = pressed(["a"]);
  fireEvent.pointerDown(edgeNow(), { button: SECONDARY, clientX: START_X });
  fireEvent.pointerMove(globalThis.document, { clientX: START_X + DRAGGED });

  expect([afterKey, widthNow()]).toStrictEqual([before, before]);

  close();
});

it("the sidebar collapsed to its rail has no edge to drag", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = openAt({ client: adminClient(), hash: "#/" });
  await sidebarWidth();
  fireEvent.click(inSidebar().getByRole("button", { name: "Collapse sidebar" }));
  const shownOnRail = inSidebar().queryByRole("separator", { name: EDGE });
  fireEvent.click(inSidebar().getByRole("button", { name: "Expand sidebar" }));

  expect([shownOnRail, inSidebar().queryByRole("separator", { name: EDGE }) !== null]).toStrictEqual([null, true]);

  close();
});
