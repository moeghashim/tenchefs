const LOGIN_EXPIRY_MIGRATION = `ALTER TABLE login_credentials ADD COLUMN last_used_at TEXT;
   ALTER TABLE login_credentials ADD COLUMN expires_at TEXT;
   UPDATE login_credentials SET last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
     expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+90 days');`;

const POSTGRES_LOGIN_EXPIRY_MIGRATION: readonly string[] = [
  'ALTER TABLE login_credentials ADD COLUMN last_used_at text COLLATE "C"',
  'ALTER TABLE login_credentials ADD COLUMN expires_at text COLLATE "C"',
  `UPDATE login_credentials SET
     last_used_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
     expires_at = to_char((now() AT TIME ZONE 'UTC') + interval '90 days', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
];

export { LOGIN_EXPIRY_MIGRATION, POSTGRES_LOGIN_EXPIRY_MIGRATION };
