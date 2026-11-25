import type { ActionMenuParts, MenuChoice } from "./menu-parts.ts";
import { IdentityCardComposer, IdentityCards } from "./identity-card-parts.ts";
import type { PersonActs, PersonKeysSource } from "./person-keys-parts.ts";
import { useContext, useMemo, useSyncExternalStore } from "react";
import { PersonKeys } from "./person-keys-parts.ts";

const TEXT = { copied: "Copied", copyName: "Copy name", message: "Message", viewProfile: "View profile" } as const;

interface PersonMenuOf {
  readonly name: string;
  readonly profileHref: string;
}

interface PersonMenu extends ActionMenuParts {
  readonly buttonLabel: string;
  readonly acts: PersonActs;
  readonly keys: PersonKeysSource;
}

interface PersonChoicesOf extends PersonMenuOf {
  readonly compose: ((name: string) => void) | null;
  readonly deactivated: boolean;
  readonly keys: PersonKeysSource;
}

interface Choosing {
  readonly person: PersonChoicesOf;
  readonly copyName: () => void;
}

function messageChoices({ person }: Choosing): readonly MenuChoice[] {
  const { compose, name } = person;
  if (compose === null) {
    return [];
  }
  const write = compose;
  function message(): void {
    write(name);
  }
  return [
    {
      disabled: person.deactivated,
      href: null,
      icon: "message",
      keys: person.keys.shortcuts.message,
      label: TEXT.message,
      onSelect: message,
    },
  ];
}

async function copyAfter(previous: Promise<void>, text: string): Promise<void> {
  await previous;
  await globalThis.navigator.clipboard.writeText(text);
}

function personChoices(choosing: Choosing): readonly MenuChoice[] {
  const { person } = choosing;
  return [
    {
      href: person.profileHref,
      icon: "view-profile",
      keys: person.keys.shortcuts.viewProfile,
      label: TEXT.viewProfile,
      onSelect: null,
    },
    ...messageChoices(choosing),
    {
      href: null,
      icon: "copy-name",
      keys: person.keys.shortcuts.copyName,
      label: TEXT.copyName,
      onSelect: choosing.copyName,
    },
  ];
}

function viewProfileAct(profileHref: string): () => boolean {
  return () => {
    globalThis.location.assign(profileHref);
    return true;
  };
}

function messageAct({ compose, deactivated, name }: PersonChoicesOf): PersonActs["message"] {
  if (compose === null) {
    return null;
  }
  const write = compose;
  return () => {
    if (deactivated) {
      return false;
    }
    write(name);
    return true;
  };
}

function personMenuOf(person: PersonChoicesOf): PersonMenu {
  const handle = `@${person.name}`;
  let copying = Promise.resolve();
  function copyName(): void {
    copying = copyAfter(copying, handle);
    person.keys.announce(`${TEXT.copied} ${handle}`);
  }
  const label = `${handle} actions`;
  return {
    acts: {
      copyName: () => {
        copyName();
        return true;
      },
      message: messageAct(person),
      viewProfile: viewProfileAct(person.profileHref),
    },
    buttonLabel: label,
    choices: personChoices({ copyName, person }),
    keys: person.keys,
    label,
  };
}

function usePersonMenu({ name, profileHref }: PersonMenuOf): PersonMenu | null {
  const compose = useContext(IdentityCardComposer);
  const keys = useContext(PersonKeys);
  const source = useContext(IdentityCards);
  const card = useSyncExternalStore(source.subscribe, () => source.cardOf(name));
  const known = card !== null;
  const deactivated = known && card.deactivated;
  return useMemo(() => {
    if (!known || keys === null) {
      return null;
    }
    return personMenuOf({ compose, deactivated, keys, name, profileHref });
  }, [compose, deactivated, keys, known, name, profileHref]);
}

export { usePersonMenu };
