import { expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { adminClient } from "./identities.ts";
import { inThread } from "./regions.ts";
import { openAt } from "./render.tsx";

const NEXT = { ctrlKey: true, key: "]" } as const;
const PREVIOUS = { ctrlKey: true, key: "[" } as const;
const A_BOX = [{ bottom: 1, height: 1, left: 0, right: 1, top: 0, width: 1 }];

function unlaid(): void {
  Reflect.deleteProperty(HTMLElement.prototype, "getClientRects");
}

function laidOut(close: () => void): () => void {
  Object.defineProperty(HTMLElement.prototype, "getClientRects", { configurable: true, value: () => A_BOX });
  return () => {
    unlaid();
    close();
  };
}

async function openThread(channel: string): Promise<() => void> {
  await adminClient().createChannel({ name: channel });
  const { message } = await adminClient().createMessage({ channel, text: "The parent." });
  await adminClient().createMessage({ channel, replyTo: message.id, text: "The reply." });
  const close = laidOut(openAt({ client: adminClient(), hash: `#/channels/${channel}/threads/${String(message.id)}` }));
  await inThread().findByText("The reply.");
  await screen.findByRole("feed", { name: "Messages" });
  return close;
}

const REGIONS = [
  ["aside", "panel"],
  ["nav", "sidebar"],
  ["form", "box"],
  ["section", "messages"],
] as const;

function focusedName(): string {
  const active = globalThis.document.activeElement;
  for (const [selector, name] of REGIONS) {
    if (active !== null && active.closest(selector) !== null) {
      return name;
    }
  }
  return "";
}

function replyArticle(): HTMLElement {
  const article = inThread().getByText("The reply.").closest("article");
  if (article === null) {
    throw new TypeError("The reply is in no article");
  }
  return article;
}

function outOfRegions(): void {
  const active = globalThis.document.activeElement;
  if (active instanceof HTMLElement) {
    active.blur();
  }
}

function pressed(chord: Readonly<typeof NEXT | typeof PREVIOUS>): string {
  fireEvent.keyDown(globalThis.document.activeElement ?? globalThis.document.body, chord);
  return focusedName();
}

it("ctrl+] and ctrl+[ cycle the sidebar, the messages and the thread panel, the message box counting as the messages", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const close = await openThread("web-regions-cycle");
  screen.getByLabelText("Message").focus();
  const forward = [pressed(NEXT), pressed(NEXT), pressed(NEXT), pressed(NEXT)];
  const back = [pressed(PREVIOUS), pressed(PREVIOUS)];

  expect([forward, back]).toStrictEqual([
    ["panel", "sidebar", "messages", "panel"],
    ["messages", "sidebar"],
  ]);

  close();
});

it("from outside every region, ctrl+] goes to the first and ctrl+[ to the last", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const close = await openThread("web-regions-outside");
  outOfRegions();
  const first = pressed(NEXT);
  outOfRegions();
  const last = pressed(PREVIOUS);

  expect([first, last]).toStrictEqual(["sidebar", "panel"]);

  close();
});

it("with no region laid out, ctrl+] moves nothing and leaves the key", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const close = await openThread("web-regions-none");
  unlaid();
  const box = screen.getByLabelText("Message");
  box.focus();
  const left = fireEvent.keyDown(box, NEXT);

  expect([left, globalThis.document.activeElement]).toStrictEqual([true, box]);

  close();
});

it("escape in the thread panel closes it, with focus on the channel message", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const close = await openThread("web-regions-close-thread");
  const reply = replyArticle();
  reply.focus();
  fireEvent.keyDown(reply, { key: "Escape" });
  await waitFor(() => {
    expect(globalThis.document.querySelector("main aside")).toBeNull();
  });

  expect([globalThis.location.hash, globalThis.document.activeElement]).toStrictEqual([
    "#/channels/web-regions-close-thread",
    screen.getByRole("feed", { name: "Messages" }).querySelector("article"),
  ]);

  close();
});

it("escape in a thread panel with no close link leaves the panel open", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const close = await openThread("web-regions-no-close-link");
  for (const link of globalThis.document.querySelectorAll("main aside > header a[href]")) {
    link.removeAttribute("href");
  }
  const reply = replyArticle();
  reply.focus();
  fireEvent.keyDown(reply, { key: "Escape" });

  expect([globalThis.location.hash, globalThis.document.querySelector("main aside") === null]).toStrictEqual([
    expect.stringMatching(/^#\/channels\/web-regions-no-close-link\/threads\/\d+$/u),
    false,
  ]);

  close();
});

it("with the messages in no labelled region, ctrl+] goes from the sidebar into the feed itself", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const close = await openThread("web-regions-unlabelled");
  for (const section of globalThis.document.querySelectorAll("main section[aria-label]")) {
    section.removeAttribute("aria-label");
  }
  outOfRegions();
  pressed(NEXT);
  pressed(NEXT);
  const feed = screen.getByRole("feed", { name: "Messages" });

  expect(feed.contains(globalThis.document.activeElement)).toBe(true);

  close();
});

it("on a page with no channel messages, ctrl+] goes from the sidebar to the next region shown", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const close = laidOut(openAt({ client: adminClient(), hash: "#/people" }));
  await screen.findByRole("navigation", { name: "Sidebar" });
  outOfRegions();
  const first = pressed(NEXT);

  expect(first).toBe("sidebar");

  close();
});
