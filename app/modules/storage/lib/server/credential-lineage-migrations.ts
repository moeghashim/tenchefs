import { Array as Arr } from "effect";

const WEB_UI_HOST = "'web UI'";

type PublicIdOf = (column: string) => string;

function lineageOfStoredRows(publicIdOf: PublicIdOf): readonly string[] {
  const insert =
    "INSERT INTO credential_lineage (hash, public_id, kind, identity_name, parent_hash, made_at, where_from)";
  return [
    `${insert}
     SELECT hash, ${publicIdOf("hash")},
       CASE WHEN host = ${WEB_UI_HOST} THEN 'web' ELSE 'cli' END,
       identity_name, made_with, created_at,
       CASE WHEN host = ${WEB_UI_HOST} THEN 'web browser' ELSE host END
     FROM login_credentials`,
    `${insert}
     SELECT hash, ${publicIdOf("hash")}, 'agent session', identity_name, NULL, issued_at, host FROM agent_session_tokens`,
    `${insert}
     SELECT code_hash, ${publicIdOf("code_hash")}, 'join code', agent, NULL, created_at, NULL FROM join_codes`,
  ];
}

const SQLITE_STATEMENTS: readonly string[] = [
  `CREATE TABLE credential_lineage (
     hash TEXT PRIMARY KEY,
     public_id TEXT NOT NULL UNIQUE,
     kind TEXT NOT NULL,
     identity_name TEXT NOT NULL,
     parent_hash TEXT,
     made_at TEXT NOT NULL,
     where_from TEXT,
     ended_at TEXT,
     ended_why TEXT
   ) STRICT`,
  "CREATE INDEX credential_lineage_by_parent ON credential_lineage (parent_hash) WHERE parent_hash IS NOT NULL",
  "CREATE INDEX credential_lineage_by_identity ON credential_lineage (identity_name)",
  "ALTER TABLE login_requests ADD COLUMN approved_with TEXT",
  "ALTER TABLE agent_join_requests ADD COLUMN approved_with TEXT",
  ...lineageOfStoredRows(() => "lower(hex(randomblob(8)))"),
];

const CREDENTIAL_LINEAGE_MIGRATION = Arr.join(
  Arr.map(SQLITE_STATEMENTS, (statement) => `${statement};`),
  "\n",
);

const POSTGRES_CREDENTIAL_LINEAGE_MIGRATION: readonly string[] = [
  `CREATE TABLE credential_lineage (
     hash text COLLATE "C" PRIMARY KEY,
     public_id text COLLATE "C" NOT NULL UNIQUE,
     kind text COLLATE "C" NOT NULL,
     identity_name text COLLATE "C" NOT NULL,
     parent_hash text COLLATE "C",
     made_at text COLLATE "C" NOT NULL,
     where_from text COLLATE "C",
     ended_at text COLLATE "C",
     ended_why text COLLATE "C"
   )`,
  "CREATE INDEX credential_lineage_by_parent ON credential_lineage (parent_hash) WHERE parent_hash IS NOT NULL",
  "CREATE INDEX credential_lineage_by_identity ON credential_lineage (identity_name)",
  'ALTER TABLE login_requests ADD COLUMN approved_with text COLLATE "C"',
  'ALTER TABLE agent_join_requests ADD COLUMN approved_with text COLLATE "C"',
  ...lineageOfStoredRows((column) => `substr(md5(random()::text || ${column}), 1, 16)`),
];

export { CREDENTIAL_LINEAGE_MIGRATION, POSTGRES_CREDENTIAL_LINEAGE_MIGRATION };
