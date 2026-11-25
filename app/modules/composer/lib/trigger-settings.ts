import type { BoardStore, IdentityCalls } from "../../board/index.ts";
import type { IdentityName, Refusal, Trigger, TriggerHeader } from "../../sdk/index.ts";
import { calledTrigger } from "../../board/index.ts";
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
  readonly headers: string;
  readonly save: SaveState;
}

interface TriggerSettings {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => TriggerSnapshot;
  readonly editUrl: (url: string) => void;
  readonly editHeaders: (headers: string) => void;
  readonly save: (token: string) => void;
  readonly clear: () => void;
}

interface TriggerOptions {
  readonly calls: Pick<IdentityCalls, "clearTrigger" | "readTrigger" | "setTrigger">;
  readonly store: Pick<BoardStore, "snapshot" | "subscribeShowing">;
  readonly name: IdentityName;
  readonly show: () => () => void;
}

type Hearing = (stopListening: () => void) => () => void;

const IDLE: SaveState = { status: "idle" };
const NO_HEADERS = "";
const NAME_AND_VALUE = 2;

function headerOf(line: string): TriggerHeader {
  const [name = "", value = ""] = line.split(/:(?<value>.*)/su, NAME_AND_VALUE);
  return { name: name.trim(), value: value.trim() };
}

function headersOf(text: string): readonly TriggerHeader[] {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => headerOf(line));
}

function keptEdits(current: TriggerSnapshot, edit: "kept" | "dropped"): Pick<TriggerSnapshot, "headers" | "url"> {
  if (edit === "kept") {
    return { headers: current.headers, url: current.url };
  }
  return { headers: NO_HEADERS, url: null };
}

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

function hearingCalls({ name, store }: TriggerOptions, heard: (trigger: Trigger) => void): Hearing {
  const calledNow = calledTrigger(name);
  let called = calledNow(store.snapshot());
  function heardCall(): void {
    const latest = calledNow(store.snapshot());
    if (latest !== called && latest !== null) {
      called = latest;
      heard(latest);
    }
  }
  return (stopListening) => {
    const stopHearing = store.subscribeShowing("triggers")(heardCall);
    return () => {
      stopHearing();
      stopListening();
    };
  };
}

function createTriggerSettings(options: TriggerOptions): TriggerSettings {
  const { calls, name } = options;
  const listeners = listenersOf(options.show);
  let current: TriggerSnapshot = { headers: NO_HEADERS, loaded: { status: "loading" }, save: IDLE, url: null };
  let pending: Promise<void> | null = null;

  function publish(next: TriggerSnapshot): void {
    current = next;
    listeners.notify();
  }

  const hearCalls = hearingCalls(options, (trigger) => {
    publish({ ...current, loaded: { status: "loaded", trigger } });
  });

  async function sent(call: Promise<Trigger | null>, edit: "kept" | "dropped"): Promise<void> {
    publish({ ...current, save: { status: "saving" } });
    try {
      const trigger = await call;
      publish({ ...keptEdits(current, edit), loaded: { status: "loaded", trigger }, save: IDLE });
    } catch (error: unknown) {
      publish({ ...current, save: { ...refusalOf(error), status: "failed" } });
    }
  }

  return {
    clear: () => {
      pending = sent(cleared(options), "dropped");
    },
    editHeaders: (headers) => {
      publish({ ...current, headers });
    },
    editUrl: (url) => {
      publish({ ...current, url });
    },
    save: (token) => {
      const request = { headers: headersOf(current.headers), token, url: current.url ?? savedUrl(current.loaded) };
      pending = sent(calls.setTrigger(name, request), "dropped");
    },
    snapshot: () => current,
    subscribe: (listener) => {
      pending ??= sent(calls.readTrigger(name), "kept");
      return hearCalls(listeners.add(listener));
    },
  };
}

export { type TriggerSettings, type TriggerSnapshot, createTriggerSettings, savedUrl };
