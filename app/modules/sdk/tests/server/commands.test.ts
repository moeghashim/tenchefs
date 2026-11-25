import { Array as Arr, Effect } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import { TestCookout, answer, refusal, testCookout, webhookCommandFixture } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { TestCookoutService } from "../../../testing/server.ts";
import { webhookCommandsPath } from "../../../webhook-commands/index.ts";

interface RawAnswer {
  readonly json: unknown;
  readonly status: number;
}

const BOOT = "2026-01-01T00:00:00.000Z";
const NO_REPLIES = 0;
const schema = { properties: { branch: { type: "string" } }, required: ["branch"], type: "object" };
const deploy = { name: "deploy", schema, url: "https://hooks.example.com/deploy" };

function postRawWebhookCommand(
  cookout: TestCookoutService,
  body: string,
): Effect.Effect<RawAnswer, never, HttpClient.HttpClient> {
  return HttpClientRequest.post(`${cookout.url}${webhookCommandsPath}`).pipe(
    HttpClientRequest.setHeader("authorization", `Bearer ${cookout.adminToken}`),
    HttpClientRequest.bodyText(body, "application/json"),
    HttpClient.execute,
    Effect.flatMap((response) => Effect.map(response.json, (json) => ({ json, status: response.status }))),
    Effect.orDie,
  );
}

it.effect("a command add by an identity that is not an admin is refused with 403", () =>
  Effect.gen(function* notAdmin() {
    const cookout = yield* TestCookout;
    const ann = yield* cookout.createIdentity("ann");
    const error = yield* refusal(() => ann.client.addCommand(deploy));
    const { commands } = yield* answer(cookout.client.listCommands);

    expect(error).toMatchObject({ code: "admin_only", status: 403 });
    expect(Arr.map(commands, ({ name }) => name)).toStrictEqual([]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect(
  "an admin adds a command: its secret is shown once, it is listed, and its handler is a flagged agent it owns",
  () =>
    Effect.gen(function* addAndList() {
      const cookout = yield* TestCookout;
      const ann = yield* cookout.createIdentity("ann");
      const added = yield* answer(() => cookout.client.addCommand({ ...deploy, description: "Ship a branch" }));
      const listed = yield* answer(ann.client.listCommands);
      const { identities } = yield* answer(ann.client.listIdentities);
      const command = {
        createdAt: BOOT,
        description: "Ship a branch",
        handler: "deploy",
        name: "deploy",
        schema,
        url: deploy.url,
      };

      expect(added).toStrictEqual({ command, secret: "hmac_test_3" });
      expect(listed.commands).toStrictEqual([command]);
      expect(Arr.filter(identities, (identity) => "handler" in identity)).toStrictEqual([
        { admin: false, createdAt: BOOT, handler: true, kind: "agent", name: "deploy", owner: "admin" },
      ]);
    }).pipe(Effect.provide(testCookout())),
);

it.effect("a running cookout gives each command its own random secret", () =>
  Effect.gen(function* liveSecrets() {
    const cookout = yield* TestCookout;
    const first = yield* answer(() => cookout.client.addCommand(deploy));
    const second = yield* answer(() => cookout.client.addCommand({ ...deploy, name: "release" }));

    expect(first.secret).toMatch(/^hmac_[A-Za-z0-9_-]{43}$/u);
    expect(second.secret).not.toBe(first.secret);
  }).pipe(Effect.provide(testCookout({ secrets: "live" }))),
);

it.effect("a command whose name is an agent's reuses that agent as its handler", () =>
  Effect.gen(function* reuseAgent() {
    const cookout = yield* TestCookout;
    const bot = yield* cookout.createIdentity("deploy", { owner: "matt" });
    yield* answer(() => cookout.client.addCommand(deploy));
    const { identities } = yield* answer(cookout.client.listIdentities);
    const { identity } = yield* answer(bot.client.whoami);
    const got = yield* answer(() => cookout.client.getIdentity("deploy"));

    expect(identities).toContainEqual({ ...bot.identity, handler: true });
    expect([identity, got.identity]).toStrictEqual([bot.identity, { ...bot.identity, handler: true }]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a command name in use, or a human's name, is refused with 409", () =>
  Effect.gen(function* nameTaken() {
    const cookout = yield* TestCookout;
    yield* cookout.createIdentity("ada", { kind: "human" });
    yield* answer(() => cookout.client.addCommand(deploy));
    const again = yield* refusal(() => cookout.client.addCommand(deploy));
    const human = yield* refusal(() => cookout.client.addCommand({ ...deploy, name: "ada" }));
    const { commands } = yield* answer(cookout.client.listCommands);

    expect([again, human]).toMatchObject([
      { code: "command_exists", status: 409 },
      { code: "handler_not_agent", status: 409 },
    ]);
    expect(Arr.map(commands, ({ name }) => name)).toStrictEqual(["deploy"]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a command with a bad name, url or schema is refused with 400", () =>
  Effect.gen(function* badRequest() {
    const cookout = yield* TestCookout;
    const name = yield* refusal(() => cookout.client.addCommand({ ...deploy, name: "Deploy!" }));
    const url = yield* refusal(() => cookout.client.addCommand({ ...deploy, url: "ftp://example.com" }));
    const notObject = yield* postRawWebhookCommand(
      cookout,
      '{"name":"deploy","url":"https://example.com","schema":[]}',
    );

    expect([name, url]).toMatchObject([
      { code: "invalid_request", schemaProblems: [{ path: ["name"] }], status: 400 },
      { code: "invalid_request", schemaProblems: [{ path: ["url"] }], status: 400 },
    ]);
    expect(notObject).toMatchObject({
      json: { error: { code: "invalid_request", details: [{ path: ["schema"] }] } },
      status: 400,
    });
  }).pipe(Effect.provide([testCookout(), FetchHttpClient.layer])),
);

function withDeployInGrill(cookout: TestCookoutService): Effect.Effect<void> {
  return Effect.gen(function* addDeploy() {
    yield* answer(() => cookout.client.addCommand({ ...deploy, url: `${cookout.webhook.url}/deploy` }));
    yield* answer(() => cookout.client.createChannel({ name: "grill" }));
  });
}

it.effect(
  "a call whose data breaks the command's schema is refused with 400 and the schema errors, and posts nothing",
  () =>
    Effect.gen(function* badData() {
      const cookout = yield* TestCookout;
      yield* withDeployInGrill(cookout);
      const ann = yield* cookout.createIdentity("ann");
      const missing = yield* refusal(() => ann.client.callCommand("deploy", { channel: "grill", data: {} }));
      const wrongType = yield* refusal(() =>
        ann.client.callCommand("deploy", { channel: "grill", data: { branch: 1 } }),
      );
      const { messages } = yield* answer(() => ann.client.listMessages("grill"));

      expect([missing, wrongType]).toMatchObject([
        {
          code: "invalid_request",
          schemaProblems: [{ message: "must have required property 'branch'", path: ["data"] }],
          status: 400,
        },
        {
          code: "invalid_request",
          schemaProblems: [{ message: "must be string", path: ["data", "branch"] }],
          status: 400,
        },
      ]);
      expect(messages).toStrictEqual([]);
    }).pipe(Effect.provide(testCookout())),
);

it.effect("a good call answers 202 with its thread, posts the call by the caller, and the caller follows it", () =>
  Effect.gen(function* goodCall() {
    const cookout = yield* TestCookout;
    yield* withDeployInGrill(cookout);
    const ann = yield* cookout.createIdentity("ann");
    const called = yield* answer(() =>
      ann.client.callCommand("deploy", { channel: "grill", data: { branch: "main" } }),
    );
    const { messages } = yield* answer(() => ann.client.listMessages("grill"));
    const { message: reply } = yield* answer(() =>
      cookout.client.createMessage({ channel: "grill", replyTo: called.threadId, text: "on it" }),
    );
    const { items } = yield* answer(() => ann.client.inbox());

    expect(called).toStrictEqual({ messageId: called.threadId, threadId: called.threadId });
    expect(messages).toMatchObject([
      {
        author: { name: "ann" },
        data: { command: "deploy", data: { branch: "main" } },
        id: called.messageId,
        kind: "top-level",
        replyCount: NO_REPLIES,
      },
    ]);
    expect(items).toMatchObject([{ message: reply, reasons: ["followed-thread"] }]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a call to a command that doesn't exist, or into a channel that doesn't, is refused with 404", () =>
  Effect.gen(function* missing() {
    const cookout = yield* TestCookout;
    yield* withDeployInGrill(cookout);
    const noWebhookCommand = yield* refusal(() =>
      cookout.client.callCommand("release", { channel: "grill", data: { branch: "main" } }),
    );
    const notAName = yield* refusal(() =>
      cookout.client.callCommand("Deploy", { channel: "grill", data: { branch: "main" } }),
    );
    const noChannel = yield* refusal(() =>
      cookout.client.callCommand("deploy", { channel: "lounge", data: { branch: "main" } }),
    );

    expect([noWebhookCommand, notAName, noChannel]).toMatchObject([
      { code: "command_not_found", status: 404 },
      { code: "command_not_found", status: 404 },
      { code: "channel_not_found", status: 404 },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a secret rotation by an identity that is not an admin is refused with 403, and of no command with 404", () =>
  Effect.gen(function* rotateRefused() {
    const cookout = yield* TestCookout;
    const added = yield* answer(() => cookout.client.addCommand(deploy));
    const ann = yield* cookout.createIdentity("ann");
    const notAdmin = yield* refusal(() => ann.client.rotateCommandSecret("deploy"));
    const noWebhookCommand = yield* refusal(() => cookout.client.rotateCommandSecret("release"));
    const notAName = yield* refusal(() => cookout.client.rotateCommandSecret("Deploy"));
    const rotated = yield* answer(() => cookout.client.rotateCommandSecret("deploy"));

    expect([notAdmin, noWebhookCommand, notAName]).toMatchObject([
      { code: "admin_only", status: 403 },
      { code: "command_not_found", status: 404 },
      { code: "command_not_found", status: 404 },
    ]);
    expect(rotated.command).toStrictEqual(added.command);
    expect(rotated.secret).not.toBe(added.secret);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a call to a stored command whose schema doesn't compile fails with 500 and posts nothing", () =>
  Effect.gen(function* storedBadSchema() {
    const cookout = yield* TestCookout;
    const stored = webhookCommandFixture("deploy");
    yield* cookout.seedCommand({ ...stored, command: { ...stored.command, schema: { type: "strnig" } } });
    yield* answer(() => cookout.client.createChannel({ name: "grill" }));
    const error = yield* refusal(() => cookout.client.callCommand("deploy", { channel: "grill", data: {} }));
    const { messages } = yield* answer(() => cookout.client.listMessages("grill"));

    expect(error).toMatchObject({ code: "internal_error", status: 500 });
    expect(messages).toStrictEqual([]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a command whose schema is not a JSON Schema is refused with 400 when it is added", () =>
  Effect.gen(function* badSchema() {
    const cookout = yield* TestCookout;
    const error = yield* refusal(() => cookout.client.addCommand({ ...deploy, schema: { type: "strnig" } }));
    const { commands } = yield* answer(cookout.client.listCommands);

    expect(error).toMatchObject({ code: "invalid_request", details: [{ path: ["schema"] }], status: 400 });
    expect(Arr.map(commands, ({ name }) => name)).toStrictEqual([]);
  }).pipe(Effect.provide(testCookout())),
);

const ordinaryWebhookCommands = [
  { ...deploy, schema: { properties: { at: { format: "date-time", type: "string" } }, type: "object" } },
  {
    ...deploy,
    name: "release",
    schema: { $schema: "http://json-schema.org/draft-07/schema#", properties: { branch: { type: "string" } } },
  },
  { ...deploy, name: "tag", schema: { properties: { branch: { type: "string" } }, "x-generated-by": "zod" } },
] as const;

it.effect(
  "a command with an ordinary JSON Schema (formats, draft-07, extra keywords) is added and checks formats",
  () =>
    Effect.gen(function* ordinarySchema() {
      const cookout = yield* TestCookout;
      yield* Effect.forEach(ordinaryWebhookCommands, (command) => answer(() => cookout.client.addCommand(command)), {
        concurrency: 1,
      });
      yield* answer(() => cookout.client.createChannel({ name: "grill" }));
      const badDate = yield* refusal(() =>
        cookout.client.callCommand("deploy", { channel: "grill", data: { at: "yesterday" } }),
      );
      const { commands } = yield* answer(cookout.client.listCommands);

      expect(Arr.map(commands, ({ name }) => name)).toStrictEqual(["deploy", "release", "tag"]);
      expect(badDate).toMatchObject({ code: "invalid_request", details: [{ path: ["data", "at"] }], status: 400 });
    }).pipe(Effect.provide(testCookout())),
);
