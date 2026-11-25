import type { Command, Identity, IdentityName } from "../../sdk/index.ts";
import type { KeptText } from "./kept-text.ts";
import { sameSnapshot } from "../../board/index.ts";

const MOST_SUGGESTIONS = 8;
const NOTHING = 0;
const AT_SIGN = 1;
const ONE = 1;
const STEPS = { down: ONE, up: -ONE } as const;

const typedMention = /(?<![\w.@-])@ ?[a-z0-9-]*$/iu;
const typedCommand = /^\/[a-z0-9-]*$/u;

function membersFirst(matches: readonly Identity[], members: readonly IdentityName[]): readonly Identity[] {
  const named = new Map(matches.map((identity) => [identity.name, identity] as const));
  const first = members.flatMap((name) => named.get(name) ?? []);
  return [...first, ...matches.filter((identity) => !members.includes(identity.name))];
}

function startsWithTyped(identity: Identity, prefix: string): boolean {
  const displayName = identity.displayName ?? "";
  return identity.name.startsWith(prefix) || displayName.toLowerCase().startsWith(prefix);
}

function suggestionsFor(sources: Sources, text: string, caret: number): readonly Identity[] {
  const found = typedMention.exec(text.slice(NOTHING, caret));
  if (found === null) {
    return [];
  }
  const [mention] = found;
  const prefix = mention.slice(AT_SIGN).trimStart().toLowerCase();
  const matches = sources
    .identities()
    .filter((identity) => identity.deactivated !== true && startsWithTyped(identity, prefix));
  return membersFirst(matches, sources.members()).slice(NOTHING, MOST_SUGGESTIONS);
}

function commandsFor(commands: readonly Command[], text: string): readonly Command[] {
  if (!typedCommand.test(text)) {
    return [];
  }
  const prefix = text.slice(ONE);
  return commands.filter((command) => command.name.startsWith(prefix)).slice(NOTHING, MOST_SUGGESTIONS);
}

interface DraftSnapshot {
  readonly text: string;
  readonly caret: number;
  readonly suggestions: readonly Identity[];
  readonly commands: readonly Command[];
  readonly command: Command | null;
  readonly highlighted: number;
  readonly returned: boolean;
  readonly dismissed: boolean;
  readonly focusRequests: number;
}

interface Sources {
  readonly identities: () => readonly Identity[];
  readonly commands: () => readonly Command[];
  readonly members: () => readonly IdentityName[];
}

const EMPTY = {
  caret: NOTHING,
  command: null,
  commands: [],
  dismissed: false,
  focusRequests: NOTHING,
  highlighted: NOTHING,
  returned: false,
  suggestions: [],
  text: "",
};

type Typed = Pick<DraftSnapshot, "caret" | "text">;

function written(sources: Sources, previous: DraftSnapshot, typed: Typed): DraftSnapshot {
  const { caret, text } = typed;
  const commands = commandsFor(sources.commands(), text);
  const suggestions = suggestionsFor(sources, text, caret);
  return {
    caret,
    command: previous.command,
    commands,
    dismissed: false,
    focusRequests: previous.focusRequests,
    highlighted: NOTHING,
    returned: false,
    suggestions,
    text,
  };
}

function mentions(text: string, name: string): boolean {
  return new RegExp(`(?<![\\w.@-])@${name}(?![a-z0-9-])`, "u").test(text);
}

function repliedTo(sources: Sources, snapshot: DraftSnapshot, name: string | null): DraftSnapshot {
  const deactivated = sources.identities().some((identity) => identity.name === name && identity.deactivated === true);
  let { text } = snapshot;
  if (name !== null && !deactivated && !mentions(text, name)) {
    text = `@${name} ${text}`;
  }
  const result = written(sources, snapshot, { caret: text.length, text });
  return { ...result, focusRequests: snapshot.focusRequests + ONE };
}

function mentioned(sources: Sources, snapshot: DraftSnapshot, name: string): DraftSnapshot {
  const before = snapshot.text.slice(NOTHING, snapshot.caret).replace(typedMention, "");
  const mention = `@${name} `;
  const text = before + mention + snapshot.text.slice(snapshot.caret);
  return written(sources, snapshot, { caret: before.length + mention.length, text });
}

function picked(snapshot: DraftSnapshot, commands: readonly Command[]): DraftSnapshot {
  let result = snapshot;
  for (const command of commands) {
    result = { ...EMPTY, caret: snapshot.caret, command, focusRequests: snapshot.focusRequests, text: snapshot.text };
  }
  return result;
}

function chosen(sources: Sources, snapshot: DraftSnapshot): DraftSnapshot {
  const at = snapshot.highlighted;
  let result = picked(snapshot, snapshot.commands.slice(at, at + ONE));
  for (const identity of snapshot.suggestions.slice(at, at + ONE)) {
    result = mentioned(sources, snapshot, identity.name);
  }
  return result;
}

function highlightMoved(snapshot: DraftSnapshot, direction: "down" | "up"): DraftSnapshot {
  const count = Math.max(ONE, snapshot.suggestions.length + snapshot.commands.length);
  return { ...snapshot, highlighted: (snapshot.highlighted + STEPS[direction] + count) % count };
}

function dismissed(snapshot: DraftSnapshot): DraftSnapshot {
  return { ...snapshot, commands: [], dismissed: true, highlighted: NOTHING, suggestions: [] };
}

function optionNames(snapshot: DraftSnapshot): readonly string[] {
  return [
    ...snapshot.commands.map((command) => command.name),
    ...snapshot.suggestions.map((identity) => identity.name),
  ];
}

function refreshed(sources: Sources, snapshot: DraftSnapshot): DraftSnapshot {
  if (snapshot.dismissed) {
    return snapshot;
  }
  const result = written(sources, snapshot, snapshot);
  const kept = optionNames(result).indexOf(optionNames(snapshot)[snapshot.highlighted] ?? "");
  return { ...result, highlighted: Math.max(NOTHING, kept), returned: snapshot.returned };
}

function unpicked(snapshot: DraftSnapshot): DraftSnapshot {
  return { ...dismissed(snapshot), command: null, returned: true };
}

interface Changes {
  readonly written: (previous: DraftSnapshot, typed: Typed) => DraftSnapshot;
  readonly mentioned: (snapshot: DraftSnapshot, name: string) => DraftSnapshot;
  readonly picked: (snapshot: DraftSnapshot, commands: readonly Command[]) => DraftSnapshot;
  readonly chosen: (snapshot: DraftSnapshot) => DraftSnapshot;
  readonly highlightMoved: (snapshot: DraftSnapshot, direction: "down" | "up") => DraftSnapshot;
  readonly dismissed: (snapshot: DraftSnapshot) => DraftSnapshot;
  readonly unpicked: (snapshot: DraftSnapshot) => DraftSnapshot;
  readonly repliedTo: (snapshot: DraftSnapshot, name: string | null) => DraftSnapshot;
  readonly refreshed: (snapshot: DraftSnapshot) => DraftSnapshot;
}

function changesFor(sources: Sources): Changes {
  return {
    chosen: (snapshot) => chosen(sources, snapshot),
    dismissed,
    highlightMoved,
    mentioned: (snapshot, name) => mentioned(sources, snapshot, name),
    picked,
    refreshed: (snapshot) => refreshed(sources, snapshot),
    repliedTo: (snapshot, name) => repliedTo(sources, snapshot, name),
    unpicked,
    written: (previous, typed) => written(sources, previous, typed),
  };
}

interface DraftChanges {
  readonly current: () => DraftSnapshot;
  readonly change: (update: (snapshot: DraftSnapshot) => DraftSnapshot) => void;
}

interface Keeping {
  readonly kept: KeptText;
  readonly notify: () => void;
}

function restored(text: string): DraftSnapshot {
  return dismissed({ ...EMPTY, caret: text.length, text });
}

function draftChanges({ kept, notify }: Keeping): DraftChanges {
  let current: DraftSnapshot = restored(kept.text());
  return {
    change: (update) => {
      const next = update(current);
      if (next.text !== current.text) {
        kept.keep(next.text);
      }
      if (!sameSnapshot({ after: next, before: current })) {
        current = next;
        notify();
      }
    },
    current: () => current,
  };
}

export { type DraftSnapshot, type Sources, EMPTY, changesFor, draftChanges };
export { type KeptText, keptTextIn } from "./kept-text.ts";
export type { BrowserStorage } from "../../browser-storage/index.ts";
