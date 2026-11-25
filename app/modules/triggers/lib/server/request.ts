import { Effect, Option } from "effect";
import type { SetTriggerRequest, TriggerHeader, TriggerToken } from "../../index.ts";
import type { Refusal } from "../../../http/index.ts";
import { checkedHeaders } from "./headers.ts";
import { checkedUrl } from "./url.ts";
import { isTriggerToken } from "../../index.ts";
import { tokenMissing } from "./owner.ts";

interface CheckedTrigger {
  readonly url: string;
  readonly token: TriggerToken;
  readonly headers: readonly TriggerHeader[];
}

function checkedTrigger(body: SetTriggerRequest): Effect.Effect<CheckedTrigger, Refusal> {
  return Effect.gen(function* checkTrigger() {
    const url = yield* checkedUrl(body.url);
    const sent = Option.liftPredicate(body.token, isTriggerToken);
    const token = yield* Effect.mapError(Effect.fromOption(sent), () => tokenMissing);
    const headers = yield* checkedHeaders(body.headers);
    return { headers, token, url };
  });
}

export { checkedTrigger };
