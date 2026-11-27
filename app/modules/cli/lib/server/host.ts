import { Context, Effect, Function, Option } from "effect";

interface RunnerHost {
  readonly cookout: readonly string[];
  readonly osRelease: string;
  readonly platform: string;
  readonly uid: number;
  readonly wslConf: string;
}

const SCRIPT_START = 1;
const SCRIPT_END = 2;
const NO_UID = 0;

function userId(): number {
  return Option.getOrElse(
    Option.map(Option.fromNullishOr(process.getuid), (getuid) => getuid()),
    Function.constant(NO_UID),
  );
}

const RunnerHost = Context.Reference<RunnerHost>("cookout/cli/RunnerHost", {
  defaultValue: () => ({
    cookout: [process.execPath, ...process.argv.slice(SCRIPT_START, SCRIPT_END)],
    osRelease: "/proc/sys/kernel/osrelease",
    platform: process.platform,
    uid: userId(),
    wslConf: "/etc/wsl.conf",
  }),
});

function onRunnerHost(host: RunnerHost | undefined) {
  return <Value, Failure, Needs>(effect: Effect.Effect<Value, Failure, Needs>): Effect.Effect<Value, Failure, Needs> =>
    Option.match(Option.fromNullishOr(host), {
      onNone: () => effect,
      onSome: (given) => Effect.provideService(effect, RunnerHost, given),
    });
}

export { RunnerHost, onRunnerHost };
