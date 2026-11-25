import { grepped } from "./playwright-grep.ts";

interface SlowBrowserRun {
  readonly delayMs: number;
  readonly file: string;
  readonly grep: readonly string[];
}

type SlowBrowserArguments = (SlowBrowserRun & { readonly ok: true }) | { readonly ok: false };

interface SlowPlaywright {
  readonly args: readonly string[];
  readonly command: "env";
}

const DEFAULT_DELAY_MS = 700;
const NONE = 0;
const WHOLE_NUMBER = /^\d+$/u;

function delayAndRest(args: readonly string[]): { readonly delayMs: number; readonly rest: readonly string[] } {
  const [first = "", ...rest] = args;
  if (WHOLE_NUMBER.test(first)) {
    return { delayMs: Number(first), rest };
  }
  return { delayMs: DEFAULT_DELAY_MS, rest: args };
}

function oneFile(rest: readonly string[]): string {
  const [file = "", ...extra] = rest;
  if (extra.length > NONE) {
    return "";
  }
  return file;
}

function slowBrowserArguments(args: readonly string[]): SlowBrowserArguments {
  const filtered = grepped(args);
  if (filtered === null) {
    return { ok: false };
  }
  const { delayMs, rest } = delayAndRest(filtered.rest);
  const file = oneFile(rest);
  if (delayMs === NONE || file === "") {
    return { ok: false };
  }
  return { delayMs, file, grep: filtered.grep, ok: true };
}

function slowBrowserRun({ delayMs, file, grep }: SlowBrowserRun): SlowPlaywright {
  return {
    args: [
      `COOKOUT_BROWSER_SLOW_MS=${String(delayMs)}`,
      "pnpm",
      "exec",
      "playwright",
      "test",
      file,
      "--retries=0",
      ...grep,
    ],
    command: "env",
  };
}

export { slowBrowserArguments, slowBrowserRun };
