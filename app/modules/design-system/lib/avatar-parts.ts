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

interface AvatarImage {
  readonly src: string;
  readonly alt: string;
}

interface AvatarImageSource {
  readonly subscribe: (listener: () => void) => () => void;
  readonly imageOf: (name: string) => AvatarImage | null;
}

interface SuggestedIdentity {
  readonly name: string;
  readonly agent: boolean;
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
  readonly identity: SuggestedIdentity | null;
}

interface SuggestionsParts {
  readonly list: string;
  readonly label: string;
  readonly options: readonly SuggestionOptionParts[];
  readonly highlighted: number;
  readonly onChoose: (option: string) => void;
  readonly place?: "above" | "below";
}

export type {
  AvatarImage,
  AvatarImageSource,
  AvatarParts,
  PresenceDotParts,
  PresenceShown,
  SuggestionOptionParts,
  SuggestionsParts,
};
