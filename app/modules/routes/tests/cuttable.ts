import type { Live, LiveLink } from "../../testing/web.ts";
import { scriptedLive } from "../../testing/web.ts";

export interface Cuttable {
  readonly live: Live;
  readonly report: (link: LiveLink) => void;
}

export function cuttable(): Cuttable {
  const { live, report } = scriptedLive();
  return { live, report };
}
