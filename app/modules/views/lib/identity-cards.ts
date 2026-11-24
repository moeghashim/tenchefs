import type { IdentityCardLink, IdentityCardParts, IdentityCardSource } from "../../design-system/index.tsx";
import { identityList, presences } from "../../board/index.ts";
import type { BoardStore } from "../../board/index.ts";
import type { Identity } from "../../sdk/index.ts";
import { hrefOf } from "../../paths/index.ts";
import { kindOf } from "./kind-of.ts";
import { onTick } from "./use-time-ago.ts";
import { shownIn } from "./use-presence.ts";

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

function broughtInByOf(identity: Identity): IdentityCardLink | null {
  if (identity.kind !== "agent") {
    return null;
  }
  const name = identity.broughtInBy ?? null;
  if (name === null) {
    return null;
  }
  return { href: hrefOf({ identity: name, name: "profile" }), name };
}

function cardFor(boardStore: BoardStore, identity: Identity): IdentityCardParts {
  return {
    agent: identity.kind === "agent",
    broughtInBy: broughtInByOf(identity),
    deactivated: identity.deactivated === true,
    description: descriptionOf(identity),
    displayName: identity.displayName ?? null,
    kind: kindOf(identity),
    name: identity.name,
    presence: shownIn({ name: identity.name, presences: presences(boardStore.snapshot()) }),
    profileHref: hrefOf({ identity: identity.name, name: "profile" }),
  };
}

export function createIdentityCards(boardStore: BoardStore): IdentityCardSource {
  const drawn = new Map<string, Drawn>();
  return {
    cardOf: (name) => {
      const identity = identityList(boardStore.snapshot()).find((listed) => listed.name === name) ?? null;
      if (identity === null) {
        return null;
      }
      const card = cardFor(boardStore, identity);
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
        boardStore.subscribeShowing("identities")(listener),
        boardStore.subscribeShowing("presence")(listener),
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
