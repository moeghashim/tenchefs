import { COSTS_REPORT, writeCosts } from "./lib/file-costs.ts";
import { TIMINGS_DIR } from "./lib/slowest-files.ts";
import path from "node:path";

const cwd = process.cwd();

writeCosts({ blobs: path.join(cwd, ".vitest/blob"), file: path.join(cwd, TIMINGS_DIR, COSTS_REPORT), root: cwd });
