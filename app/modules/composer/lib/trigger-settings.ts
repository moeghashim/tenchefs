import type { IdentityName, Refusal, Trigger } from "../../sdk/index.ts";
import type { IdentityCalls } from "../../board/index.ts";
import { listenersOf } from "./listeners.ts";
import { refusalOf } from "../../sdk/index.ts";

type Loaded = { readonly status: "loading" } | { readonly status: "loaded"; readonly trigger: Trigger | null };

type SaveState =
  | { readonly status: "idle" }
  | { readonly status: "saving" }
  | (Refusal & { readonly status: "failed" });

interface TriggerSnapshot {
  readonly loaded: Loaded;
  readonly url: string | null;
  readonly save: SaveState;
}

interface TriggerSettings {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => TriggerSnapshot;
  readonly editUrl: (url: string) => void;
  readonly save: (token: string) => void;
  readonly clear: () => void;
}

interface TriggerOptions {
  readonly calls: Pick<IdentityCalls, "clearTrigger" | "readTrigger" | "setTrigger">;
  readonly name: IdentityName;
  readonly show: () => () => void;
}

const IDLE: SaveState = { status: "idle" };

function savedUrl(loaded: Loaded): string {
  if (loaded.status === "loading" || loaded.trigger === null) {
    return "";
  }
  return loaded.trigger.url;
}

async function cleared({ calls, name }: TriggerOptions): Promise<null> {
  await calls.clearTrigger(name);
  return null;
}

function keptUrl(current: TriggerSnapshot, edit: "kept" | "dropped"): string | null {
  if (edit === "kept") {
    return current.url;
  }
  return null;
}

function createTriggerSettings(options: TriggerOptions): TriggerSettings {
  const { calls, name } = options;
  const listeners = listenersOf(options.show);
  let current: TriggerSnapshot = { loaded: { status: "loading" }, save: IDLE, url: null };
  let pending: Promise<void> | null = null;

  function publish(next: TriggerSnapshot): void {
    current = next;
    listeners.notify();
  }

  async function sent(call: Promise<Trigger | null>, edit: "kept" | "dropped"): Promise<void> {
    publish({ ...current, save: { status: "saving" } });
    try {
      const trigger = await call;
      publish({ loaded: { status: "loaded", trigger }, save: IDLE, url: keptUrl(current, edit) });
    } catch (error: unknown) {
      publish({ ...current, save: { ...refusalOf(error), status: "failed" } });
    }
  }

  return {
    clear: () => {
      pending = sent(cleared(options), "dropped");
    },
    editUrl: (url) => {
      publish({ ...current, url });
    },
    save: (token) => {
      const request = { token, url: current.url ?? savedUrl(current.loaded) };
      pending = sent(calls.setTrigger(name, request), "dropped");
    },
    snapshot: () => current,
    subscribe: (listener) => {
      pending ??= sent(calls.readTrigger(name), "kept");
      return listeners.add(listener);
    },
  };
}

export { type TriggerSettings, type TriggerSnapshot, createTriggerSettings, savedUrl };
