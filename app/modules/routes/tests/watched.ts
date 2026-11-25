import type { CookoutClient } from "../../sdk/index.ts";
import type { WatchedLive } from "../../testing/web.ts";
import { watchedLive } from "../../testing/web.ts";

export function watched(client: CookoutClient): WatchedLive {
  return watchedLive(client);
}
