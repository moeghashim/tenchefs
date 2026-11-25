import type { Reactions, ReactionsClient } from "./reactions-slice.ts";
import { reactionsIn, reactionsSlice } from "./reactions-slice.ts";
import type { Part } from "./slice.ts";
import type { ToggleClient } from "./reaction-toggle.ts";
import { createPart } from "./slice.ts";
import { createReactionToggle } from "./reaction-toggle.ts";

interface ReactionParts {
  readonly reactions: Part<Reactions>;
  readonly reactionToggle: ReturnType<typeof createReactionToggle>;
}

interface ReactionPartsOptions {
  readonly changed: () => void;
  readonly client: ReactionsClient & ToggleClient;
}

function reactionPartsOf({ changed, client }: ReactionPartsOptions): ReactionParts {
  const reactions = createPart({ changed, client, slice: reactionsSlice });
  const reactionToggle = createReactionToggle({
    apply: reactions.apply,
    changed,
    client,
    reactionsOf: (message) => reactionsIn({ held: reactions.state(), message }),
  });
  return { reactionToggle, reactions };
}

export { type ReactionParts, reactionPartsOf };
export type { Reactions, ReactionsClient } from "./reactions-slice.ts";
export type { Toggle, ToggleClient } from "./reaction-toggle.ts";
