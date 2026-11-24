/**
 * The `cookout` command tree. `serve` starts the server; every other verb
 * calls the server through the SDK. `watch` prints one stdout line per new
 * inbox item, and everything else on stderr. Answers are JSON on stdout; refusals are
 * `{ error: { code, message } }` on stderr with exit code 1. `Secrets` comes
 * from the caller: `serve` issues tokens with it, and `join`
 * names its agent session state file with it.
 *
 * Ctrl-C or SIGTERM is how `serve` and `watch` stop, so they exit 0 on one. Any other verb so interrupted prints
 * `{ error: { code: "interrupted" } }` on stderr, as every refusal is, and exits 1, never exit 0 with no output
 * (mattpocock/cookout#297, mattpocock/cookout#299). A stopped `watch` waits at most 2 s for its clean close, and
 * never for a connection it is still opening, so it exits promptly even when the board has stopped answering.
 *
 * Any other failure before `serve` is listening, such as a port in use or a bad setting, prints one stderr line,
 * `cookout serve failed to start: <tag>: <message>`, plus the first stack frame for a defect, and exits 1
 * (mattpocock/cookout#261). A bad setting's line names the variable and its rule, never its value.
 *
 * Every verb but `serve`, `join`, `login` and `logout` sends one credential. Inside a harness it is the first of:
 * the agent session token in `COOKOUT_SESSION`, the agent session this harness session joined, and `COOKOUT_TOKEN`;
 * with none of them, it is refused with `not_joined`. Outside one it is the first of `COOKOUT_TOKEN`,
 * `COOKOUT_SESSION` and the Login (mattpocock/cookout#150). `whoami` says on stderr when it ignored `COOKOUT_TOKEN`.
 *
 * `join` runs inside a harness session (Claude Code's `CLAUDE_CODE_SESSION_ID`, which its subagents share) and
 * keeps the agent session token it was issued in a state file for that session and server, under
 * `COOKOUT_STATE_DIR` (default `$XDG_STATE_HOME/cookout`, then `~/.local/state/cookout`); the file's name is a hash.
 * It prints the agent, `created`, the times and the credential's `source`, never the token (mattpocock/cookout#145).
 * Outside a harness it is `harness_missing`, in a tool that gives no session ID `harness_session_missing`,
 * and in a session that has joined `already_joined`, unless `--print-env`, which keeps nothing and prints
 * `export COOKOUT_SESSION=...`. `leave` revokes the token it sends and forgets a joined session's. On
 * `agent_session_revoked` or `agent_session_expired` the stored token is deleted and the message says to run
 * `cookout join` again. The state folder and its `agent-sessions/` folder must be folders only the user
 * can open (mode 700, not symlinks), or the command fails with
 * `agent_session_state_unsafe`; `join` makes them so. A state file that can't
 * be read as one is `agent_session_state_damaged`; any other failure of the CLI
 * itself, rather than a refusal, is `cli_error`.
 *
 * `login` takes the board's URL from `--url`, else `COOKOUT_URL`, else asks for it on a terminal (`usage` with
 * none); a bare host means `https://`. Login and logout go through `HTTPS_PROXY` as every other command does, so a
 * board they can't reach is `unreachable`, and one that answers but not `/v1/health` is `not_a_cookout`.
 * `login --token` reads a human identity's token from stdin (never the command
 * line), checks it with the server, and keeps it as the Login for that board
 * in the credentials file, `$XDG_CONFIG_HOME/cookout/credentials` (default
 * `~/.config/cookout/credentials`), one entry per server URL, mode 600. The most recent login's board is the
 * default board, which every verb uses when `COOKOUT_URL` is unset (mattpocock/cookout#126). An
 * agent's token is `human_only`. `logout` removes the Login for `--url`, else `COOKOUT_URL`, else the default
 * board. `whoami` adds the credential's `source`, the board's `url` and
 * a `summary` such as `ada (login) at https://cookout.fly.dev`. A credentials file that isn't mode
 * 600 and yours, or is a symlink, is `credentials_unsafe`; one that can't be
 * read as one is `credentials_damaged`.
 *
 * `--version` prints `package.json`'s version, which the build inlines into the bundle (mattpocock/cookout#175).
 */
import { CliError, Command } from "effect/cli";
import { cookoutServer, serveCommand } from "./lib/server/serve.ts";
import { loginCommand, logoutCommand } from "./lib/server/login.ts";
import { usageFailed, withJsonPresenter } from "./lib/server/output.ts";

import { Effect } from "effect";
import type { ServeLayers } from "./lib/server/serve.ts";
import packageJson from "../../../package.json" with { type: "json" };
import { sayInterrupted } from "./lib/server/interrupted.ts";
import { verbCommands } from "./lib/server/verbs.ts";
import { watchCommand } from "./lib/server/watch.ts";
import { whoamiCommand } from "./lib/server/whoami.ts";

export { cookoutServer, type ServeLayers };

/** Runs one `cookout` command line (without the `node` and script words). */
export const runCookout = (args: readonly string[], layers: ServeLayers) =>
  Command.make("cookout").pipe(
    Command.withDescription("A self-hosted, Slack-style board for people and agents."),
    Command.withSubcommands([
      serveCommand(layers),
      loginCommand,
      logoutCommand,
      whoamiCommand,
      ...verbCommands,
      watchCommand,
    ]),
    (command) => Command.runWith(command, { version: packageJson.version })(args),
    Effect.catchIf(CliError.isCliError, () => usageFailed),
    withJsonPresenter,
    Effect.onInterrupt(() => sayInterrupted(args)),
  );

export { exitCodeAfterFailure } from "./lib/server/interrupted.ts";
