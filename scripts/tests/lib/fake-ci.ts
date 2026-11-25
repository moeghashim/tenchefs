import { DONE, stop } from "../../lib/merge-steps.ts";
import type { Step } from "../../lib/merge-steps.ts";
import { git } from "./merge-repos.ts";

interface FakeCi {
  readonly ci: (branch: string, sha: string) => Step;
  readonly green: readonly string[];
  readonly watched: readonly string[];
}

interface FakeCiOptions {
  readonly moveV1?: (run: number) => boolean;
  readonly origin: string;
  readonly other: string;
  readonly red?: (run: number) => boolean;
}

function moveV1(other: string): void {
  git(other, "commit", "-q", "--allow-empty", "-m", "moved");
  git(other, "push", "-q", "origin", "HEAD:v1");
}

function fakeCi({
  moveV1: moves = (): boolean => false,
  origin,
  other,
  red = (): boolean => false,
}: FakeCiOptions): FakeCi {
  const green: string[] = [];
  const watched: string[] = [];
  return {
    ci: (branch, sha): Step => {
      watched.push(`${branch} ${sha} ${git(origin, "rev-parse", branch)}`);
      if (moves(watched.length)) {
        moveV1(other);
      }
      if (red(watched.length)) {
        return stop(`${branch}'s latest Check run is red: tests 1/2 (failure).`);
      }
      green.push(sha);
      return DONE;
    },
    green,
    watched,
  };
}

export { fakeCi };
