import type { Identities, IdentitiesClient, IdentityChange } from "./identities-slice.ts";
import type { IdentityCalls, IdentityCallsClient } from "./identity-calls.ts";
import type { SessionClient, SessionPart } from "./session-part.ts";
import type { SessionsClient, SessionsPart } from "./agent-sessions-part.ts";
import type { Part } from "./slice.ts";
import { createIdentityCalls } from "./identity-calls.ts";
import { createPart } from "./slice.ts";
import { createSessionPart } from "./session-part.ts";
import { createSessionsPart } from "./agent-sessions-part.ts";
import { identitiesSlice } from "./identities-slice.ts";

type IdentityPartsClient = IdentitiesClient & IdentityCallsClient & SessionClient & SessionsClient;

interface IdentityParts {
  readonly identities: Part<Identities, IdentityChange>;
  readonly sessions: SessionsPart;
  readonly session: SessionPart;
  readonly identityCalls: IdentityCalls;
}

interface IdentityPartsOptions {
  readonly changed: () => void;
  readonly client: IdentityPartsClient;
  readonly url: string;
}

function identityPartsOf({ changed, client, url }: IdentityPartsOptions): IdentityParts {
  const identities = createPart({ changed, client, slice: identitiesSlice });
  const sessions = createSessionsPart({ changed, client });
  return {
    identities,
    identityCalls: createIdentityCalls({ client, identities, sessions }),
    session: createSessionPart({ changed, client, url }),
    sessions,
  };
}

export type { AgentSessions, Sessions } from "./agent-sessions-part.ts";
export type { Identities } from "./identities-slice.ts";
export type { IdentityCalls } from "./identity-calls.ts";
export type { SessionState } from "./session-part.ts";
export { type IdentityParts, type IdentityPartsClient, identityPartsOf };
