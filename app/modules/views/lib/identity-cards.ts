import type { IdentityCardParts, IdentityCardSource } from "../../design-system/index.tsx";
import type { BoardStore } from "../../board/index.ts";
import type { Identities } from "../../composer/index.ts";
import type { Identity } from "../../sdk/index.ts";
import { hrefOf } from "../../paths/index.ts";
import { kindOf } from "./kind-of.ts";
import { onTick } from "./use-time-ago.ts";
import { presences } from "../../board/index.ts";
import { shownIn } from "./use-presence.ts";

interface Lists {
  readonly identities: Identities;
  readonly boardStore: BoardStore;
}

interface Drawn {
  readonly key: string;
  readonly card: IdentityCardParts;
}

function descriptionOf(identity: Identity): string | null {
  if (identity.kind === "agent") {
    return identity.description ?? null;
  }
  return null;
}

function cardFor(lists: Lists, identity: Identity): IdentityCardParts {
  return {
    agent: identity.kind === "agent",
    deactivated: identity.deactivated === true,
    description: descriptionOf(identity),
    displayName: identity.displayName ?? null,
    kind: kindOf(identity),
    name: identity.name,
    presence: shownIn({ name: identity.name, presences: presences(lists.boardStore.snapshot()) }),
    profileHref: hrefOf({ identity: identity.name, name: "profile" }),
  };
}

export function createIdentityCards(lists: Lists): IdentityCardSource {
  const drawn = new Map<string, Drawn>();
  return {
    cardOf: (name) => {
      const identity = lists.identities.snapshot().find((listed) => listed.name === name) ?? null;
      if (identity === null) {
        return null;
      }
      const card = cardFor(lists, identity);
      const key = JSON.stringify(card);
      const before = drawn.get(name) ?? { card, key: "" };
      if (before.key === key) {
        return before.card;
      }
      drawn.set(name, { card, key });
      return card;
    },
    subscribe: (listener) => {
      const stops = [
        lists.identities.subscribe(listener),
        lists.boardStore.subscribeShowing("presence")(listener),
        onTick(listener),
      ];
      return () => {
        for (const stop of stops) {
          stop();
        }
      };
    },
  };
}
