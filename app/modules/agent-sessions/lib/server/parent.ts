import { Effect, Option } from "effect";
import { CredentialSent } from "../../../identities/server.ts";
import type { TokenHash } from "../../../identities/index.ts";

export function withParent<Made extends object>(
  made: Made,
): Effect.Effect<Made & { readonly parent: TokenHash | undefined }> {
  return Effect.map(CredentialSent, (sent) => ({ ...made, parent: Option.getOrUndefined(sent) }));
}
