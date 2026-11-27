import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { NewAttachment } from "../../sdk/index.ts";
import { adminClient } from "./identities.ts";
import { hillsPng } from "../../testing/index.ts";
import { inPane } from "./regions.ts";
import { openWithClockStopped } from "./clock.ts";
import { postedWithFiles } from "./attachment-posts.ts";

const NOTES: NewAttachment = { bytes: new TextEncoder().encode("notes"), name: "notes.txt" };
const PREVIOUS = "Previous image";
const NEXT = "Next image";
const NONE = 0;
const ONCE = 1;
const PAST_THE_LAST = 4;

interface Viewer {
  readonly name: string;
  readonly detail: string | null;
  readonly counter: string;
  readonly previous: boolean;
  readonly next: boolean;
}

function image(name: string): NewAttachment {
  return { bytes: hillsPng(), name };
}

async function openOn(channel: string, attachments: readonly NewAttachment[]): Promise<() => void> {
  await adminClient().createChannel({ name: channel });
  await postedWithFiles({ attachments, channel, client: adminClient(), text: "Photos" });
  const close = openWithClockStopped({ client: adminClient(), hash: `#/channels/${channel}` });
  await inPane().findByRole("list", { name: "Attachments" });
  return close;
}

async function fourImages(channel: string): Promise<() => void> {
  const close = await openOn(channel, [image("a.png"), NOTES, image("b.png"), image("c.png"), image("d.png")]);
  return close;
}

function dialog(): HTMLElement {
  return screen.getByRole("dialog");
}

function described(): string | null {
  const id = dialog().getAttribute("aria-describedby") ?? "";
  const found = globalThis.document.querySelector(`#${CSS.escape(id)}`);
  if (found === null) {
    return null;
  }
  return found.textContent;
}

function counter(): string {
  const texts: string[] = [];
  for (const each of within(dialog()).queryAllByRole("status")) {
    texts.push(each.textContent);
  }
  return texts.join("");
}

function viewer(): Viewer {
  const shown = dialog();
  return {
    counter: counter(),
    detail: described(),
    name: within(shown).getByRole("img").getAttribute("alt") ?? "",
    next: within(shown).queryByRole("button", { name: NEXT }) !== null,
    previous: within(shown).queryByRole("button", { name: PREVIOUS }) !== null,
  };
}

function pressed(key: string, times: number): void {
  for (let press = NONE; press < times; press += ONCE) {
    fireEvent.keyDown(dialog(), { key });
  }
}

async function opened(name: string): Promise<HTMLElement> {
  fireEvent.click(await inPane().findByRole("button", { name }));
  const shown = await screen.findByRole("dialog", { name });
  return shown;
}

it("the Right key shows the message's next image and the Left key its previous one", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = await fourImages("web-carousel-keys");
  const shown = await opened("b.png");
  fireEvent.keyDown(shown, { key: "ArrowRight" });
  const right = viewer().name;
  fireEvent.keyDown(dialog(), { key: "ArrowLeft" });
  fireEvent.keyDown(dialog(), { key: "ArrowLeft" });

  expect([right, viewer().name]).toStrictEqual(["c.png", "a.png"]);

  close();
});

it("the viewer's arrows move between the message's images, skipping its other files", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = await fourImages("web-carousel-arrows");
  await opened("b.png");
  fireEvent.click(within(dialog()).getByRole("button", { name: NEXT }));
  const next = viewer();
  fireEvent.click(within(dialog()).getByRole("button", { name: PREVIOUS }));
  fireEvent.click(within(dialog()).getByRole("button", { name: PREVIOUS }));

  expect([next, viewer()]).toStrictEqual([
    { counter: "3 / 4", detail: "1.2 KB", name: "c.png", next: true, previous: true },
    { counter: "1 / 4", detail: "1.2 KB", name: "a.png", next: true, previous: false },
  ]);

  close();
});

it("the viewer stops at the first and last image, with no arrow past them", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = await fourImages("web-carousel-ends");
  await opened("a.png");
  pressed("ArrowLeft", ONCE);
  const atFirst = viewer();
  pressed("ArrowRight", PAST_THE_LAST);

  expect([atFirst, viewer()]).toStrictEqual([
    { counter: "1 / 4", detail: "1.2 KB", name: "a.png", next: true, previous: false },
    { counter: "4 / 4", detail: "1.2 KB", name: "d.png", next: false, previous: true },
  ]);

  close();
});

it("a message with one image shows it with no arrows and no counter", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = await openOn("web-carousel-single", [image("solo.png"), NOTES]);
  const shown = await opened("solo.png");
  fireEvent.keyDown(shown, { key: "ArrowRight" });

  expect(viewer()).toStrictEqual({ counter: "", detail: "1.2 KB", name: "solo.png", next: false, previous: false });

  close();
});

it("closing the viewer puts focus on the thumbnail of the image it showed last", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = await fourImages("web-carousel-focus");
  const shown = await opened("b.png");
  fireEvent.keyDown(shown, { key: "ArrowRight" });
  fireEvent.keyDown(dialog(), { key: "Escape" });

  await waitFor(() => {
    expect(globalThis.document.activeElement).toBe(inPane().getByRole("button", { name: "c.png" }));
  });

  close();
});

it("the Left key on the first image moves nothing behind the viewer", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = await fourImages("web-carousel-behind");
  await opened("a.png");
  pressed("ArrowLeft", ONCE);

  expect(dialog().contains(globalThis.document.activeElement)).toBe(true);

  close();
});
