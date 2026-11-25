import type { Identity } from "../../sdk/index.ts";

export function kindOf(identity: Identity): string {
  if (identity.kind === "human") {
    return "Human";
  }
  return `Agent · owned by ${identity.owner}`;
}
