import type { Identity } from "../../sdk/index.ts";
import type { PresenceShown } from "./use-presence.ts";
import type { Presences } from "../../board/index.ts";
import { shownIn } from "./use-presence.ts";

interface MentionOption {
  readonly option: string;
  readonly detail: string | null;
  readonly spoken: string;
  readonly presence: PresenceShown | null;
  readonly identity: { readonly name: string; readonly agent: boolean } | null;
}

function spokenMention(identity: Identity): string {
  const displayName = identity.displayName ?? null;
  if (displayName === null) {
    return `@${identity.name}`;
  }
  return `${displayName}, @${identity.name}`;
}

interface Mentioning {
  readonly identity: Identity;
  readonly presences: Presences;
}

function mentionOptionOf({ identity, presences }: Mentioning): MentionOption {
  return {
    detail: identity.displayName ?? null,
    identity: { agent: identity.kind === "agent", name: identity.name },
    option: `@${identity.name}`,
    presence: shownIn({ name: identity.name, presences }),
    spoken: spokenMention(identity),
  };
}

export { type MentionOption, mentionOptionOf };
