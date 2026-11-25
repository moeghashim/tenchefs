import type { ChannelName, MessageId } from "../../sdk/index.ts";
import { messageIdOf, selectionOf } from "./thread-selection.ts";

interface ThreadRoute {
  readonly name: "thread";
  readonly channel: ChannelName;
  readonly thread: MessageId;
  readonly message?: MessageId;
  readonly alone?: true;
}

type ThreadMatch = ThreadRoute | { readonly name: "missing" } | false;

const PATTERNS = {
  alone: /^#\/channels\/(?<channel>[^/]+)\/threads\/(?<thread>[^/]+)\/alone$/u,
  reply: /^#\/channels\/(?<channel>[^/]+)\/threads\/(?<thread>[^/]+)\/messages\/(?<message>[^/]+)$/u,
  thread: /^#\/channels\/(?<channel>[^/]+)\/threads\/(?<thread>[^/]+)$/u,
} as const;
const { alone: ALONE, reply: REPLY, thread: THREAD } = PATTERNS;
const MISSING = { name: "missing" } as const;

function threadRoute(hash: string, shape: keyof typeof PATTERNS): ThreadRoute | null {
  const pattern = PATTERNS[shape];
  const selection = selectionOf({
    channel: hash.replace(pattern, "$<channel>"),
    thread: hash.replace(pattern, "$<thread>"),
  });
  if (selection === null) {
    return null;
  }
  return { ...selection, name: "thread" };
}

function replyRoute(hash: string): ThreadRoute | null {
  const route = threadRoute(hash, "reply");
  const message = messageIdOf(hash.replace(REPLY, "$<message>"));
  if (route === null || message === null) {
    return null;
  }
  return { ...route, message };
}

function aloneRoute(hash: string): ThreadRoute | null {
  const route = threadRoute(hash, "alone");
  if (route === null) {
    return null;
  }
  return { ...route, alone: true };
}

function matched(hash: string): ThreadRoute | null | false {
  if (THREAD.test(hash)) {
    return threadRoute(hash, "thread");
  }
  if (REPLY.test(hash)) {
    return replyRoute(hash);
  }
  if (ALONE.test(hash)) {
    return aloneRoute(hash);
  }
  return false;
}

function threadMatch(hash: string): ThreadMatch {
  const route = matched(hash);
  if (route === null) {
    return MISSING;
  }
  return route;
}

function threadHref(route: ThreadRoute): string {
  const thread = `#/channels/${route.channel}/threads/${String(route.thread)}`;
  if (route.alone === true) {
    return `${thread}/alone`;
  }
  if (!("message" in route)) {
    return thread;
  }
  return `${thread}/messages/${String(route.message)}`;
}

export { type ThreadRoute, threadHref, threadMatch };
