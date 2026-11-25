import { Muted } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import type { TriggerSnapshot } from "../../composer/index.ts";

const NONE = 0;

interface TriggerHeaderNamesProps {
  readonly loaded: TriggerSnapshot["loaded"];
}

function namesOf(loaded: TriggerSnapshot["loaded"]): readonly string[] {
  if (loaded.status === "loading" || loaded.trigger === null) {
    return [];
  }
  return loaded.trigger.headerNames ?? [];
}

export function TriggerHeaderNames(props: TriggerHeaderNamesProps): ReactNode {
  const names = namesOf(props.loaded);
  if (names.length === NONE) {
    return null;
  }
  return <Muted>{`Sends headers: ${names.join(", ")}`}</Muted>;
}
