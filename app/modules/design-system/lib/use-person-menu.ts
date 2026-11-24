import type { ActionMenuParts, MenuChoice } from "./menu-parts.ts";
import { IdentityCardComposer, IdentityCards } from "./identity-card-parts.ts";
import { useContext, useMemo, useSyncExternalStore } from "react";

const TEXT = { copyName: "Copy name", message: "Message", viewProfile: "View profile" } as const;

interface PersonMenuOf {
  readonly name: string;
  readonly profileHref: string;
}

interface PersonMenu extends ActionMenuParts {
  readonly buttonLabel: string;
}

interface PersonChoicesOf extends PersonMenuOf {
  readonly compose: ((name: string) => void) | null;
  readonly deactivated: boolean;
}

function messageChoices({ compose, deactivated, name }: PersonChoicesOf): readonly MenuChoice[] {
  if (compose === null) {
    return [];
  }
  const write = compose;
  function message(): void {
    write(name);
  }
  return [{ disabled: deactivated, href: null, icon: "message", label: TEXT.message, onSelect: message }];
}

async function copyAfter(previous: Promise<void>, text: string): Promise<void> {
  await previous;
  await globalThis.navigator.clipboard.writeText(text);
}

function personChoices(person: PersonChoicesOf): readonly MenuChoice[] {
  const handle = `@${person.name}`;
  let copying = Promise.resolve();
  function copyName(): void {
    copying = copyAfter(copying, handle);
  }
  return [
    { href: person.profileHref, icon: "view-profile", label: TEXT.viewProfile, onSelect: null },
    ...messageChoices(person),
    { href: null, icon: "copy-name", label: TEXT.copyName, onSelect: copyName },
  ];
}

function usePersonMenu({ name, profileHref }: PersonMenuOf): PersonMenu | null {
  const compose = useContext(IdentityCardComposer);
  const source = useContext(IdentityCards);
  const card = useSyncExternalStore(source.subscribe, () => source.cardOf(name));
  const known = card !== null;
  const deactivated = known && card.deactivated;
  return useMemo(() => {
    if (!known) {
      return null;
    }
    const label = `@${name} actions`;
    return {
      buttonLabel: label,
      choices: personChoices({ compose, deactivated, name, profileHref }),
      label,
    };
  }, [compose, deactivated, known, name, profileHref]);
}

export { usePersonMenu };
