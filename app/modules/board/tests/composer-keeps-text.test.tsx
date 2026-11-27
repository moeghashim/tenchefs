import { expect, it } from "vitest";
import { createComposer } from "../../composer/index.ts";
import { memoryStorage } from "../../testing/web.ts";
import { opened } from "./held-store.ts";

async function noCrop(): Promise<null> {
  await Promise.resolve();
  return null;
}

const START = 0;

it("while nobody is logged in, a box's unsent text is kept on the page only, suggesting no Webhook commands until they load", {
  timeout: 5000,
}, () => {
  expect.hasAssertions();

  const storage = memoryStorage();
  const composer = createComposer({ boardStore: opened().store, crop: noCrop, storage });
  const draft = composer.channelDraft("web-kept-nobody");
  draft.edit("/", "/".length);
  const typed = draft.snapshot();
  const again = composer.channelDraft("web-kept-nobody").snapshot().text;
  draft.edit("", START);

  expect([typed.text, typed.webhookCommands, again, draft.snapshot().text, storage.kept().size]).toStrictEqual([
    "/",
    [],
    "/",
    "",
    START,
  ]);
});
