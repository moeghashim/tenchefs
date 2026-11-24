import type { Identity, IdentityName } from "../../sdk/index.ts";
import { useContext, useSyncExternalStore } from "react";
import { AuthorList } from "./author-list.ts";
import type { Composer } from "../../composer/index.ts";
import { DisplayNameField } from "./display-name-field.tsx";
import type { ReactNode } from "react";
import { identityList } from "../../board/index.ts";

const TEXT = { own: "Your display name" } as const;

interface DisplayNamesProps {
  readonly composer: Composer;
  readonly me: IdentityName;
}

function ownedBy(listed: readonly Identity[], me: IdentityName): readonly Identity[] {
  return listed.filter((identity) => identity.kind === "agent" && identity.owner === String(me));
}

function savedOf(listed: readonly Identity[], name: IdentityName): string | null {
  for (const identity of listed) {
    if (identity.name === name) {
      return identity.displayName ?? null;
    }
  }
  return null;
}

export function DisplayNames(props: DisplayNamesProps): ReactNode {
  const { composer, me } = props;
  const store = useContext(AuthorList);
  const listed = useSyncExternalStore(store.subscribeShowing("identities"), () => identityList(store.snapshot()));
  return (
    <>
      <DisplayNameField
        draft={composer.displayName(me)}
        field={TEXT.own}
        label={TEXT.own}
        saved={savedOf(listed, me)}
      />
      {ownedBy(listed, me).map((agent) => (
        <DisplayNameField
          draft={composer.displayName(agent.name)}
          field={`@${agent.name}`}
          key={agent.name}
          label={`Display name of @${agent.name}`}
          saved={agent.displayName ?? null}
        />
      ))}
    </>
  );
}
