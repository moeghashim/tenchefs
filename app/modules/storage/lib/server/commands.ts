import type { AgentIdentity, IdentityName } from "../../../identities/index.ts";
import { Array as Arr, Effect, Order, Predicate } from "effect";
import type { DeliveriesSection, MemoryDeliveriesSection } from "./deliveries.ts";
import type { MemoryWebhookCommandTokensSection, WebhookCommandTokensSection } from "./command-tokens.ts";
import type {
  RegisteredWebhookCommand,
  WebhookCommandName,
  WebhookCommandSecret,
} from "../../../webhook-commands/index.ts";
import type { FindIdentity } from "./identity-row.ts";
import type { MemoryState } from "./memory-state.ts";
import type { StorageUnavailable } from "./errors.ts";
import { memoryDeliveries } from "./deliveries.ts";
import { memoryWebhookCommandTokens } from "./command-tokens.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

interface StoredWebhookCommand {
  readonly command: RegisteredWebhookCommand;
  readonly secret: WebhookCommandSecret;
}

type AddWebhookCommandResult = "added" | "name_taken" | "handler_is_human";

interface WebhookCommandsSection extends WebhookCommandTokensSection, DeliveriesSection {
  readonly addWebhookCommand: (stored: StoredWebhookCommand, handler: AgentIdentity) => Fails<AddWebhookCommandResult>;
  readonly listWebhookCommands: Effect.Effect<readonly RegisteredWebhookCommand[], StorageUnavailable>;
  readonly findWebhookCommand: (name: WebhookCommandName) => Fails<StoredWebhookCommand | undefined>;
  readonly replaceWebhookCommandSecret: (
    name: WebhookCommandName,
    secret: WebhookCommandSecret,
  ) => Fails<StoredWebhookCommand | undefined>;
}

type PlaceHandler = (handler: AgentIdentity) => "placed" | "human";

const byName: Order.Order<StoredWebhookCommand> = Order.mapInput(
  Order.String,
  (stored: StoredWebhookCommand) => stored.command.name,
);

interface MemoryWebhookCommandsOptions {
  readonly state: MemoryState;
  readonly placeHandler: PlaceHandler;
  readonly findIdentity: FindIdentity;
}

interface MemoryWebhookCommandsSection
  extends WebhookCommandsSection,
    Pick<MemoryWebhookCommandTokensSection, "dropWebhookCommandTokens" | "dropWebhookCommandTokensOf">,
    Pick<MemoryDeliveriesSection, "dropDeliveries"> {
  readonly dropWebhookCommandsOf: (handler: IdentityName) => void;
}

function memoryWebhookCommands(options: MemoryWebhookCommandsOptions): MemoryWebhookCommandsSection {
  const { findIdentity, state, placeHandler } = options;
  const commands = new Map<WebhookCommandName, StoredWebhookCommand>();
  function open<Value>(work: () => Value): Fails<Value> {
    return Effect.andThen(state.ensureOpen, Effect.sync(work));
  }
  function add(stored: StoredWebhookCommand, handler: AgentIdentity): AddWebhookCommandResult {
    if (commands.has(stored.command.name)) {
      return "name_taken";
    }
    if (placeHandler(handler) === "human") {
      return "handler_is_human";
    }
    commands.set(stored.command.name, stored);
    return "added";
  }
  function replaceSecret(name: WebhookCommandName, secret: WebhookCommandSecret): StoredWebhookCommand | undefined {
    const found = commands.get(name);
    if (Predicate.isNotUndefined(found)) {
      const replaced = { ...found, secret };
      commands.set(name, replaced);
      return replaced;
    }
    return found;
  }
  const tokens = memoryWebhookCommandTokens({ findIdentity, state });
  const { dropDeliveriesOf, ...deliveries } = memoryDeliveries(state);
  function dropWebhookCommandsOf(handler: IdentityName): void {
    for (const [name, { command }] of commands) {
      if (command.handler === handler) {
        dropDeliveriesOf(name);
        commands.delete(name);
      }
    }
    tokens.dropWebhookCommandTokensOf(handler);
  }
  return {
    ...tokens,
    ...deliveries,
    addWebhookCommand: (stored, handler) => open(() => add(stored, handler)),
    dropWebhookCommandsOf,
    findWebhookCommand: (name) => open(() => commands.get(name)),
    listWebhookCommands: Effect.suspend(() =>
      open(() => Arr.map(Arr.sort(commands.values(), byName), ({ command }) => command)),
    ),
    replaceWebhookCommandSecret: (name, secret) => open(() => replaceSecret(name, secret)),
  };
}

export { type WebhookCommandsSection, type PlaceHandler, type StoredWebhookCommand, memoryWebhookCommands };
