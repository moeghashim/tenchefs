import type { Presence, PresenceResponse } from "../../index.ts";
import { IdentityNameSchema } from "../../../identities/server.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import { Schema } from "effect";
import type { TriggerResult } from "../../../triggers/index.ts";
import { matchesWire } from "../../../http/index.ts";
import { offlineReasons } from "../../index.ts";
import { triggerSkips } from "../../../triggers/index.ts";

const LiveConnectionDetailSchema = Schema.Union([
  Schema.Struct({ host: Schema.optionalKey(Schema.String), via: Schema.Literal("watch") }),
  Schema.Struct({ via: Schema.Literal("web") }),
]);

const TriggerSkipSchema = Schema.Literals(triggerSkips);

const TriggerResultSchema = matchesWire<TriggerResult>()(
  Schema.Struct({
    at: IsoTimeSchema,
    error: Schema.optionalKey(Schema.String),
    ok: Schema.Boolean,
    skipped: Schema.optionalKey(TriggerSkipSchema),
    status: Schema.optionalKey(Schema.Int),
  }),
);

const OfflineReasonSchema = Schema.Literals(offlineReasons);

const WarningSchema = Schema.Literal(true);

export const PresenceSchema = matchesWire<Presence>()(
  Schema.Struct({
    connection: Schema.optionalKey(LiveConnectionDetailSchema),
    identity: IdentityNameSchema,
    lastSeenAt: Schema.optionalKey(IsoTimeSchema),
    offlineReason: Schema.optionalKey(OfflineReasonSchema),
    online: Schema.Boolean,
    unreachable: Schema.optionalKey(TriggerResultSchema),
    wakesOnMention: Schema.optionalKey(WarningSchema),
    warning: Schema.optionalKey(WarningSchema),
  }),
);

export const PresenceResponseSchema = matchesWire<PresenceResponse>()(
  Schema.Struct({ presence: Schema.Array(PresenceSchema) }),
);
export { TriggerResultSchema };
