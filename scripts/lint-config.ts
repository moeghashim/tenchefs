import { lintConfigCheck } from "./lib/lint-config-guard.ts";

const BASE = "--base=";
const EXIT_FAILURE = 1;

const given = process.argv.find((arg) => arg.startsWith(BASE)) ?? BASE;
const verdict = lintConfigCheck({ base: given.slice(BASE.length), cwd: process.cwd(), head: "HEAD" });
if (!verdict.ok) {
  console.error(verdict.report);
  process.exitCode = EXIT_FAILURE;
}
