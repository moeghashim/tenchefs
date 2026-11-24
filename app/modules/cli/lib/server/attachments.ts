import { Argument, Command, Flag } from "effect/cli";
import type { AttachmentBytes, AttachmentId, NewAttachment } from "../../../sdk/index.ts";
import { Effect, FileSystem, Option, Path, String as Str } from "effect";
import { attachmentLimits, isAttachmentId } from "../../../attachments/index.ts";
import { printLine, refused } from "./output.ts";
import type { AgentSessionStateNeeds } from "./agent-session-state.ts";
import type { CallFailure } from "./adapters/call-failure.ts";
import type { MessageResponse } from "../../../messages/index.ts";
import type { PostMessageRequest } from "../../../messages/client.ts";
import { callServer } from "./adapters/sdk.ts";

const NO_BYTES = 0;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const UP_TO_LAST_SEPARATOR = /^.*[/\\]/su;
const NOT_A_NAME = new Set(["", ".", ".."]);

type Local<Value> = Effect.Effect<Value, CallFailure, AgentSessionStateNeeds>;

interface AssetGetFlags {
  readonly force: boolean;
  readonly attachment: string;
  readonly output: Option.Option<string>;
}

interface Download {
  readonly attachmentId: AttachmentId;
  readonly force: boolean;
  readonly output: Option.Option<string>;
  readonly read: AttachmentBytes;
}

interface Attaching {
  readonly files: readonly string[];
  readonly request: PostMessageRequest;
}

const tooMany: CallFailure = {
  code: "too_many_attachments",
  message: `A message can have at most ${String(attachmentLimits.maximumCount)} attachments.`,
};

function usage(message: string): CallFailure {
  return { code: "usage", message };
}

function checkedSize(file: string, size: number): Local<void> {
  if (size === NO_BYTES) {
    return Effect.fail({ code: "attachment_empty", message: `${file} is empty: an attachment needs at least 1 byte.` });
  }
  if (size > attachmentLimits.maximumBytes) {
    return Effect.fail({
      code: "attachment_too_large",
      message: `${file} is over 10 MB, the most an attachment can be.`,
    });
  }
  return Effect.void;
}

function readAttachment(file: string): Local<NewAttachment> {
  return Effect.gen(function* readOne() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const info = yield* fs.stat(file).pipe(Effect.mapError(() => usage(`There is no file at ${file}.`)));
    yield* checkedSize(file, Number(info.size));
    const bytes = yield* fs.readFile(file).pipe(Effect.mapError(() => usage(`${file} can't be read.`)));
    return { bytes, name: path.basename(file) };
  });
}

function readAttachments(files: readonly string[]): Local<readonly NewAttachment[]> {
  if (files.length > attachmentLimits.maximumCount) {
    return Effect.fail(tooMany);
  }
  return Effect.forEach(files, readAttachment, ONE_AT_A_TIME);
}

function safeName(name: string, attachmentId: AttachmentId): string {
  const base = Str.replace(UP_TO_LAST_SEPARATOR, "")(name);
  if (NOT_A_NAME.has(base)) {
    return attachmentId;
  }
  return base;
}

function writeFlag(force: boolean): "w" | "wx" {
  if (force) {
    return "w";
  }
  return "wx";
}

function targetFor(chosen: string, named: string): Local<string> {
  return Effect.gen(function* findTarget() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const isFolder = yield* fs.stat(chosen).pipe(
      Effect.map((info) => info.type === "Directory"),
      Effect.orElseSucceed(() => false),
    );
    if (isFolder) {
      return path.join(chosen, named);
    }
    return chosen;
  });
}

function saved({ attachmentId, force, output, read }: Download): Local<Readonly<Record<string, unknown>>> {
  return Effect.gen(function* saveAsset() {
    const fs = yield* FileSystem.FileSystem;
    const named = safeName(read.name, attachmentId);
    const target = yield* targetFor(
      Option.getOrElse(output, () => named),
      named,
    );
    yield* fs
      .writeFile(target, read.bytes, { flag: writeFlag(force) })
      .pipe(
        Effect.catchReasons(
          "PlatformError",
          { AlreadyExists: () => Effect.fail(usage(`${target} already exists: pass --force to overwrite it.`)) },
          () => Effect.fail(usage(`${target} can't be written.`)),
        ),
      );
    return { contentType: read.contentType, id: attachmentId, name: read.name, path: target, size: read.bytes.length };
  });
}

function download({ attachment, force, output }: AssetGetFlags): Local<Readonly<Record<string, unknown>>> {
  if (!isAttachmentId(attachment)) {
    return Effect.fail(usage(`${attachment} is not an attachment ID.`));
  }
  return Effect.flatMap(
    callServer((client) => client.getAttachment(attachment)),
    (read) => saved({ attachmentId: attachment, force, output, read }),
  );
}

const assetGetCommand = Command.make(
  "get",
  {
    attachment: Argument.String("id").pipe(Argument.withDescription("The attachment's ID, as its message lists it.")),
    force: Flag.Boolean("force").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Overwrite the file if it exists."),
    ),
    output: Flag.String("output").pipe(
      Flag.withAlias("o"),
      Flag.optional,
      Flag.withDescription("The file to write, or a folder to write it into. Default: its base name, in this folder."),
    ),
  },
  (flags) => Effect.matchEffect(download(flags), { onFailure: refused, onSuccess: printLine }),
).pipe(Command.withDescription("Download an attachment to a file, and print where it went. Never to stdout."));

const assetCommand = Command.make("asset").pipe(
  Command.withDescription("Download the files attached to messages."),
  Command.withSubcommands([assetGetCommand]),
);

const attachFlag = Flag.String("attach").pipe(
  Flag.atLeast(NO_BYTES),
  Flag.withDescription("A file to attach, up to 10 MB. Repeat it for up to 10 files."),
);

function postAttaching({ files, request }: Attaching): Local<MessageResponse> {
  return Effect.flatMap(readAttachments(files), (attachments) =>
    callServer((client) => client.createMessage({ ...request, attachments })),
  );
}

export { assetCommand, attachFlag, postAttaching };
