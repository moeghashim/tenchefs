import { Effect } from "effect";
import { RunnerHost } from "./host.ts";

interface ModeCheck {
  readonly mode: number;
  readonly wanted: number;
}

const PERMISSIONS = 0o1000;
const WINDOWS = "win32";

function hasPrivateMode({ mode, wanted }: ModeCheck): Effect.Effect<boolean> {
  return Effect.gen(function* checkMode() {
    const { platform } = yield* RunnerHost;
    return platform === WINDOWS || mode % PERMISSIONS === wanted;
  });
}

export { hasPrivateMode };
