/**
 * Avatars on the wire, shared by the server, the SDK, the CLI and the web: the `AvatarId` brand and its check, an
 * avatar as an identity carries it, the one shape the server takes, and the paths that set and serve one (#478).
 *
 * The browser crops and resizes (Matt, 2026-11-25, board msg 4362): the web UI takes a PNG, JPEG, GIF or WebP of up
 * to 2 MB, crops a centred square, resizes it to 256 px with a canvas and uploads a PNG. The server takes only a PNG
 * that is exactly 256 by 256, judged by its signature and the width and height in its IHDR header, with no image
 * library. A CLI or SDK caller sends one already.
 */

declare const brand: unique symbol;

const BYTES_IN_A_MEGABYTE = 1_000_000;
const MAXIMUM_BYTES = 2_000_000;
const SIDE = 256;
const megabytes = `${String(MAXIMUM_BYTES / BYTES_IN_A_MEGABYTE)} MB`;

/** An avatar's ID: opaque and random, and new whenever an avatar is set, so its bytes never change under it. */
export type AvatarId = string & { readonly [brand]: "AvatarId" };

/** The rule every avatar ID follows: 1 to 64 base64url characters, the same rule as an attachment's ID. */
export const avatarIdPattern = /^[A-Za-z0-9_-]{1,64}$/u;

/**
 * Whether `value` looks like an avatar ID; if so, it is an `AvatarId`.
 * @param value The ID to check.
 * @returns Whether `value` is an `AvatarId`.
 */
export function isAvatarId(value: string): value is AvatarId {
  return avatarIdPattern.test(value);
}

/** An identity's avatar, the picture shown beside its name, as every identity the API returns carries it. */
export interface Avatar {
  readonly id: AvatarId;
}

/** The identity fields an avatar adds: absent when the identity has none, and it shows its initials. */
export type WithAvatar<Fields> = Fields & {
  /** The picture shown beside its name, served at `avatarPath`. Absent when it has none. */
  readonly avatar?: Avatar;
};

/**
 * What the server takes as an avatar (Matt, 2026-11-25, board msg 4362): a PNG of exactly `side` by `side` pixels and
 * at most `maximumBytes` bytes. `maximumBytes` is also the largest image the web UI crops from.
 */
export const avatarLimits = { maximumBytes: MAXIMUM_BYTES, side: SIDE } as const;

/** The codes setting an avatar is refused with, beside `not_owner` and `identity_not_found`. */
export const avatarErrorCodes = [
  "avatar_too_large",
  "avatar_not_png",
  "avatar_wrong_size",
  "avatar_not_found",
] as const;

/** A refusal of an avatar's bytes: the code and wording the server answers, and the CLI and web show before sending. */
export interface AvatarRefusal {
  readonly code: (typeof avatarErrorCodes)[number];
  readonly message: string;
}

/** The refusal of an avatar over `avatarLimits.maximumBytes`. */
export const avatarTooLargeRefusal: AvatarRefusal = {
  code: "avatar_too_large",
  message: `An avatar can be at most ${megabytes} (${String(MAXIMUM_BYTES)} bytes).`,
};

/** The refusal of an avatar whose content isn't a PNG, whatever its name or type says. */
export const avatarNotPngRefusal: AvatarRefusal = {
  code: "avatar_not_png",
  message: `An avatar must be a PNG of ${String(SIDE)} by ${String(SIDE)} pixels; this content isn't a PNG with a readable header.`,
};

/** The refusal of a PNG that isn't exactly `avatarLimits.side` pixels square. */
export const avatarWrongSizeRefusal: AvatarRefusal = {
  code: "avatar_wrong_size",
  message: `An avatar must be exactly ${String(SIDE)} by ${String(SIDE)} pixels: crop and resize it first.`,
};

/**
 * `PUT /v1/identities/:name/avatar`: sets an identity's avatar, from a multipart body with one `avatar` part. The
 * identity itself or, for an agent, the human who owns it may.
 */
export const identityAvatarPath = "/v1/identities/:name/avatar";

/** `GET /v1/avatars/:id`: an avatar's PNG bytes, to any signed-in identity. */
export const avatarPath = "/v1/avatars/:id";

/** The multipart part of `PUT /v1/identities/:name/avatar` that holds the avatar's bytes. */
export const avatarPartName = "avatar";

/** The SDK's avatar call, answering `Answer`: the identity, avatar and all. */
export interface AvatarCalls<Answer> {
  /**
   * `PUT /v1/identities/:name/avatar`: sets an identity's avatar to `png`, which must already be a PNG of exactly 256
   * by 256 pixels (400 `avatar_not_png` or `avatar_wrong_size`) of at most 2 MB (413 `avatar_too_large`). The identity
   * itself or, for an agent, the human who owns it may (403 `not_owner`). The old avatar is deleted.
   */
  readonly setAvatar: (name: string, png: Uint8Array) => Promise<Answer>;
}
