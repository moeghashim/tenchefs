import { Effect, Schema } from "effect";
import type { CommandLineNeeds } from "./cli.ts";
import type { Scope } from "effect";
import { startDevCommand } from "./cli.ts";

const DevStartLine = Schema.Struct({
  adminToken: Schema.String,
  clockUrl: Schema.String,
  database: Schema.String,
  relayUrl: Schema.String,
  url: Schema.String,
  webUrl: Schema.String,
  webhookFakeUrl: Schema.String,
});

const FakeRoutineLine = Schema.Struct({ fireUrl: Schema.String, sessionUrl: Schema.String });

interface DevProcess extends Readonly<typeof DevStartLine.Type> {
  readonly stop: Effect.Effect<void>;
}

type Started<Line> = Effect.Effect<Line, never, CommandLineNeeds | Scope.Scope>;

const startDev: Started<DevProcess> = Effect.map(
  startDevCommand({ args: ["start"], isReady: Schema.is(DevStartLine) }),
  ({ line, stop }) => ({ ...line, stop }),
);

const startProbedDev: Started<DevProcess> = Effect.map(
  startDevCommand({ args: ["start", "--probe"], isReady: Schema.is(DevStartLine) }),
  ({ line, stop }) => ({ ...line, stop }),
);

const startFakeRoutine: Started<typeof FakeRoutineLine.Type> = Effect.map(
  startDevCommand({ args: ["fake-routine"], isReady: Schema.is(FakeRoutineLine) }),
  ({ line }) => line,
);

export { type DevProcess, startDev, startFakeRoutine, startProbedDev };
