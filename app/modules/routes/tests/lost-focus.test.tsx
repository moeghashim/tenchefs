import { expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { adminClient } from "./identities.ts";
import { inThread } from "./regions.ts";
import { openAt } from "./render.tsx";

const A_TASK = 0;
const A_BOX = [{ bottom: 1, height: 1, left: 0, right: 1, top: 0, width: 1 }];

function laidOut(close: () => void): () => void {
  Object.defineProperty(HTMLElement.prototype, "getClientRects", { configurable: true, value: () => A_BOX });
  return () => {
    Reflect.deleteProperty(HTMLElement.prototype, "getClientRects");
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

function articleSaying(text: string): HTMLElement {
  const article = screen.getByText(text).closest("article");
  if (article === null) {
    throw new TypeError(`"${text}" is in no article`);
  }
  return article;
}

function focusedAndGone(): void {
  const link = globalThis.document.createElement("a");
  link.href = "#/";
  globalThis.document.body.append(link);
  link.focus();
  link.remove();
}

async function aTaskLater(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<boolean>();
  globalThis.setTimeout(() => {
    resolve(true);
  }, A_TASK);
  await promise;
}

function isOnNothing(): boolean {
  const { activeElement, body } = globalThis.document;
  return activeElement === null || activeElement === body;
}

it("↓ on the body lands focus back on what last had focus, and does nothing else", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const close = await openThread("web-lost-focus-key");
  const reply = articleSaying("The reply.");
  reply.focus();
  reply.blur();
  await Promise.resolve();
  const left = fireEvent.keyDown(globalThis.document.body, { key: "ArrowDown" });

  expect([left, globalThis.document.activeElement]).toStrictEqual([false, reply]);

  close();
});

it("with the thread panel gone from under focus, focus lands on the channel's message", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const close = await openThread("web-lost-focus-panel");
  articleSaying("The reply.").focus();
  globalThis.location.hash = "#/channels/web-lost-focus-panel";
  await waitFor(() => {
    expect(globalThis.document.querySelector("main aside")).toBeNull();
  });
  await waitFor(() => {
    expect(globalThis.document.activeElement).toBe(articleSaying("The parent."));
  });

  close();
});

it("with an element outside every list gone from under focus, focus still lands", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const close = await openThread("web-lost-focus-outside");
  focusedAndGone();
  await waitFor(() => {
    expect(isOnNothing()).toBe(false);
  });

  close();
});

it("with an element gone from under focus, a move the app makes at once wins", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const close = await openThread("web-lost-focus-app-moves");
  focusedAndGone();
  await Promise.resolve();
  const reply = articleSaying("The reply.");
  reply.focus();
  await aTaskLater();

  expect(globalThis.document.activeElement).toBe(reply);

  close();
});
