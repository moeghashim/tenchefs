import type { Shortcut } from "./shortcut.ts";
import { createContext } from "react";

interface Focused {
  readonly target: EventTarget | null;
}

type PersonAct = (focused: Focused) => boolean;

interface PersonActs {
  readonly viewProfile: PersonAct;
  readonly message: PersonAct | null;
  readonly copyName: PersonAct;
}

interface BoundPerson {
  readonly acts: PersonActs;
  readonly within: () => Element | null;
}

interface PersonKeysSource {
  readonly shortcuts: Readonly<Record<keyof PersonActs, Shortcut>>;
  readonly bind: (person: BoundPerson) => () => void;
  readonly announce: (text: string) => void;
}

const PersonKeys = createContext<PersonKeysSource | null>(null);

export { PersonKeys };
export type { PersonActs, PersonKeysSource };
