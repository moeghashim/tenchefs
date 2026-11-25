type Modifier = "Alt" | "Control" | "Mod" | "Shift";

interface Chord {
  readonly key: string;
  readonly modifiers: ReadonlySet<Modifier>;
}

type Pressed = Pick<KeyboardEvent, "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey">;

const MODIFIERS: ReadonlySet<string> = new Set<Modifier>(["Alt", "Control", "Mod", "Shift"]);
const SEPARATOR = "+";
const ONE = 1;
const FIRST = 0;

type Platform = "mac" | "other";

interface Labelling {
  readonly chord: Chord;
  readonly platform: Platform;
}

interface Matching extends Labelling {
  readonly event: Pressed;
}

interface Names {
  readonly aria: Readonly<Record<Modifier, string>>;
  readonly shown: Readonly<Record<Modifier, string>>;
  readonly join: string;
}

const NAMES: Readonly<Record<Platform, Names>> = {
  mac: {
    aria: { Alt: "Alt", Control: "Control", Mod: "Meta", Shift: "Shift" },
    join: "",
    shown: { Alt: "⌥", Control: "⌃", Mod: "⌘", Shift: "⇧" },
  },
  other: {
    aria: { Alt: "Alt", Control: "Control", Mod: "Control", Shift: "Shift" },
    join: SEPARATOR,
    shown: { Alt: "Alt", Control: "Ctrl", Mod: "Ctrl", Shift: "Shift" },
  },
};

const SHOWN_KEYS: Readonly<Partial<Record<string, string>>> = {
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  Escape: "Esc",
};

function isModifier(part: string): part is Modifier {
  return MODIFIERS.has(part);
}

function keyOf(written: string): string {
  if (written.endsWith(SEPARATOR)) {
    return SEPARATOR;
  }
  return written.slice(written.lastIndexOf(SEPARATOR) + ONE);
}

function chordOf(written: string): Chord {
  const parts = written.split(SEPARATOR);
  return { key: keyOf(written), modifiers: new Set(parts.slice(FIRST, -ONE).filter((part) => isModifier(part))) };
}

function isCharacter(key: string): boolean {
  return key.length === ONE;
}

function isModified(chord: Chord): boolean {
  return [...chord.modifiers].some((modifier) => modifier !== "Shift");
}

function primaryHeld({ chord, event, platform }: Matching): boolean {
  const control = chord.modifiers.has("Control") || (chord.modifiers.has("Mod") && platform === "other");
  const command = chord.modifiers.has("Mod") && platform === "mac";
  return event.ctrlKey === control && event.metaKey === command;
}

function shiftHeld(chord: Chord, event: Pressed): boolean {
  if (isCharacter(chord.key) && !isModified(chord)) {
    return true;
  }
  return event.shiftKey === chord.modifiers.has("Shift");
}

function keyMatches(chord: Chord, key: string): boolean {
  if (isCharacter(chord.key)) {
    return chord.key.toLowerCase() === key.toLowerCase() && (isModified(chord) || chord.key === key);
  }
  return chord.key === key;
}

function matches(matching: Matching): boolean {
  const { chord, event } = matching;
  return (
    keyMatches(chord, event.key) &&
    primaryHeld(matching) &&
    event.altKey === chord.modifiers.has("Alt") &&
    shiftHeld(chord, event)
  );
}

function keyName(chord: Chord): string {
  if (isCharacter(chord.key) && isModified(chord)) {
    return chord.key.toUpperCase();
  }
  return chord.key;
}

function ariaOf({ chord, platform }: Labelling): string {
  const { aria } = NAMES[platform];
  return [...[...chord.modifiers].map((modifier) => aria[modifier]), keyName(chord)].join(SEPARATOR);
}

function shownOf({ chord, platform }: Labelling): string {
  const { join, shown } = NAMES[platform];
  const key = SHOWN_KEYS[chord.key] ?? keyName(chord);
  return [...[...chord.modifiers].map((modifier) => shown[modifier]), key].join(join);
}

export { type Platform, ariaOf, chordOf, isModified, matches, shownOf };
