import { Argument, Command, Flag } from "effect/cli";
import { Effect, Option, Stdio, String as Str, Stream } from "effect";
import { boardToLogOutOf, checked, firstLineOnTerminal, givenBoard, typedOnTerminal } from "./board-url.ts";
import { callServerAsPerson, toFailure } from "./adapters/sdk.ts";
import { logInByBrowser, revokedOnServer } from "./browser-login.ts";
import { loginFor, removeLogin, saveLogin } from "./logins.ts";
import { throughProxy, toFailureAt } from "./adapters/http.ts";
import type { AgentSessionStateNeeds } from "./agent-session-state.ts";
import type { CallFailure } from "./adapters/sdk.ts";
import type { CommandFailed } from "./output.ts";
import type { LoggedIn } from "./browser-login.ts";
import { answered } from "./output.ts";
import { createCookoutClient } from "../../../sdk/index.ts";

type LoginNeeds = AgentSessionStateNeeds | Stdio.Stdio;

const NOTHING = {};

interface LoggedOut {
  readonly loggedOut: boolean;
  readonly message?: string;
  readonly revoked?: boolean;
  readonly url: string;
}

const noToken: CallFailure = {
  code: "usage",
  message: "Give the token on stdin, such as `cookout login --token < token.txt`, or paste it and press Ctrl-D.",
};

const stdinText: Effect.Effect<string, CallFailure, Stdio.Stdio> = Effect.flatMap(Stdio.Stdio, (stdio) =>
  stdio.stdin.pipe(Stream.decodeText, Stream.mkString, Effect.mapError(toFailure)),
);

function tokenIn(text: string): Effect.Effect<string, CallFailure> {
  const token = Str.trim(text);
  if (token === "") {
    return Effect.fail(noToken);
  }
  return Effect.succeed(token);
}

interface TokenOnStdin {
  readonly text: string;
  readonly url: string;
}

function tokenAndBoard(flag: Option.Option<string>): Effect.Effect<TokenOnStdin, CallFailure, Stdio.Stdio> {
  return Effect.flatMap(
    givenBoard(flag),
    Option.match({
      onNone: () =>
        Effect.flatMap(typedOnTerminal, ({ rest, url }) =>
          Effect.map(checked(url), (board) => ({ text: rest, url: board })),
        ),
      onSome: (given) => Effect.zipWith(checked(given), stdinText, (url, text) => ({ text, url })),
    }),
  );
}

function boardForBrowser(flag: Option.Option<string>): Effect.Effect<string, CallFailure, Stdio.Stdio> {
  return Effect.flatMap(
    givenBoard(flag),
    Option.match({ onNone: () => Effect.flatMap(firstLineOnTerminal, checked), onSome: checked }),
  );
}

function humanOnly(name: string): CallFailure {
  return {
    code: "human_only",
    message: `${name} is an agent. A Login is a person's: log in with a human identity's token, and give an agent its token through COOKOUT_TOKEN.`,
  };
}

function logIn(flag: Option.Option<string>): Effect.Effect<LoggedIn, CallFailure, LoginNeeds> {
  return Effect.gen(function* keepLogin() {
    const { text, url } = yield* tokenAndBoard(flag);
    const token = yield* tokenIn(text);
    const client = yield* Effect.try({
      catch: toFailure,
      try: () => createCookoutClient({ env: NOTHING, token, url }),
    });
    const { identity } = yield* Effect.tryPromise({ catch: toFailureAt(url), try: () => client.whoami() });
    if (identity.kind !== "human") {
      return yield* Effect.fail(humanOnly(identity.name));
    }
    yield* saveLogin({ token, url });
    return { identity, url };
  });
}

const noBoard: LoggedOut = { loggedOut: false, message: "This machine has no default board to log out of.", url: "" };

function logOut(flag: Option.Option<string>): Effect.Effect<LoggedOut, CallFailure, AgentSessionStateNeeds> {
  return Effect.gen(function* forgetLogin() {
    const board = yield* boardToLogOutOf(flag);
    if (Option.isNone(board)) {
      return noBoard;
    }
    const url = board.value;
    const saved = yield* loginFor(url);
    if (Option.isNone(saved)) {
      return { loggedOut: false, message: `There is no Login for ${url}.`, url };
    }
    const revoked = yield* revokedOnServer({ token: saved.value, url });
    yield* removeLogin(url);
    return { loggedOut: true, revoked, url };
  });
}

function logInWith({ token, url }: LoginFlags): Effect.Effect<LoggedIn, CallFailure, LoginNeeds> {
  if (token) {
    return logIn(url);
  }
  return Effect.flatMap(boardForBrowser(url), logInByBrowser);
}

function proxied<Value>(
  run: Effect.Effect<Value, CallFailure, LoginNeeds>,
): Effect.Effect<Value, CallFailure, LoginNeeds> {
  return Effect.scoped(Effect.andThen(throughProxy, run));
}

const tokenFlag = Flag.Boolean("token").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Read a human identity's token from stdin, never from the command line."),
);

interface LoginFlags {
  readonly token: boolean;
  readonly url: Option.Option<string>;
}

const loginUrlFlag = Flag.String("url").pipe(
  Flag.optional,
  Flag.withDescription(
    "The board's URL, such as https://cookout.fly.dev (a bare host means https://). Default: COOKOUT_URL, else asked for.",
  ),
);

type LoginCommand = Command.Command<"login", LoginFlags, object, CommandFailed, LoginNeeds>;

const loginCodeArgument = Argument.String("code").pipe(
  Argument.withDescription("The user code the waiting `cookout login` printed, such as WDJB-MJHT."),
);

const loginApproveCommand = Command.make("approve", { code: loginCodeArgument }, ({ code }) =>
  answered(callServerAsPerson((client) => client.approveLogin(code))),
).pipe(
  Command.withDescription(
    "Approve another machine's waiting `cookout login` by the code it printed, as a person does on the approval " +
      "page, acting as this machine's Login or COOKOUT_TOKEN. The other machine then collects its own Login. An " +
      "agent's credential is refused with human_only, and inside a harness or a wake run it is refused with " +
      "approval_in_harness, even with COOKOUT_ALLOW_HUMAN=1. Prints the request as approved.",
  ),
);

const loginCommand: LoginCommand = Command.make("login", { token: tokenFlag, url: loginUrlFlag }, (flags) =>
  logInWith(flags).pipe(proxied, answered),
).pipe(
  Command.withDescription(
    "Log this machine in to a board: check it answers as a cookout, print a link and a code, and wait while a person " +
      "approves it in the web UI. With --token, keep a human identity's token instead. The Login is kept in " +
      "$XDG_CONFIG_HOME/cookout/credentials (default ~/.config/cookout/credentials, mode 600), and its board becomes " +
      "this machine's default board, which every command uses when COOKOUT_URL is unset. With no COOKOUT_TOKEN and no " +
      "harness, every command then acts as that person; inside a harness, join uses it to join an agent the " +
      "person owns. An agent's token is refused.",
  ),
  Command.withSubcommands([loginApproveCommand]),
);

const logoutUrlFlag = Flag.String("url").pipe(
  Flag.optional,
  Flag.withDescription("The board to log out of. Default: COOKOUT_URL, else this machine's default board."),
);

const logoutCommand = Command.make("logout", { url: logoutUrlFlag }, ({ url }) =>
  logOut(url).pipe(proxied, answered),
).pipe(
  Command.withDescription(
    "Remove this machine's Login for a board, and revoke it on the server if it came from a browser login.",
  ),
);

export { loginCommand, logoutCommand };
