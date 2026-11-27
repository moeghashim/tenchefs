import type { Storage, StorageUnavailable } from "../../../storage/server.ts";
import type { AgentSessions } from "../../../agent-sessions/server.ts";
import { Effect } from "effect";
import type { Refusal } from "../../../http/index.ts";
import { sentAgentSessionEnded } from "../../../agent-sessions/server.ts";
import { sentLoginCredentialEnded } from "../../../identities/server.ts";

type CredentialWatch = AgentSessions | Storage;

const sentCredentialEnded: Effect.Effect<Refusal, StorageUnavailable, CredentialWatch> = Effect.raceFirst(
  sentAgentSessionEnded,
  sentLoginCredentialEnded,
);

export { type CredentialWatch, sentCredentialEnded };
