import { Array as Arr, Option, Predicate, Schema } from "effect";
import type { SetTriggerRequest, Trigger, TriggerHeader, TriggerResponse } from "../../index.ts";
import { IdentityNameSchema } from "../../../identities/server.ts";
import type { StoredTrigger } from "../../../storage/server.ts";
import type { TriggerEvent } from "../../../events/index.ts";
import { TriggerResultSchema } from "../../../presence/server.ts";
import { matchesWire } from "../../../http/index.ts";

const HeaderNamesSchema = Schema.Array(Schema.String);

const TriggerSchema = matchesWire<Trigger>()(
  Schema.Struct({
    headerNames: Schema.optionalKey(HeaderNamesSchema),
    lastResult: Schema.optionalKey(TriggerResultSchema),
    url: Schema.String,
  }),
);

const TriggerHeaderSchema = matchesWire<TriggerHeader>()(Schema.Struct({ name: Schema.String, value: Schema.String }));

const TriggerHeadersSchema = Schema.Array(TriggerHeaderSchema);

const TriggerResponseSchema = matchesWire<TriggerResponse>()(Schema.Struct({ trigger: Schema.NullOr(TriggerSchema) }));

const SetTriggerRequestSchema = matchesWire<SetTriggerRequest>()(
  Schema.Struct({
    headers: Schema.optionalKey(TriggerHeadersSchema),
    token: Schema.String,
    url: Schema.String,
  }),
);

const TriggerEventSchema = matchesWire<TriggerEvent>()(
  Schema.Struct({ identity: IdentityNameSchema, trigger: TriggerSchema, type: Schema.Literal("trigger") }),
);

function withoutValues({ headers = [], url }: Pick<StoredTrigger, "headers" | "url">): Trigger {
  if (!Arr.isReadonlyArrayNonEmpty(headers)) {
    return { url };
  }
  return { headerNames: Arr.map(headers, ({ name }) => name), url };
}

function shownTrigger(stored: StoredTrigger): Trigger {
  const trigger = withoutValues(stored);
  if (Predicate.isUndefined(stored.lastResult)) {
    return trigger;
  }
  return { ...trigger, lastResult: stored.lastResult };
}

function shown(stored: StoredTrigger | undefined): TriggerResponse {
  return Option.match(Option.fromUndefinedOr(stored), {
    onNone: () => ({ trigger: null }),
    onSome: (found): TriggerResponse => ({ trigger: shownTrigger(found) }),
  });
}

export { SetTriggerRequestSchema, TriggerEventSchema, TriggerResponseSchema, shown, shownTrigger, withoutValues };
