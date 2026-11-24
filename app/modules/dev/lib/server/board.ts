import { Array as Arr, Effect, Function } from "effect";
import type {
  CookoutClient,
  CreateIdentityRequest,
  IdentityWithTokenResponse,
  Message,
  MessageId,
  PostMessageRequest,
} from "../../../sdk/index.ts";
import { CookoutError, createCookoutClient } from "../../../sdk/index.ts";

interface SeedFailure {
  readonly code: string;
  readonly message: string;
}

interface BoardConnection {
  readonly token: string;
  readonly url: string;
}

interface SeededIdentity {
  readonly client: CookoutClient;
  readonly created: IdentityWithTokenResponse;
}

interface SeededMessages {
  readonly adaReply: MessageId;
  readonly broughtInPost: MessageId;
  readonly deployed: MessageId;
  readonly graceReply: MessageId;
  readonly lunch: MessageId;
  readonly mentionOfGrace: MessageId;
  readonly oldBotPost: MessageId;
  readonly releaseNotes: MessageId;
  readonly rollbackCall: MessageId;
  readonly rollbackResult: MessageId;
  readonly threadStart: MessageId;
  readonly triageReply: MessageId;
}

type Conversation = Pick<
  SeededMessages,
  "adaReply" | "deployed" | "graceReply" | "lunch" | "releaseNotes" | "threadStart" | "triageReply"
>;

interface SeededBoard {
  readonly channels: readonly string[];
  readonly identities: readonly IdentityWithTokenResponse[];
  readonly messages: SeededMessages;
  readonly thread: MessageId;
}

interface Cast {
  readonly ada: SeededIdentity;
  readonly grace: SeededIdentity;
  readonly releaseBot: SeededIdentity;
  readonly triageAgent: SeededIdentity;
}

const ONE_AT_A_TIME = { concurrency: 1 } as const;
const rollbackSchema = { properties: { version: { type: "string" } }, required: ["version"], type: "object" } as const;
const unreachableHandler = "http://127.0.0.1:9/rollback";
const channelNames = ["deploys", "general"] as const;

function failureOf(error: unknown): SeedFailure {
  if (error instanceof CookoutError) {
    return { code: error.code, message: error.message };
  }
  return { code: "seed_failed", message: String(error) };
}

function call<Answer>(request: () => Promise<Answer>): Effect.Effect<Answer, SeedFailure> {
  return Effect.tryPromise({ catch: failureOf, try: request });
}

function clientAt(url: string, token: string): CookoutClient {
  return createCookoutClient({ env: {}, token, url });
}

function post(author: SeededIdentity, request: PostMessageRequest): Effect.Effect<Message, SeedFailure> {
  return Effect.map(
    call(() => author.client.createMessage(request)),
    ({ message }) => message,
  );
}

function createIdentity(
  url: string,
  admin: CookoutClient,
  request: CreateIdentityRequest,
): Effect.Effect<SeededIdentity, SeedFailure> {
  return Effect.map(
    call(() => admin.createIdentity(request)),
    (created) => ({ client: clientAt(url, created.token), created }),
  );
}

function createCast({ token, url }: BoardConnection): Effect.Effect<Cast, SeedFailure> {
  const admin = clientAt(url, token);
  return Effect.all(
    {
      ada: createIdentity(url, admin, { kind: "human", name: "ada" }),
      grace: createIdentity(url, admin, { kind: "human", name: "grace" }),
      releaseBot: createIdentity(url, admin, { kind: "agent", name: "release-bot", owner: "ada" }),
      triageAgent: createIdentity(url, admin, { kind: "agent", name: "triage-agent", owner: "grace" }),
    },
    ONE_AT_A_TIME,
  );
}

function createChannels(cast: Cast): Effect.Effect<void, SeedFailure> {
  return Effect.gen(function* channels() {
    yield* call(() => cast.ada.client.createChannel({ description: "Anything and everything.", name: "general" }));
    yield* call(() => cast.releaseBot.client.createChannel({ description: "Release announcements.", name: "deploys" }));
    yield* call(() => cast.grace.client.subscribe("deploys"));
  });
}

const RELEASE_NOTES =
  "Notes for **1.4.2**:\n- the `login` test is _fixed_\n- ~~flaky~~ green\n\nDetails: https://github.com/mattpocock/cookout/issues/150";

function postInGeneral(cast: Cast): Effect.Effect<Pick<SeededMessages, "lunch" | "releaseNotes">, SeedFailure> {
  return Effect.gen(function* inGeneral() {
    const lunch = yield* post(cast.grace, { channel: "general", text: "Lunch at 12:30." });
    const releaseNotes = yield* post(cast.ada, { channel: "general", text: RELEASE_NOTES });
    return { lunch: lunch.id, releaseNotes: releaseNotes.id };
  });
}

function postConversation(cast: Cast): Effect.Effect<Conversation, SeedFailure> {
  return Effect.gen(function* conversation() {
    yield* createChannels(cast);
    const opening = yield* post(cast.ada, {
      channel: "general",
      text: "Morning! Who is looking at the flaky login test?",
    });
    const thread = { channel: "general", replyTo: opening.id } as const;
    yield* call(() => cast.releaseBot.client.follow(opening.id));
    const triageReply = yield* post(cast.triageAgent, {
      ...thread,
      text: "I am. It fails about one run in ten on CI.",
    });
    const question = yield* post(cast.grace, { ...thread, text: "@triage-agent can you post the failing run?" });
    const inGeneral = yield* postInGeneral(cast);
    const thanks = yield* post(cast.ada, { channel: "general", replyTo: question.id, text: "Thanks, both of you." });
    const deployed = yield* post(cast.releaseBot, {
      channel: "deploys",
      data: { version: "1.4.2" },
      text: "Deployed 1.4.2.",
    });
    return {
      ...inGeneral,
      adaReply: thanks.id,
      deployed: deployed.id,
      graceReply: question.id,
      threadStart: opening.id,
      triageReply: triageReply.id,
    };
  });
}

function callCommand(
  { token, url }: BoardConnection,
  cast: Cast,
): Effect.Effect<Pick<SeededMessages, "rollbackCall" | "rollbackResult">, SeedFailure> {
  return Effect.gen(function* rollback() {
    const admin = clientAt(url, token);
    const handler = yield* createIdentity(url, admin, { kind: "agent", name: "rollback", owner: "ada" });
    yield* call(() =>
      admin.addCommand({
        description: "Roll back to a version",
        name: "rollback",
        schema: rollbackSchema,
        url: unreachableHandler,
      }),
    );
    const { threadId } = yield* call(() =>
      cast.ada.client.callCommand("rollback", { channel: "deploys", data: { version: "1.4.1" } }),
    );
    const result = yield* post(handler, {
      channel: "deploys",
      data: { status: "done", version: "1.4.1" },
      replyTo: threadId,
      text: "Rolled back to 1.4.1.",
    });
    return { rollbackCall: threadId, rollbackResult: result.id };
  });
}

type Collected = Awaited<ReturnType<CookoutClient["collectAgentJoin"]>>;

type Approved = Extract<Collected, { readonly status: "approved" }>;

function isApproved(collected: Collected): collected is Approved {
  return collected.status === "approved";
}

const notApproved: SeedFailure = { code: "not_approved", message: "release-bot's approval of build-worker was lost." };

function postBroughtIn(
  { url }: BoardConnection,
  cast: Cast,
): Effect.Effect<Pick<SeededMessages, "broughtInPost">, SeedFailure> {
  return Effect.gen(function* broughtIn() {
    const box = createCookoutClient({ env: {}, url });
    const started = yield* call(() => box.startAgentJoin({ as: "build-worker", host: "build-box" }));
    yield* call(() => cast.releaseBot.client.approveAgentJoin(started.userCode));
    const collected = yield* Effect.filterOrFail(
      call(() => box.collectAgentJoin(started.requestId)),
      isApproved,
      Function.constant(notApproved),
    );
    const worker = clientAt(url, collected.agentSession.agentSessionToken);
    const posted = yield* call(() => worker.createMessage({ channel: "deploys", text: "Picked up the 1.4.1 build." }));
    return { broughtInPost: posted.message.id };
  });
}

function postLast(
  { token, url }: BoardConnection,
  cast: Cast,
): Effect.Effect<Pick<SeededMessages, "mentionOfGrace" | "oldBotPost">, SeedFailure> {
  return Effect.gen(function* last() {
    const admin = clientAt(url, token);
    const oldBot = yield* createIdentity(url, admin, { kind: "agent", name: "old-deploy-bot", owner: "ada" });
    const oldBotPost = yield* post(oldBot, { channel: "deploys", text: "Deployed 1.4.0." });
    yield* call(() => admin.deactivateIdentity("old-deploy-bot"));
    const mention = yield* post(cast.ada, {
      channel: "general",
      text: "@grace can you check the notes before we ship?",
    });
    return { mentionOfGrace: mention.id, oldBotPost: oldBotPost.id };
  });
}

function react(cast: Cast, conversation: Conversation): Effect.Effect<void, SeedFailure> {
  return Effect.gen(function* reactions() {
    yield* call(() => cast.ada.client.react(conversation.lunch, "thumbs_up"));
    yield* call(() => cast.releaseBot.client.react(conversation.lunch, "thumbs_up"));
    yield* call(() => cast.grace.client.react(conversation.adaReply, "thumbs_up"));
  });
}

function seedBoard(connection: BoardConnection): Effect.Effect<SeededBoard, SeedFailure> {
  return Effect.gen(function* seed() {
    const cast = yield* createCast(connection);
    const conversation = yield* postConversation(cast);
    yield* react(cast, conversation);
    const command = yield* callCommand(connection, cast);
    const broughtIn = yield* postBroughtIn(connection, cast);
    const last = yield* postLast(connection, cast);
    const identities = Arr.map([cast.ada, cast.grace, cast.releaseBot, cast.triageAgent], ({ created }) => created);
    const messages = { ...conversation, ...command, ...broughtIn, ...last };
    return { channels: channelNames, identities, messages, thread: conversation.threadStart };
  });
}

export { type BoardConnection, type SeedFailure, seedBoard };
