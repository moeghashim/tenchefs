import { Array as Arr, Effect, FileSystem, Option, Order } from "effect";
import type { RunnerEvent, WakeBoard } from "../../../testing/server.ts";
import {
  commandLineServices,
  eventsOfKind,
  joinWaking,
  mention,
  printingWakeCommand,
  runCookout,
  runnerEventsOf,
  testCookout,
  untilRunnerEvents,
  wakeBoard,
  wakingAgents,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";

const SOME_TIME: unknown = expect.stringMatching(/^\d{4}-\d\d-\d\dT/u);
const STARTED_AT = "2026-11-26T10:00:00.000Z";
const ANYTHING: unknown = expect.anything();
const PRINTED = "printed-by-the-wake-run";
const RUN_OUTPUT_LIMIT = 1_048_576;
const OVER_HALF_THE_LIMIT = 600_000;
const NO_BYTES = 0;
const ONE = 1;
const TWO = 2;
const THREE = 3;
const SEQUENTIAL = { concurrency: 1 } as const;

function outputFiles(on: WakeBoard, name: string): Effect.Effect<readonly string[], never, FileSystem.FileSystem> {
  return Effect.gen(function* listOutputFiles() {
    const fs = yield* FileSystem.FileSystem;
    const folder = `${on.folder}/runs/${name}`;
    const names = yield* Effect.orElseSucceed(fs.readDirectory(folder), Arr.empty);
    return Arr.sort(
      Arr.map(names, (file) => `${folder}/${file}`),
      Order.String,
    );
  });
}

function outputsOf(events: readonly RunnerEvent[]): readonly string[] {
  return Arr.getSomes(
    Arr.map(eventsOfKind({ agent: "brigid", type: "wake-run-start" })(events), ({ output }) =>
      Option.fromUndefinedOr(output),
    ),
  );
}

function totalSize(files: readonly string[]): Effect.Effect<number, never, FileSystem.FileSystem> {
  return Effect.gen(function* addUpSizes() {
    const fs = yield* FileSystem.FileSystem;
    const sizes = yield* Effect.forEach(files, (file) => Effect.orDie(fs.stat(file)), SEQUENTIAL);
    return Arr.reduce(sizes, NO_BYTES, (sum, { size }) => sum + Number(size));
  });
}

it.effect("a wake run's stdout and stderr land in its own output file", () =>
  Effect.gen(function* outputInItsFile() {
    const fs = yield* FileSystem.FileSystem;
    const { on } = yield* wakingAgents([{ name: "brigid", settings: { print: PRINTED } }]);
    yield* mention({ ada: on.ada, text: "@brigid print" });
    const events = yield* untilRunnerEvents({ agent: "brigid", on, type: "exit" });
    const outputs = outputsOf(events);
    const texts = yield* Effect.forEach(outputs, (file) => Effect.orDie(fs.readFileString(file)), SEQUENTIAL);
    const files = yield* outputFiles(on, "brigid");

    expect(texts).toStrictEqual([`${PRINTED}\n${PRINTED}\n`]);
    expect(files).toStrictEqual(outputs);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect(
  "an agent's oldest output files rotate out once its files pass the size limit, over an unacked mention's two runs",
  () =>
    Effect.gen(function* rotated() {
      const { on } = yield* wakingAgents([{ command: printingWakeCommand(OVER_HALF_THE_LIMIT), name: "brigid" }]);
      yield* mention({ ada: on.ada, text: "@brigid print" });
      const events = yield* untilRunnerEvents({ agent: "brigid", count: TWO, on, type: "exit" });
      const files = yield* outputFiles(on, "brigid");
      const total = yield* totalSize(files);

      expect(outputsOf(events)).toHaveLength(TWO);
      expect(files).toStrictEqual(Arr.drop(outputsOf(events), ONE));
      expect(total).toBeLessThanOrEqual(RUN_OUTPUT_LIMIT);
    }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("runner logs <agent> prints only that agent's events", () =>
  Effect.gen(function* filtered() {
    const { on } = yield* wakingAgents([{ name: "brigid" }, { name: "cormac" }]);
    yield* untilRunnerEvents({ agent: "cormac", on, type: "connect" });
    yield* untilRunnerEvents({ agent: "brigid", on, type: "connect" });
    const events = yield* runnerEventsOf({ agent: "cormac", on });

    expect(Arr.map(events, ({ agent, type }) => [agent, type])).toStrictEqual([
      ["cormac", "runner-start"],
      ["cormac", "connect"],
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("runner status shows each agent's last wake run: when it started, its output file and how it ended", () =>
  Effect.gen(function* lastRun() {
    const { on } = yield* wakingAgents([{ name: "brigid", settings: { exitCode: THREE } }, { name: "cormac" }]);
    yield* mention({ ada: on.ada, text: "@brigid fail" });
    const events = yield* untilRunnerEvents({ agent: "brigid", on, type: "exit" });
    const env = { COOKOUT_STATE_DIR: on.folder };
    const [json, text] = yield* Effect.all(
      [runCookout({ args: ["runner", "status", "--json"], env }), runCookout({ args: ["runner", "status"], env })],
      SEQUENTIAL,
    );
    const [startedAt] = Arr.map(eventsOfKind({ agent: "brigid", type: "wake-run-start" })(events), ({ at }) => at);
    const [output] = outputsOf(events);

    expect(json.stdoutJson).toMatchObject({
      registrations: [
        {
          agent: "brigid",
          lastRun: {
            ended: { at: SOME_TIME, exitCode: THREE, type: "exit" },
            output,
            startedAt,
          },
        },
        { agent: "cormac" },
      ],
    });
    expect(json.stdoutJson).not.toMatchObject({ registrations: [{}, { lastRun: ANYTHING }] });
    expect(text.stdout).toMatch(/^brigid .* last wake run \S+: exited 3, output in \S+$/mu);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("runner status says when the last wake run timed out", () =>
  Effect.gen(function* timedOutRun() {
    const fs = yield* FileSystem.FileSystem;
    const on = yield* wakeBoard;
    yield* joinWaking({ name: "brigid", on, settings: { log: `${on.folder}/wake.log` } });
    const log = Arr.join(
      [
        `{"agent":"brigid","at":"${STARTED_AT}","output":"run.log","type":"wake-run-start"}`,
        `{"agent":"brigid","at":"2026-11-26T10:01:00.000Z","timedOutAfterMinutes":1,"type":"timeout"}`,
        "",
      ],
      "\n",
    );
    yield* Effect.orDie(fs.writeFileString(`${on.folder}/runner-events.jsonl`, log));
    const text = yield* runCookout({ args: ["runner", "status"], env: { COOKOUT_STATE_DIR: on.folder } });

    expect(text.stdout).toMatch(/^brigid .* last wake run \S+: timed out after 1 min, output in run\.log$/mu);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);
