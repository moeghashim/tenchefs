import type { SetTriggerRequest, Trigger, TriggerResponse } from "../../index.ts";
import { Schema } from "effect";
import { TriggerResultSchema } from "../../../presence/server.ts";
import { matchesWire } from "../../../http/index.ts";

const TriggerSchema = matchesWire<Trigger>()(
  Schema.Struct({ lastResult: Schema.optionalKey(TriggerResultSchema), url: Schema.String }),
);

export const TriggerResponseSchema = matchesWire<TriggerResponse>()(
  Schema.Struct({ trigger: Schema.NullOr(TriggerSchema) }),
);

export const SetTriggerRequestSchema = matchesWire<SetTriggerRequest>()(
  Schema.Struct({ token: Schema.String, url: Schema.String }),
);
