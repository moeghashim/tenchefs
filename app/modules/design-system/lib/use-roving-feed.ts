import { useEffect } from "react";
import { watchFeed } from "./roving-feed.ts";

interface Feed {
  readonly feed: string;
  readonly more: boolean;
}

export function useRovingFeed({ feed, more }: Feed): void {
  useEffect(() => watchFeed({ feed, more }), [feed, more]);
}
