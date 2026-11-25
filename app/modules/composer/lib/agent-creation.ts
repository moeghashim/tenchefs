import type { IdentityName, Refusal, Token } from "../../sdk/index.ts";
import type { IdentityList } from "./identity-list.ts";
import { listenersOf } from "./listeners.ts";
import { refusalOf } from "../../sdk/index.ts";
import { sameSnapshot } from "../../board/index.ts";

type CreateState =
  | { readonly status: "idle" }
  | { readonly status: "creating" }
  | (Refusal & { readonly status: "failed" });

interface AgentCreationSnapshot {
  readonly text: string;
  readonly displayName: string;
  readonly create: CreateState;
}

interface AgentCreation {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => AgentCreationSnapshot;
  readonly edit: (text: string) => void;
  readonly editDisplayName: (displayName: string) => void;
  readonly create: () => void;
}

interface AgentCreationOptions {
  readonly list: IdentityList;
  readonly created: (name: IdentityName, token: Token) => void;
}

function createAgentCreation(options: AgentCreationOptions): AgentCreation {
  const listeners = listenersOf(options.list.show);
  const empty: AgentCreationSnapshot = { create: { status: "idle" }, displayName: "", text: "" };
  let current = empty;
  let queue = Promise.resolve();

  function publish(next: AgentCreationSnapshot): void {
    if (sameSnapshot({ after: next, before: current })) {
      return;
    }
    current = next;
    listeners.notify();
  }

  async function sendAfter(previous: Promise<void>, asked: AgentCreationSnapshot): Promise<void> {
    await previous;
    const { displayName, text } = asked;
    try {
      const agent = { displayName: displayName.trim(), name: text.trim() };
      const { name, token } = await options.list.calls.createAgent(agent);
      options.created(name, token);
      publish(empty);
    } catch (error: unknown) {
      publish({ create: { ...refusalOf(error), status: "failed" }, displayName, text });
    }
  }

  return {
    create: () => {
      const asked = current;
      publish({ ...asked, create: { status: "creating" } });
      queue = sendAfter(queue, asked);
    },
    edit: (text) => {
      publish({ ...current, text });
    },
    editDisplayName: (displayName) => {
      publish({ ...current, displayName });
    },
    snapshot: () => current,
    subscribe: listeners.add,
  };
}

export { type AgentCreation, createAgentCreation };
