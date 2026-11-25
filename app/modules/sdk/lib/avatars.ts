import { avatarPartName, identityAvatarPath } from "../../avatars/index.ts";
import type { AvatarCalls } from "../../avatars/index.ts";
import type { ClientConnection } from "./request.ts";
import type { IdentityResponse } from "../../identities/index.ts";
import { isIdentityResponse } from "./generated/validators.js";
import { send } from "./request.ts";

type IdentityAvatarCalls = AvatarCalls<IdentityResponse>;

function avatarCalls(server: ClientConnection): IdentityAvatarCalls {
  return {
    setAvatar: async (name, png) => {
      const form = new FormData();
      form.append(avatarPartName, new Blob([Uint8Array.from(png)], { type: "image/png" }), "avatar.png");
      const answer = await send(server, {
        body: form,
        isExpected: isIdentityResponse,
        method: "PUT",
        params: { name },
        path: identityAvatarPath,
      });
      return answer;
    },
  };
}

export { avatarCalls };
export type { IdentityAvatarCalls };
