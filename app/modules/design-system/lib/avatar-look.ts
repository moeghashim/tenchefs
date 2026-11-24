const HUES = [
  "bg-[oklch(var(--avatar-lightness)_var(--avatar-chroma)_250)]",
  "bg-[oklch(var(--avatar-lightness)_var(--avatar-chroma)_290)]",
  "bg-[oklch(var(--avatar-lightness)_var(--avatar-chroma)_335)]",
  "bg-[oklch(var(--avatar-lightness)_var(--avatar-chroma)_20)]",
  "bg-[oklch(var(--avatar-lightness)_var(--avatar-chroma)_60)]",
  "bg-[oklch(var(--avatar-lightness)_var(--avatar-chroma)_145)]",
  "bg-[oklch(var(--avatar-lightness)_var(--avatar-chroma)_180)]",
  "bg-[oklch(var(--avatar-lightness)_var(--avatar-chroma)_215)]",
] as const;

const LARGEST = 2_147_483_647;
const MULTIPLIER = 31;
const FIRST = 0;
const BOTH = 2;
const ONE = 1;

function hashOf(name: string): number {
  let value = 0;
  for (const character of name) {
    value = (value * MULTIPLIER + Number(character.codePointAt(FIRST))) % LARGEST;
  }
  return value;
}

function hueOf(name: string): string {
  const hue = hashOf(name) % HUES.length;
  return HUES.slice(hue, hue + ONE).join("");
}

function initialsOf(name: string): string {
  const parts = name.split("-").filter((part) => part !== "");
  if (parts.length < BOTH) {
    return name.charAt(FIRST).toUpperCase();
  }
  return parts
    .slice(FIRST, BOTH)
    .map((part) => part.charAt(FIRST))
    .join("")
    .toUpperCase();
}

export { hueOf, initialsOf };
