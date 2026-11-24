import type { CookoutClient, CookoutEvent, Message, ReactionCount, ReactionName, Refusal } from "../../sdk/index.ts";
import { refusalOf } from "../../sdk/index.ts";

interface Toggle {
  readonly message: Message;
  readonly reaction: ReactionName;
  readonly me: string;
}

type ToggleClient = Pick<CookoutClient, "react" | "unreact">;

interface ReactionToggleOptions {
  readonly client: ToggleClient;
  readonly reactionsOf: (message: Message) => readonly ReactionCount[];
  readonly apply: (event: CookoutEvent) => void;
  readonly changed: () => void;
}

interface ReactionToggle {
  readonly toggle: (toggle: Toggle) => void;
  readonly refusal: () => Refusal | null;
}

function reactedBy(reactions: readonly ReactionCount[], { me, reaction }: Toggle): boolean {
  return reactions.some((count) => count.reaction === reaction && count.by.some((name) => name === me));
}

async function after(previous: Promise<void> | null, step: () => Promise<void>): Promise<void> {
  await previous;
  await step();
}

function createReactionToggle(options: ReactionToggleOptions): ReactionToggle {
  const { apply, changed, client } = options;
  let refusal: Refusal | null = null;
  let queue: Promise<void> | null = null;

  function refused(next: Refusal | null): void {
    if (next !== refusal) {
      refusal = next;
      changed();
    }
  }

  async function toggled(toggle: Toggle): Promise<void> {
    const { message, reaction } = toggle;
    try {
      let call = client.react;
      if (reactedBy(options.reactionsOf(message), toggle)) {
        call = client.unreact;
      }
      apply({ ...(await call(message.id, reaction)), type: "reaction" });
    } catch (error: unknown) {
      refused(refusalOf(error));
    }
  }

  return {
    refusal: () => refusal,
    toggle: (toggle) => {
      refused(null);
      queue = after(queue, async () => {
        await toggled(toggle);
      });
    },
  };
}

export { type Toggle, type ToggleClient, createReactionToggle };
