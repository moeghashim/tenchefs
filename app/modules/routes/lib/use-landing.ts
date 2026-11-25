import { useEffect, useRef, useSyncExternalStore } from "react";
import type { Landing } from "../../landing/index.ts";
import type { Place } from "../../paths/index.ts";
import type { Session } from "../../board/index.ts";
import { locationOf } from "../../paths/index.ts";

type Status = ReturnType<Session["snapshot"]>["status"];

const TARGET = {
  channel: 'main form[aria-label="Post to the channel"] textarea',
  heading: "main h1",
  profile: 'aside[aria-label="Profile"] h2',
  thread: 'aside[aria-label="Thread"] textarea',
  threadAlone: 'aside[aria-label="Thread"] h2',
  token: 'form[aria-label="Log in"] input[name="token"]',
} as const;

interface Landed {
  readonly hash: string;
  readonly landing: Landing;
  readonly session: Session;
}

function threadTarget(route: Place["route"]): string | null {
  if (route.name !== "thread") {
    return null;
  }
  if (route.alone === true) {
    return TARGET.threadAlone;
  }
  return TARGET.thread;
}

function targetOf({ profile, route }: Place): string {
  if (profile !== null || route.name === "profile") {
    return TARGET.profile;
  }
  const thread = threadTarget(route);
  if (thread !== null) {
    return thread;
  }
  if (route.name === "channel") {
    return TARGET.channel;
  }
  return TARGET.heading;
}

interface Settling {
  readonly asked: boolean;
  readonly landing: Landing;
  readonly status: Status;
  readonly target: string;
  readonly was: Status;
}

function settled({ asked, landing, status, target, was }: Settling): void {
  if (status === "logged-out") {
    landing.watch(TARGET.token);
    return;
  }
  if (status !== "logged-in") {
    return;
  }
  if (was === "logging-in") {
    landing.watch(target);
  } else if (asked) {
    landing.settle(target);
  }
}

function useLanding({ hash, landing, session }: Landed): void {
  const asked = useSyncExternalStore(landing.subscribe, landing.snapshot);
  const { status } = useSyncExternalStore(session.subscribe, session.snapshot);
  const before = useRef(status);
  const target = targetOf(locationOf(hash));
  useEffect(() => {
    const was = before.current;
    before.current = status;
    settled({ asked, landing, status, target, was });
  }, [asked, landing, status, target]);
}

export { useLanding };
