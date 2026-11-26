import { expect, it } from "vitest";
import { feedOf, idOf, postedIn } from "./feed.ts";
import { fireEvent, waitFor } from "@testing-library/react";
import { inPane, inThread } from "./regions.ts";
import type { Posted } from "./feed.ts";
import { openAt } from "./render.tsx";

const CLOSING = "Done a.";

interface Landing {
  readonly name: string;
  readonly texts: readonly string[];
  readonly folded: readonly string[];
  readonly lands: string;
}

const LANDINGS: readonly Landing[] = [
  {
    folded: ["Open one.", "<1 closed thread>", "After."],
    lands: "After.",
    name: "after",
    texts: ["Open one.", CLOSING, "After."],
  },
  { folded: ["Open one.", "<1 closed thread>"], lands: "Open one.", name: "before", texts: ["Open one.", CLOSING] },
  { folded: ["<1 closed thread>"], lands: "1 closed thread", name: "fold", texts: [CLOSING] },
];

function focusedText(): string {
  const focused = globalThis.document.activeElement;
  if (focused === null) {
    return "";
  }
  return focused.textContent;
}

async function article(region: ReturnType<typeof inPane>, text: string): Promise<HTMLElement> {
  const found = await region.findByText(text);
  const shown = found.closest("article");
  if (!(shown instanceof HTMLElement)) {
    throw new TypeError(`${text} is in no message`);
  }
  return shown;
}

async function followedWithNews({ name, texts }: Landing): Promise<Posted> {
  const posted = await postedIn({ channel: `web-close-folds-${name}`, closed: [], texts });
  const parent = idOf({ posted, text: CLOSING });
  await posted.reader.follow(parent);
  await posted.poster.createMessage({ channel: posted.channel, replyTo: parent, text: "One more thing." });
  return posted;
}

async function folded(landing: Landing): Promise<void> {
  await waitFor(async () => {
    await expect(feedOf(landing.texts)).resolves.toStrictEqual(landing.folded);
  });
}

async function landed(text: string): Promise<void> {
  await waitFor(() => {
    expect(focusedText()).toContain(text);
  });
}

it.each(LANDINGS)(
  "x on a channel message whose thread has news folds it away at once, focus landing $name it",
  {
    timeout: 10_000,
  },
  async (landing) => {
    expect.hasAssertions();

    const posted = await followedWithNews(landing);
    const close = openAt({ client: posted.reader, hash: `#/channels/${posted.channel}` });
    const message = await article(inPane(), CLOSING);
    message.focus();
    fireEvent.keyDown(message, { key: "x" });
    await folded(landing);

    await expect(landed(landing.lands)).resolves.toBeUndefined();

    close();
  },
);

interface PanelLanding extends Landing {
  readonly key: string;
}

const PANEL_LANDINGS: readonly PanelLanding[] = LANDINGS.flatMap((landing) => [
  { ...landing, key: "ArrowLeft" },
  { ...landing, key: "Escape" },
]);

it.each(PANEL_LANDINGS)(
  "$key from a closed thread's panel lands $name the fold holding it",
  { timeout: 10_000 },
  async (landing) => {
    expect.hasAssertions();

    const posted = await postedIn({
      channel: `web-close-folds-${landing.key.toLowerCase()}-${landing.name}`,
      closed: [CLOSING],
      texts: landing.texts,
    });
    const thread = idOf({ posted, text: CLOSING });
    const close = openAt({ client: posted.reader, hash: `#/channels/${posted.channel}/threads/${String(thread)}` });
    await folded(landing);
    const parent = await article(inThread(), CLOSING);
    parent.focus();
    fireEvent.keyDown(parent, { key: landing.key });

    await expect(landed(landing.lands)).resolves.toBeUndefined();

    close();
  },
);
