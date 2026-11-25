import type { PersonActs, PersonKeysSource } from "./person-keys-parts.ts";
import { useEffect } from "react";

interface PersonKeysOf {
  readonly person: { readonly acts: PersonActs; readonly keys: PersonKeysSource } | null;
  readonly within: () => Element | null;
}

function bound({ person, within }: PersonKeysOf): readonly (() => void)[] {
  if (person === null) {
    return [];
  }
  return [person.keys.bind({ acts: person.acts, within })];
}

function usePersonKeys({ person, within }: PersonKeysOf): void {
  useEffect(() => {
    const unbinds = bound({ person, within });
    return (): void => {
      for (const unbind of unbinds) {
        unbind();
      }
    };
  }, [person, within]);
}

export { usePersonKeys };
