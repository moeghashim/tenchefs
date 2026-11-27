import { Config } from "effect";

export const wakeRunVariable = "COOKOUT_WAKE_RUN";

export const isWakeRun = Config.String(wakeRunVariable).pipe(
  Config.withDefault(""),
  Config.map((value) => value === "1"),
);
