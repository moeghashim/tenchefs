import type { LogOutEverywhereCounts, SessionView } from "../../logins/index.ts";
import type { SessionAsk, SessionListState } from "../../board/index.ts";
import { timeOf } from "../../format/index.ts";

const ONE = 1;
const NONE = 0;

const KINDS = { cli: "Terminal", web: "Browser" } as const;

function isText(where: string | undefined): where is string {
  return typeof where === "string";
}

function approvedByOf(session: SessionView): readonly string[] {
  const madeBy = session.madeBy ?? null;
  if (madeBy === null) {
    return [];
  }
  return [madeBy.where].filter((where) => isText(where)).map((where) => `approved by ${where}`);
}

function sessionDetail(session: SessionView): string {
  return [
    KINDS[session.kind],
    `made ${timeOf(session.madeAt).full}`,
    `last used ${timeOf(session.lastUsedAt).full}`,
    ...approvedByOf(session),
  ].join(" · ");
}

function counted(count: number, one: string, many: string): readonly string[] {
  if (count === NONE) {
    return [];
  }
  if (count === ONE) {
    return [`1 ${one}`];
  }
  return [`${String(count)} ${many}`];
}

function listed(parts: readonly string[]): string {
  return [parts.slice(NONE, -ONE).join(", "), ...parts.slice(-ONE)].filter((part) => part !== "").join(" and ");
}

function willEndWords(willEnd: LogOutEverywhereCounts): string {
  const parts = [
    ...counted(willEnd.sessions, "session", "sessions"),
    ...counted(willEnd.agentSessions, "agent session", "agent sessions"),
    ...counted(willEnd.joinCodes, "join code", "join codes"),
  ];
  if (parts.length === NONE) {
    return "Nothing else is logged in. This browser stays logged in.";
  }
  return `${listed(parts)} will end. This browser stays logged in.`;
}

interface Question {
  readonly title: string;
  readonly body: string;
  readonly confirm: string;
}

function questionOf(asked: SessionAsk): Question {
  if (asked.kind === "revoke") {
    return {
      body: "It is logged out at once, with every device and agent session it approved.",
      confirm: "Revoke",
      title: `Revoke ${asked.session.where}?`,
    };
  }
  return { body: willEndWords(asked.willEnd), confirm: "Log out everywhere", title: "Log out everywhere?" };
}

function refusalWords(state: SessionListState): string | null {
  if (state.action.status !== "failed") {
    return null;
  }
  return `Couldn't do that. ${state.action.message}`;
}

function alertOf(state: SessionListState): string | null {
  if (state.asked !== null) {
    return null;
  }
  return refusalWords(state);
}

export { alertOf, questionOf, refusalWords, sessionDetail };
