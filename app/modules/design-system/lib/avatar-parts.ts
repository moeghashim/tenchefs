interface PresenceShown {
  readonly online: boolean;
  readonly warning: boolean;
  readonly unreachable: boolean;
  readonly label: string;
  readonly spoken: string;
}

interface PresenceDotParts extends PresenceShown {
  readonly name: string;
  readonly place?: "avatar" | "card" | "inline";
}

interface AvatarParts {
  readonly name: string;
  readonly agent: boolean;
  readonly presence: PresenceShown | null;
  readonly size?: "large" | "small" | "tiny";
}

interface SuggestionOptionParts {
  readonly option: string;
  readonly detail: string | null;
  readonly spoken: string;
  readonly presence: PresenceShown | null;
}

export type { AvatarParts, PresenceDotParts, PresenceShown, SuggestionOptionParts };
