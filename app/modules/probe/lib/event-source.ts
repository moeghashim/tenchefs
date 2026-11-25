import { objectIn } from "./object.ts";

const LINK_TYPES: ReadonlySet<unknown> = new Set(["error", "open"]);

type Heard = (type: string) => void;

interface Probing {
  readonly page: object;
  readonly heard: Heard;
}

function countedListener(type: unknown, listener: unknown, heard: Heard): unknown {
  if (typeof listener !== "function" || LINK_TYPES.has(type)) {
    return listener;
  }
  const hand = listener;
  function counted(...args: readonly unknown[]): unknown {
    heard(String(type));
    const result: unknown = Reflect.apply(hand, null, args);
    return result;
  }
  return counted;
}

function probeSource(source: object, heard: Heard): void {
  const add: unknown = Reflect.get(source, "addEventListener");
  if (typeof add !== "function") {
    return;
  }
  const addListener = add;
  function probed(type: unknown, listener: unknown, ...rest: readonly unknown[]): unknown {
    const result: unknown = Reflect.apply(addListener, source, [type, countedListener(type, listener, heard), ...rest]);
    return result;
  }
  Reflect.set(source, "addEventListener", probed);
}

function probeEventSource({ heard, page }: Probing): void {
  const original: unknown = Reflect.get(page, "EventSource");
  if (typeof original !== "function") {
    return;
  }
  const made = original;
  function construct(_target: unknown, args: readonly unknown[]): object {
    const source = objectIn(Reflect.construct(made, args));
    probeSource(source, heard);
    return source;
  }
  Reflect.set(page, "EventSource", new Proxy(original, { construct }));
}

export { probeEventSource };
