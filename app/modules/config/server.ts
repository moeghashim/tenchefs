/**
 * Every environment variable the cookout reads, with its default. Nothing else reads the environment, and every
 * variable here has a line in `.env.example` and a line in the README's Settings section (`pnpm hygiene` checks both).
 */
import { Array as Arr, Config, Record as Rec, Redacted, Schema, String as Str } from "effect";
import { firstAdminName, isIdentityName } from "../identities/index.ts";
import type { IdentityName } from "../identities/index.ts";
import { harnessVariables } from "./index.ts";
import { idleExpiryPattern } from "../agent-sessions/index.ts";

const SHORTEST_WEBHOOK_TIMEOUT_SECONDS = 1;
const DEFAULT_WEBHOOK_TIMEOUT_SECONDS = 5;
const SHORTEST_WEBHOOK_RETRY_DELAY_SECONDS = 0;
const DEFAULT_WEBHOOK_RETRY_DELAY_SECONDS = 10;
const SMALLEST_WEBHOOK_RETRY_FACTOR = 1;
const DEFAULT_WEBHOOK_RETRY_FACTOR = 2.3;
const SHORTEST_ADMIN_TOKEN = 32;
const SMALLEST_LIMIT = 1;
const DEFAULT_REQUESTS_PER_MINUTE = 6000;
const DEFAULT_WEBHOOK_COMMAND_CALLS_PER_MINUTE = 60;
const DEFAULT_STREAMS_PER_IDENTITY = 20;
const DEFAULT_PRESENCE_GRACE_SECONDS = 60;
const SHORTEST_PRESENCE_GRACE_SECONDS = 0;

const isDatabaseUrl = Schema.makeFilter(
  (url: string) =>
    url === "" ||
    (URL.canParse(url) && Arr.contains(["postgres:", "postgresql:"], new URL(url).protocol)) ||
    "DATABASE_URL must be empty or a Postgres URL such as postgres://user:password@host/database.",
);

const isPublicUrl = Schema.makeFilter(
  (url: string) =>
    url === "" || URL.canParse(url) || "COOKOUT_PUBLIC_URL must be empty or a URL such as https://cookout.fly.dev.",
);

const flyAppName = Config.String("FLY_APP_NAME").pipe(Config.withDefault(""));

function publicUrlOf({ app, render, url }: Readonly<{ app: string; render: string; url: string }>): string {
  if (url !== "") {
    return url;
  }
  if (app !== "") {
    return `https://${app}.fly.dev`;
  }
  return render;
}

const adminTokenRule = `COOKOUT_ADMIN_TOKEN must be set to a token of at least ${String(SHORTEST_ADMIN_TOKEN)} characters, such as one made by \`openssl rand -hex 32\`. It becomes the admin identity's token.`;

const isStrongEnoughToken = Schema.makeFilter(
  (adminToken: string) => adminToken.length >= SHORTEST_ADMIN_TOKEN || adminTokenRule,
);

const adminNameRule =
  "COOKOUT_ADMIN_NAME must be an identity name: 1 to 64 lowercase letters, digits or `-`, such as `matt`. It names the identity the admin token belongs to.";

const AdminNameSchema = Schema.String.pipe(Schema.refine(isIdentityName));

function proxyVariable(name: string): Config.Config<string> {
  return Config.String(Str.toLowerCase(name)).pipe(
    Config.orElse(() => Config.String(name)),
    Config.withDefault(""),
  );
}

/** `PORT`: the port `cookout serve` listens on. 0 picks a free port. */
export const port = Config.schema(Schema.Int.check(Schema.isBetween({ maximum: 65_535, minimum: 0 })), "PORT").pipe(
  Config.withDefault(3000),
);

/** `COOKOUT_HOST`: the address `cookout serve` listens on. */
export const host = Config.String("COOKOUT_HOST").pipe(Config.withDefault("0.0.0.0"));

/**
 * `COOKOUT_PUBLIC_URL`: the address the cookout is deployed at, such as
 * `https://cookout.fly.dev`. Its host is answered as well as the server's own
 * (Matt, 2026-11-23, mattpocock/cookout#56). Empty counts as unset, and then on Fly, where `FLY_APP_NAME` names the
 * app, it is `https://<app>.fly.dev`, so the repo's `fly.toml` deploys to a new app unedited (mattpocock/cookout#489),
 * and else the `RENDER_EXTERNAL_URL` Render sets, so `render.yaml` deploys unedited too (mattpocock/cookout#523).
 */
export const publicUrl = Config.all({
  app: flyAppName,
  render: Config.String("RENDER_EXTERNAL_URL").pipe(Config.withDefault("")),
  url: Config.schema(Schema.String.check(isPublicUrl), "COOKOUT_PUBLIC_URL").pipe(Config.withDefault("")),
}).pipe(Config.map(publicUrlOf));

/**
 * `COOKOUT_ADMIN_TOKEN`: the token of the `admin` identity, required by `cookout serve`. Every boot makes it the
 * admin's only token (Matt, 2026-11-23, mattpocock/cookout#85). Unset, empty or shorter than 32 characters, serve
 * refuses to start, and the message never shows the value.
 */
export const adminToken = Config.schema(Schema.String.check(isStrongEnoughToken), "COOKOUT_ADMIN_TOKEN").pipe(
  Config.map((value) => Redacted.make(value)),
);

/**
 * `COOKOUT_ADMIN_NAME`: the name of the identity `COOKOUT_ADMIN_TOKEN` belongs to, `admin` unless set (Matt,
 * 2026-11-23, mattpocock/cookout#107, ADR 0039). Empty counts as unset. Not an identity name, serve refuses to start.
 */
export const adminName: Config.Config<IdentityName> = Config.schema(AdminNameSchema, "COOKOUT_ADMIN_NAME").pipe(
  Config.withDefault(firstAdminName),
);

/** `DATABASE_URL`: the Postgres database `cookout serve` uses over `COOKOUT_DB` (#330); empty is unset. Never shown. */
export const databaseUrl = Config.schema(Schema.Redacted(Schema.String.check(isDatabaseUrl)), "DATABASE_URL").pipe(
  Config.withDefault(Redacted.make("")),
);

/**
 * `COOKOUT_ALLOW_LOCAL_TRIGGERS`: when `true`, an agent's trigger URL may also be `http://localhost`, `127.0.0.1` or
 * `[::1]`, for the dev program and tests (mattpocock/cookout#378). Otherwise only `https` URLs are accepted.
 */
export const allowLocalTriggers = Config.Boolean("COOKOUT_ALLOW_LOCAL_TRIGGERS").pipe(Config.withDefault(false));

/** `COOKOUT_DB`: the SQLite file `cookout serve` keeps its data in when `DATABASE_URL` is unset. */
export const databasePath = Config.String("COOKOUT_DB").pipe(Config.withDefault("cookout.db"));

/**
 * `COOKOUT_ASSETS_DIR`: the folder `cookout serve` keeps attachments' bytes in, one file per attachment, named by its
 * ID. Empty counts as unset, which is an `assets` folder beside `COOKOUT_DB`, so on Fly they stay on the `/data`
 * volume with the database.
 */
export const assetsDirectory = Config.String("COOKOUT_ASSETS_DIR").pipe(Config.withDefault(""));

/**
 * `COOKOUT_ASSET_STORE`: where `cookout serve` keeps attachments' bytes, `disk` (in `COOKOUT_ASSETS_DIR`) or `s3` (in
 * the S3-compatible bucket the `COOKOUT_S3_*` settings name). Empty counts as unset, which is `disk`, so the live
 * board on Fly keeps them on its volume (Matt, 2026-11-24, mattpocock/cookout#375). Anything else, serve refuses to
 * start.
 */
export const assetStoreKind = Config.schema(Schema.Literals(["", "disk", "s3"]), "COOKOUT_ASSET_STORE").pipe(
  Config.withDefault(""),
);

/** Why `cookout serve` refused `COOKOUT_ASSET_STORE`. */
export const assetStoreRule = "COOKOUT_ASSET_STORE must be disk or s3, or empty for disk.";

/**
 * The settings an `s3` asset store needs, each required once `COOKOUT_ASSET_STORE` is `s3` and empty counting as
 * unset: `COOKOUT_S3_BUCKET` (the bucket, never made public), `COOKOUT_S3_ENDPOINT` (its S3 API URL, such as
 * `https://<account>.r2.cloudflarestorage.com`), `COOKOUT_S3_REGION` (`auto` on R2 and Tigris),
 * `COOKOUT_S3_ACCESS_KEY_ID` and `COOKOUT_S3_SECRET_ACCESS_KEY`. Every value is redacted, so none is ever shown.
 */
export const s3SettingNames = {
  accessKeyId: "COOKOUT_S3_ACCESS_KEY_ID",
  bucket: "COOKOUT_S3_BUCKET",
  endpoint: "COOKOUT_S3_ENDPOINT",
  region: "COOKOUT_S3_REGION",
  secretAccessKey: "COOKOUT_S3_SECRET_ACCESS_KEY",
} as const;

/** The `COOKOUT_S3_*` settings, each redacted and empty when unset. */
export const s3Settings = Config.all(
  Rec.map(s3SettingNames, (name) =>
    Config.String(name).pipe(
      Config.withDefault(""),
      Config.map((value) => Redacted.make(value)),
    ),
  ),
);

/**
 * `COOKOUT_MAX_IDLE_EXPIRY`: the longest idle expiry `join --idle-expiry` may ask for, such as `90d` (Matt,
 * 2026-11-23, mattpocock/cookout#114). An agent session token expires once it goes that long unused.
 */
export const maxIdleExpiry = Config.schema(
  Schema.String.check(
    Schema.isPattern(idleExpiryPattern, {
      message: "COOKOUT_MAX_IDLE_EXPIRY must be a whole number of seconds, minutes, hours or days, such as 90d.",
    }),
  ),
  "COOKOUT_MAX_IDLE_EXPIRY",
).pipe(Config.withDefault("90d"));

/**
 * `COOKOUT_WEBHOOK_TIMEOUT_SECONDS`: how long the server waits for a command's handler to answer one webhook
 * delivery. The working default of 5 s is not settled yet (mattpocock/cookout#63).
 */
export const webhookTimeoutSeconds = Config.schema(
  Schema.Int.check(Schema.isGreaterThanOrEqualTo(SHORTEST_WEBHOOK_TIMEOUT_SECONDS)),
  "COOKOUT_WEBHOOK_TIMEOUT_SECONDS",
).pipe(Config.withDefault(DEFAULT_WEBHOOK_TIMEOUT_SECONDS));

/**
 * `COOKOUT_WEBHOOK_RETRY_DELAY_SECONDS`: how long the server waits before it first retries a webhook delivery that
 * got no `2xx`. Each later wait is `COOKOUT_WEBHOOK_RETRY_FACTOR` times the one before, for 5 retries. The working
 * defaults of 10 s and 2.3 wait about 10 s, 23 s, 53 s, 2 min and 5 min; they are not settled yet
 * (mattpocock/cookout#65).
 */
export const webhookRetryDelaySeconds = Config.schema(
  Schema.Finite.check(Schema.isGreaterThanOrEqualTo(SHORTEST_WEBHOOK_RETRY_DELAY_SECONDS)),
  "COOKOUT_WEBHOOK_RETRY_DELAY_SECONDS",
).pipe(Config.withDefault(DEFAULT_WEBHOOK_RETRY_DELAY_SECONDS));

/** `COOKOUT_WEBHOOK_RETRY_FACTOR`: how many times longer each wait between webhook retries is than the one before. */
export const webhookRetryFactor = Config.schema(
  Schema.Finite.check(Schema.isGreaterThanOrEqualTo(SMALLEST_WEBHOOK_RETRY_FACTOR)),
  "COOKOUT_WEBHOOK_RETRY_FACTOR",
).pipe(Config.withDefault(DEFAULT_WEBHOOK_RETRY_FACTOR));

/**
 * `COOKOUT_REQUESTS_PER_MINUTE`: how many requests one identity may make a minute, counted from a full bucket that
 * holds as many and refills evenly (mattpocock/cookout#92, ADR 0033). The default of 6000 is far above any session's
 * use and is not settled yet.
 */
export const requestsPerMinute = Config.schema(
  Schema.Int.check(Schema.isGreaterThanOrEqualTo(SMALLEST_LIMIT)),
  "COOKOUT_REQUESTS_PER_MINUTE",
).pipe(Config.withDefault(DEFAULT_REQUESTS_PER_MINUTE));

/**
 * `COOKOUT_COMMAND_CALLS_PER_MINUTE`: how many command calls one identity may make a minute, in a bucket of its own
 * on top of the request one, because each call fans out to the command's handler. The default of 60 is not settled
 * yet.
 */
export const webhookCommandCallsPerMinute = Config.schema(
  Schema.Int.check(Schema.isGreaterThanOrEqualTo(SMALLEST_LIMIT)),
  "COOKOUT_COMMAND_CALLS_PER_MINUTE",
).pipe(Config.withDefault(DEFAULT_WEBHOOK_COMMAND_CALLS_PER_MINUTE));

/** `COOKOUT_STREAMS_PER_IDENTITY`: how many `/v1/events` streams one identity may hold open at once. */
export const streamsPerIdentity = Config.schema(
  Schema.Int.check(Schema.isGreaterThanOrEqualTo(SMALLEST_LIMIT)),
  "COOKOUT_STREAMS_PER_IDENTITY",
).pipe(Config.withDefault(DEFAULT_STREAMS_PER_IDENTITY));

/**
 * `COOKOUT_PRESENCE_GRACE_SECONDS`: how long an identity stays online after its last live connection closes, so a
 * `cookout watch` that Monitor restarts never shows offline (Matt, 2026-11-23, presence grilling Q8, mattpocock/cookout#177).
 */
export const presenceGraceSeconds = Config.schema(
  Schema.Int.check(Schema.isGreaterThanOrEqualTo(SHORTEST_PRESENCE_GRACE_SECONDS)),
  "COOKOUT_PRESENCE_GRACE_SECONDS",
).pipe(Config.withDefault(DEFAULT_PRESENCE_GRACE_SECONDS));

/** `COOKOUT_STATE_DIR`: where the CLI keeps the agent session token `join` issued. Empty counts as unset. */
export const stateDirectory = Config.String("COOKOUT_STATE_DIR").pipe(Config.withDefault(""));

/** `XDG_STATE_HOME`: the CLI keeps its state in `cookout/` under it when `COOKOUT_STATE_DIR` is unset. */
export const xdgStateHome = Config.String("XDG_STATE_HOME").pipe(Config.withDefault(""));

/**
 * `HOME`: the CLI keeps its state in `~/.local/state/cookout` when neither of
 * the above is set. With none of the three, the CLI keeps no agent session token and `join`
 * is refused with `state_folder_missing`.
 */
export const home = Config.String("HOME").pipe(Config.withDefault(""));

/**
 * `XDG_CONFIG_HOME`: the CLI keeps the Login from `cookout login` in `cookout/credentials` under it, or under
 * `~/.config` when it is unset. Empty counts as unset.
 */
export const xdgConfigHome = Config.String("XDG_CONFIG_HOME").pipe(Config.withDefault(""));

/** `COOKOUT_URL`: the server every CLI verb but `serve` talks to. Empty counts as unset. */
export const cookoutUrl = Config.String("COOKOUT_URL").pipe(Config.withDefault(""));

/** `COOKOUT_TOKEN`: the bearer token every CLI verb but `serve` sends. Empty counts as unset. */
export const cookoutToken = Config.String("COOKOUT_TOKEN").pipe(Config.withDefault(""));

/**
 * `COOKOUT_AUTH`: `proxy` says a proxy adds the credential, as a cloud session's network proxy adds
 * `Authorization: Bearer`, so every CLI verb but `serve`, `join`, `login` and `logout` sends no token
 * (mattpocock/cookout#340). Any other value is refused. Empty counts as unset.
 */
export const cookoutAuth = Config.String("COOKOUT_AUTH").pipe(Config.withDefault(""));

/**
 * `COOKOUT_SESSION`: an agent session token, such as one `cookout join --print-env` printed, that every CLI verb but
 * `serve` sends ahead of everything inside a harness, and when `COOKOUT_TOKEN` is unset outside one
 * (mattpocock/cookout#150). Empty counts as unset.
 */
export const cookoutSession = Config.String("COOKOUT_SESSION").pipe(Config.withDefault(""));

/**
 * `HTTP_PROXY`, `HTTPS_PROXY` and `NO_PROXY`: the proxy every CLI verb but `serve` sends `http://` and `https://`
 * requests through (`https://` falls back to `HTTP_PROXY`), and the hosts it reaches directly. Each lowercase name, as
 * curl reads it, comes first (mattpocock/cookout#156). Empty counts as unset.
 */
export const proxyEnvironment = Config.all({
  httpProxy: proxyVariable("HTTP_PROXY"),
  httpsProxy: proxyVariable("HTTPS_PROXY"),
  noProxy: proxyVariable("NO_PROXY"),
});

/**
 * The variables that show which harness runs the CLI (such as `CLAUDECODE` for Claude Code, and `AI_AGENT`), and
 * `COOKOUT_ALLOW_HUMAN`, as one environment for `harnessIn`. Each defaults to empty.
 */
export const harnessEnvironment: Config.Config<Readonly<Record<string, string>>> = Config.all(
  Rec.fromEntries(Arr.map(harnessVariables, (name) => [name, Config.String(name).pipe(Config.withDefault(""))])),
);

/** Why `cookout serve` refused `COOKOUT_ADMIN_TOKEN`, and how to set it. It never includes the value. */
export { adminTokenRule };

/** Why `cookout serve` refused `COOKOUT_ADMIN_NAME`: the identity-name rule. */
export { adminNameRule };
