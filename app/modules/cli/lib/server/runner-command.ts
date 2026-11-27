import { install, uninstall } from "./runner-service.ts";
import { logsCommand, registerCommand, statusCommand, unregisterCommand } from "./runner-commands.ts";
import type { AgentSessionStateNeeds } from "./agent-session-state.ts";
import type { ChildProcessSpawner } from "effect/process";
import { Command } from "effect/cli";
import type { CommandFailed } from "./output.ts";
import { answered } from "./output.ts";
import { startCommand } from "./runner.ts";

type Spawner = ChildProcessSpawner.ChildProcessSpawner;

const installCommand = Command.make("install", {}, () => answered(install)).pipe(
  Command.withDescription(
    "Make the runner start at boot: write and enable a service that runs `cookout runner start` with this " +
      "COOKOUT_STATE_DIR, its output going to runner.log in it. A systemd user unit with linger on (Linux, and " +
      "WSL2 once systemd is on in /etc/wsl.conf) or a launchd LaunchAgent (macOS). Running it again is harmless.",
  ),
);

const uninstallCommand = Command.make("uninstall", {}, () => answered(uninstall)).pipe(
  Command.withDescription("Stop and remove the service runner install made. With none there, it does nothing."),
);

const runnerCommand: Command.Command<"runner", object, object, CommandFailed, AgentSessionStateNeeds | Spawner> =
  Command.make("runner").pipe(
    Command.withDescription(
      "Wake registered agents on mentions while their harness sessions are closed, and deliver mentions into " +
        "an open Claude Code session's inbox. Launch Claude Code with " +
        `claude --settings '{"crossSessionInbound":"accept"}' so it takes them: then any process running as your ` +
        "OS user can post into that session.",
    ),
    Command.withSubcommands([
      registerCommand,
      startCommand,
      unregisterCommand,
      statusCommand,
      logsCommand,
      installCommand,
      uninstallCommand,
    ]),
  );

export { runnerCommand };
export { onRunnerHost } from "./host.ts";
