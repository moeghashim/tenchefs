import type { Identities, IdentitiesClient, IdentityChange } from "./identities-slice.ts";
import type { IdentityCalls, IdentityCallsClient } from "./identity-calls.ts";
import type { SessionClient, SessionPart } from "./session-part.ts";
import type { SessionsClient, SessionsPart } from "./agent-sessions-part.ts";
import type { WebLogin, WebLoginClient } from "./web-login-part.ts";
import type { Part } from "./slice.ts";
import { createIdentityCalls } from "./identity-calls.ts";
import { createPart } from "./slice.ts";
import { createSessionPart } from "./session-part.ts";
import { createSessionsPart } from "./agent-sessions-part.ts";
import { createWebLogin } from "./web-login-part.ts";
import { identitiesSlice } from "./identities-slice.ts";

type IdentityPartsClient = IdentitiesClient & IdentityCallsClient & SessionClient & SessionsClient & WebLoginClient;

interface IdentityParts {
  readonly identities: Part<Identities, IdentityChange>;
  readonly sessions: SessionsPart;
  readonly session: SessionPart;
  readonly identityCalls: IdentityCalls;
  readonly webLogin: WebLogin;
}

interface IdentityPartsOptions {
  readonly changed: () => void;
  readonly client: IdentityPartsClient;
  readonly url: string;
}

function identityPartsOf({ changed, client, url }: IdentityPartsOptions): IdentityParts {
  const identities = createPart({ changed, client, slice: identitiesSlice });
  const sessions = createSessionsPart({ changed, client });
  const session = createSessionPart({ changed, client, url });
  return {
    identities,
    identityCalls: createIdentityCalls({ client, identities, sessions }),
    session,
    sessions,
    webLogin: createWebLogin({ client, loggedIn: session.loggedIn, url }),
  };
}

export type { AgentSessions, Sessions } from "./agent-sessions-part.ts";
export type { Identities } from "./identities-slice.ts";
export type { IdentityCalls } from "./identity-calls.ts";
export type { SessionState } from "./session-part.ts";
export type { WebLogin, WebLoginState } from "./web-login-part.ts";
export { type IdentityParts, type IdentityPartsClient, identityPartsOf };
