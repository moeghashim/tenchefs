interface SlowRun {
  readonly delayMs: number;
  readonly files: readonly string[];
}

declare module "vitest" {
  interface ProvidedContext {
    webSlowMs?: number;
  }
}

type SlowArguments = (SlowRun & { readonly ok: true }) | { readonly ok: false };

interface SlowVitest {
  readonly files: readonly string[];
  readonly options: {
    readonly project: readonly string[];
    readonly provide: { readonly webSlowMs: number };
    readonly run: true;
  };
}

const DEFAULT_DELAY_MS = 700;
const NONE = 0;
const WHOLE_NUMBER = /^\d+$/u;

function delayAndFiles(args: readonly string[]): SlowRun {
  const [first = "", ...rest] = args;
  if (WHOLE_NUMBER.test(first)) {
    return { delayMs: Number(first), files: rest };
  }
  return { delayMs: DEFAULT_DELAY_MS, files: args };
}

function slowArguments(args: readonly string[]): SlowArguments {
  const { delayMs, files } = delayAndFiles(args);
  if (delayMs === NONE || files.length === NONE) {
    return { ok: false };
  }
  return { delayMs, files, ok: true };
}

function slowRun({ delayMs, files }: SlowRun): SlowVitest {
  return { files, options: { project: ["web", "web-clock"], provide: { webSlowMs: delayMs }, run: true } };
}

export { slowArguments, slowRun };
