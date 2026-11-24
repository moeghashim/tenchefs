import type { Channel, ChannelName, CreateChannelRequest, Refusal } from "../../sdk/index.ts";
import { CookoutError, refusalOf } from "../../sdk/index.ts";

type CreationField = "name" | "description";

type CreationState =
  | { readonly status: "idle" }
  | { readonly status: "creating" }
  | (Refusal & { readonly status: "failed"; readonly field: CreationField });

interface ChannelCreationSnapshot {
  readonly open: boolean;
  readonly name: string;
  readonly description: string;
  readonly create: CreationState;
}

interface ChannelCreation {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => ChannelCreationSnapshot;
  readonly open: () => void;
  readonly close: () => void;
  readonly editName: (name: string) => void;
  readonly editDescription: (description: string) => void;
  readonly create: (created: (name: ChannelName) => void) => void;
}

interface CreationOptions {
  readonly createChannel: (request: CreateChannelRequest) => Promise<Channel>;
}

const CLOSED: ChannelCreationSnapshot = { create: { status: "idle" }, description: "", name: "", open: false };

function fieldOf(error: unknown): CreationField {
  if (!(error instanceof CookoutError)) {
    return "name";
  }
  const fields = error.schemaProblems.map(({ path: [first] }) => first);
  if (fields.includes("description") && fields.every((field) => field === "description")) {
    return "description";
  }
  return "name";
}

function requestOf(snapshot: ChannelCreationSnapshot): CreateChannelRequest {
  const name = snapshot.name.trim();
  const description = snapshot.description.trim();
  if (description === "") {
    return { name };
  }
  return { description, name };
}

interface Sending extends CreationOptions {
  readonly previous: Promise<void>;
  readonly typed: ChannelCreationSnapshot;
  readonly publish: (next: ChannelCreationSnapshot) => void;
  readonly created: (name: ChannelName) => void;
}

async function sendAfter(sending: Sending): Promise<void> {
  await sending.previous;
  const { publish, typed } = sending;
  try {
    const channel = await sending.createChannel(requestOf(typed));
    publish(CLOSED);
    sending.created(channel.name);
  } catch (error: unknown) {
    publish({ ...typed, create: { ...refusalOf(error), field: fieldOf(error), status: "failed" } });
  }
}

function createChannelCreation(options: CreationOptions): ChannelCreation {
  const listeners = new Set<() => void>();
  let current = CLOSED;
  let queue = Promise.resolve();

  function publish(next: ChannelCreationSnapshot): void {
    current = next;
    for (const listener of listeners) {
      listener();
    }
  }

  return {
    close: () => {
      publish(CLOSED);
    },
    create: (created) => {
      publish({ ...current, create: { status: "creating" } });
      queue = sendAfter({
        createChannel: options.createChannel,
        created,
        previous: queue,
        publish,
        typed: current,
      });
    },
    editDescription: (description) => {
      publish({ ...current, description });
    },
    editName: (name) => {
      publish({ ...current, name });
    },
    open: () => {
      publish({ ...current, open: true });
    },
    snapshot: () => current,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export { type ChannelCreation, type ChannelCreationSnapshot, type CreationState, createChannelCreation };
