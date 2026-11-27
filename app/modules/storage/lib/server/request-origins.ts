import { Predicate } from "effect";

interface RequestOrigin {
  readonly clientIp?: string;
  readonly userAgent?: string;
}

interface StoredOrigin {
  readonly clientIp: string | null | undefined;
  readonly userAgent: string | null | undefined;
}

function originOf({ clientIp, userAgent }: StoredOrigin): RequestOrigin {
  let origin: RequestOrigin = {};
  if (Predicate.isString(clientIp)) {
    origin = { clientIp };
  }
  if (Predicate.isString(userAgent)) {
    origin = { ...origin, userAgent };
  }
  return origin;
}

function originColumns({ clientIp, userAgent }: RequestOrigin): readonly [string | null, string | null] {
  return [clientIp ?? null, userAgent ?? null];
}

const REQUEST_ORIGINS_MIGRATION = `ALTER TABLE login_requests ADD COLUMN client_ip TEXT;
   ALTER TABLE login_requests ADD COLUMN user_agent TEXT;
   ALTER TABLE agent_join_requests ADD COLUMN client_ip TEXT;
   ALTER TABLE agent_join_requests ADD COLUMN user_agent TEXT;`;

const POSTGRES_REQUEST_ORIGINS_MIGRATION: readonly string[] = [
  'ALTER TABLE login_requests ADD COLUMN client_ip text COLLATE "C"',
  'ALTER TABLE login_requests ADD COLUMN user_agent text COLLATE "C"',
  'ALTER TABLE agent_join_requests ADD COLUMN client_ip text COLLATE "C"',
  'ALTER TABLE agent_join_requests ADD COLUMN user_agent text COLLATE "C"',
];

export { POSTGRES_REQUEST_ORIGINS_MIGRATION, REQUEST_ORIGINS_MIGRATION, type RequestOrigin, originColumns, originOf };
