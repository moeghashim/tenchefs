import { GROUPS, KEYS, SCOPES } from "./keys.ts";
import { chordOf, shownOf } from "./chords.ts";
import type { Key } from "./keys.ts";
import type { Platform } from "./chords.ts";

interface Listed {
  readonly does: string;
  readonly chords: readonly string[];
}

interface ListedGroup {
  readonly heading: string;
  readonly shortcuts: readonly Listed[];
}

const NONE = 0;

function listedOf(keys: readonly Key[], platform: Platform): readonly Listed[] {
  const firsts = keys.filter((key, index) => keys.findIndex((each) => each.action === key.action) === index);
  return firsts.map((first) => ({
    chords: keys
      .filter((key) => key.action === first.action)
      .map((key) => shownOf({ chord: chordOf(key.chord), platform })),
    does: first.does,
  }));
}

function shortcutListOf(platform: Platform): readonly ListedGroup[] {
  return SCOPES.toReversed()
    .map(
      (scope): ListedGroup => ({
        heading: GROUPS[scope],
        shortcuts: listedOf(
          KEYS.filter((key) => key.scope === scope),
          platform,
        ),
      }),
    )
    .filter(({ shortcuts }) => shortcuts.length > NONE);
}

export { type ListedGroup, shortcutListOf };
