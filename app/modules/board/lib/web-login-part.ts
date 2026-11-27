import type { CookoutClient, Identity, Refusal, Token } from "../../sdk/index.ts";
import { createListeners } from "./listeners.ts";
import { refusalOf } from "../../sdk/index.ts";

type WebLoginState =
  | { readonly status: "choosing" | "starting" | "expired" }
  | { readonly status: "refused"; readonly refusal: Refusal }
  | {
      readonly status: "waiting";
      readonly userCode: string;
      readonly expiresAt: string;
      readonly approvalUrl: string;
    };

type WebLoginClient = Pick<CookoutClient, "startWebLogin" | "collectWebLogin">;

interface WebLogin {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => WebLoginState;
  readonly start: () => void;
  readonly back: () => void;
}

interface WebLoginOptions {
  readonly client: WebLoginClient;
  readonly url: string;
  readonly loggedIn: (identity: Identity) => void;
}

const POLL_MILLISECONDS = 2000;
const NONE = 0;
const ONE = 1;
const CHOOSING: WebLoginState = { status: "choosing" };
const EXPIRED: WebLoginState = { status: "expired" };
const GONE = "login_request_not_found";
const PASSING = new Set<string>(["rate_limited", "unreachable"]);

interface Held {
  readonly put: (next: WebLoginState) => void;
  readonly live: (attempt: number) => boolean;
}

interface Waiting {
  readonly attempt: number;
  readonly requestId: Token;
}

type Step = "again" | "done";

type Collected = Awaited<ReturnType<WebLoginClient["collectWebLogin"]>>;

async function pause(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<boolean>();
  globalThis.setTimeout(() => {
    resolve(true);
  }, POLL_MILLISECONDS);
  await promise;
}

function endedBy(refusal: Refusal): WebLoginState {
  if (refusal.code === GONE) {
    return EXPIRED;
  }
  return { refusal, status: "refused" };
}

function afterRefusal(held: Held, attempt: number, error: unknown): Step {
  const refusal = refusalOf(error);
  if (!held.live(attempt)) {
    return "done";
  }
  if (PASSING.has(refusal.code)) {
    return "again";
  }
  held.put(endedBy(refusal));
  return "done";
}

function afterAnswer(held: Held, options: WebLoginOptions, collected: Collected): Step {
  if (collected.status === "pending") {
    return "again";
  }
  options.loggedIn(collected.identity);
  held.put(CHOOSING);
  return "done";
}

async function collectOnce(held: Held, options: WebLoginOptions, waiting: Waiting): Promise<Step> {
  try {
    const collected = await options.client.collectWebLogin(waiting.requestId);
    if (!held.live(waiting.attempt)) {
      return "done";
    }
    return afterAnswer(held, options, collected);
  } catch (error: unknown) {
    return afterRefusal(held, waiting.attempt, error);
  }
}

async function pollFrom(held: Held, options: WebLoginOptions, waiting: Waiting): Promise<void> {
  await pause();
  if (!held.live(waiting.attempt)) {
    return;
  }
  const step = await collectOnce(held, options, waiting);
  if (step === "again") {
    await pollFrom(held, options, waiting);
  }
}

async function startAttempt(held: Held, options: WebLoginOptions, attempt: number): Promise<void> {
  held.put({ status: "starting" });
  try {
    const { approvalPath, expiresAt, requestId, userCode } = await options.client.startWebLogin();
    if (held.live(attempt)) {
      held.put({ approvalUrl: `${options.url}${approvalPath}`, expiresAt, status: "waiting", userCode });
      await pollFrom(held, options, { attempt, requestId });
    }
  } catch (error: unknown) {
    if (held.live(attempt)) {
      held.put({ refusal: refusalOf(error), status: "refused" });
    }
  }
}

async function after(previous: Promise<void> | null, next: Promise<void>): Promise<void> {
  await previous;
  await next;
}

function createWebLogin(options: WebLoginOptions): WebLogin {
  const listeners = createListeners();
  let current = CHOOSING;
  let attempt = NONE;
  let readers = NONE;
  let running: Promise<void> | null = null;
  const held: Held = {
    live: (given) => given === attempt,
    put: (next) => {
      current = next;
      listeners.notify();
    },
  };
  function back(): void {
    attempt += ONE;
    held.put(CHOOSING);
  }
  return {
    back,
    snapshot: () => current,
    start: () => {
      attempt += ONE;
      running = after(running, startAttempt(held, options, attempt));
    },
    subscribe: (listener) => {
      const unsubscribe = listeners.subscribe(listener);
      readers += ONE;
      return () => {
        unsubscribe();
        readers -= ONE;
        if (readers === NONE) {
          back();
        }
      };
    },
  };
}

export { type WebLogin, type WebLoginClient, type WebLoginState, createWebLogin };
