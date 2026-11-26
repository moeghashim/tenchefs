import type { ExternalStore, HandLive, Publishes } from "../../testing/web.ts";
import { adminClient, opened } from "./held-store.ts";
import { expect, it, onTestFinished, vi } from "vitest";
import { memoryStorage, recordPublishes } from "../../testing/web.ts";
import type { Composer } from "../../composer/index.ts";
import type { IdentityName } from "../../sdk/index.ts";
import { createComposer } from "../../composer/index.ts";
import { createTestAgent } from "../../testing/index.ts";
import { waitFor } from "@testing-library/react";

const NONE = 0;
const CARET = 1;

interface Composing {
  readonly composer: Composer;
  readonly hand: HandLive;
  readonly admin: IdentityName;
}

function storesOf({ admin, composer }: Composing): readonly ExternalStore<unknown>[] {
  const actions = composer.identities.actions(admin);
  return [
    composer.channelDraft("general"),
    composer.draft("general/1", () => [admin]),
    {
      snapshot: () => [composer.identities.snapshot(), composer.identities.adminChange()],
      subscribe: composer.identities.subscribe,
    },
    actions,
    { snapshot: actions.snapshot, subscribe: actions.subscribeToSessions },
    { snapshot: actions.snapshot, subscribe: actions.subscribeToMessages },
    composer.identities.creation,
    composer.identities.deletion,
    composer.displayName(admin),
    composer.description(admin),
    composer.trigger(admin),
  ];
}

async function composing(): Promise<Composing> {
  const { identity } = await adminClient().whoami();
  const { hand, store } = opened();
  const composer = createComposer({ boardStore: store, storage: memoryStorage() });
  return { admin: identity.name, composer, hand };
}

async function recordedOnceLoaded(
  stores: readonly ExternalStore<unknown>[],
  composer: Composer,
): Promise<readonly Publishes[]> {
  for (const store of stores) {
    onTestFinished(store.subscribe(vi.fn<() => void>()));
  }
  await waitFor(() => {
    expect(composer.identities.snapshot()).not.toHaveLength(NONE);
  });
  return stores.map((store) => recordPublishes(store));
}

it("someone coming online publishes nothing from the composer's stores", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const composed = await composing();
  const publishes = await recordedOnceLoaded(storesOf(composed), composed.composer);

  composed.hand.send({ presence: { identity: composed.admin, online: true }, type: "presence" });
  composed.hand.send({ presence: { identity: composed.admin, online: false }, type: "presence" });

  expect(publishes.map((store) => store.count())).toStrictEqual(publishes.map(() => NONE));
});

it("a draft publishes nothing when dismissed again, or moving a highlight it has none to move", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { admin, composer } = await composing();
  const draft = composer.draft("web-composer-publishes/1", () => [admin]);
  onTestFinished(draft.subscribe(vi.fn<() => void>()));
  draft.edit("Lunch?", CARET);
  draft.dismiss();
  const publishes = recordPublishes(draft);

  draft.dismiss();
  draft.highlight("down");

  expect(publishes.count()).toBe(NONE);
});

it("the profile's stores publish nothing for an edit that changes nothing", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { admin, composer } = await composing();
  const actions = composer.identities.actions(admin);
  const stores = [actions, composer.identities.creation, composer.identities.deletion, composer.trigger(admin)];
  const publishes = await recordedOnceLoaded(stores, composer);

  actions.cancel();
  actions.forgetToken();
  composer.identities.deletion.dismiss();
  composer.identities.creation.edit("");

  expect(publishes.map((store) => store.count())).toStrictEqual(publishes.map(() => NONE));
});

it("an identity deleted while its profile is not open publishes nothing from the identity deletion", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { identity } = await createTestAgent({ by: adminClient(), name: "web-composer-deleted-bot", owner: "admin" });
  const composed = await composing();
  const { identities } = composed.composer;
  await recordedOnceLoaded([identities], composed.composer);
  const deletion = recordPublishes(identities.deletion);

  composed.hand.send({ identity, type: "identity-deleted" });

  expect(deletion.count()).toBe(NONE);
});
