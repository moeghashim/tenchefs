import { Argument, Command, Flag } from "effect/cli";
import { Option } from "effect";
import { answer } from "./output.ts";
import { isScheduledMessageId } from "../../../scheduled-messages/index.ts";

const NOTHING = {};

const scheduleIdArgument = Argument.Int("scheduled-message-id").pipe(
  Argument.filterMap(
    (value) => Option.liftPredicate(value, isScheduledMessageId),
    (value) => `${String(value)} is not a Scheduled message ID.`,
  ),
);

const timing = {
  at: Flag.String("at").pipe(
    Flag.optional,
    Flag.withDescription("Post once at this moment, such as 2026-12-01T09:00, read in --tz unless it has an offset."),
  ),
  cron: Flag.String("cron").pipe(
    Flag.optional,
    Flag.withDescription("Post on this 5-field cron expression, read in --tz, at most once every 30 minutes."),
  ),
  tz: Flag.String("tz").pipe(
    Flag.withDefault(Intl.DateTimeFormat().resolvedOptions().timeZone),
    Flag.withDescription("The IANA time zone, such as Europe/London. Default: this machine's."),
  ),
};

function present(key: "at" | "cron", value: Option.Option<string>): Partial<Record<"at" | "cron", string>> {
  return Option.match(value, { onNone: () => NOTHING, onSome: (given) => ({ [key]: given }) });
}

const createCommand = Command.make(
  "create",
  { ...timing, channel: Argument.String("channel"), text: Argument.String("text") },
  ({ at, channel, cron, text, tz }) =>
    answer((client) =>
      client.createScheduledMessage({ channel, text, timeZone: tz, ...present("cron", cron), ...present("at", at) }),
    ),
).pipe(Command.withDescription("Schedule a message to post in a channel as you, on --cron or once --at."));

const listCommand = Command.make(
  "list",
  { channel: Argument.String("channel").pipe(Argument.optional) },
  ({ channel }) =>
    answer((client) =>
      client.listScheduledMessages(
        Option.match(channel, { onNone: () => NOTHING, onSome: (name) => ({ channel: name }) }),
      ),
    ),
).pipe(Command.withDescription("List every Scheduled message, or one channel's."));

const getCommand = Command.make("get", { id: scheduleIdArgument }, ({ id }) =>
  answer((client) => client.getScheduledMessage(id)),
).pipe(Command.withDescription("Show one Scheduled message: its timing, next runs, last run and why it is paused."));

const pauseCommand = Command.make("pause", { id: scheduleIdArgument }, ({ id }) =>
  answer((client) => client.pauseScheduledMessage(id)),
).pipe(Command.withDescription("Pause a Scheduled message: yours, an agent's you own, or any as an admin."));

const resumeCommand = Command.make("resume", { id: scheduleIdArgument }, ({ id }) =>
  answer((client) => client.resumeScheduledMessage(id)),
).pipe(Command.withDescription("Resume a paused Scheduled message. Runs missed while it was paused are not posted."));

const deleteCommand = Command.make("delete", { id: scheduleIdArgument }, ({ id }) =>
  answer((client) => client.deleteScheduledMessage(id)),
).pipe(Command.withDescription("Delete a Scheduled message. The messages it posted stay."));

const scheduleCommand = Command.make("schedule").pipe(
  Command.withDescription("Create, list, show, pause, resume and delete Scheduled messages."),
  Command.withSubcommands([createCommand, listCommand, getCommand, pauseCommand, resumeCommand, deleteCommand]),
);

export { scheduleCommand };
