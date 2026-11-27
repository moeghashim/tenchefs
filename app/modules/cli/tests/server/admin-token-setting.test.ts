import { Array as Arr, Effect, String as Str } from "effect";
import { answer, freshDatabasePath, startServe } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { sessionPath, whoamiPath } from "../../../identities/index.ts";
import type { CommandLineNeeds } from "../../../testing/server.ts";
import { NodeServices } from "@effect/platform-node";
import { request } from "../../../http/client.ts";
import { secretsLive } from "../../../secrets/server.ts";
import { testClient } from "../../../testing/index.ts";

const NEW_ADMIN_TOKEN = "new-admin-token-0123456789abcdef0123456789";

interface RotatedAdmin {
  readonly token: string;
  readonly cookie: string;
}

interface Answers {
  readonly setting: number;
  readonly rotated: number;
  readonly session: number;
}

function rotatedAdmin(url: string, adminToken: string): Effect.Effect<RotatedAdmin> {
  return Effect.gen(function* rotateAndLogIn() {
    const rotated = yield* answer(() => testClient({ env: {}, token: adminToken, url }).rotateToken("admin"));
    const response = yield* answer(() =>
      request({
        baseUrl: url,
        headers: { authorization: `Bearer ${rotated.token}` },
        method: "POST",
        path: sessionPath,
      }),
    );
    const [cookie = ""] = response.headers.getSetCookie();
    return { cookie: Arr.headNonEmpty(Str.split("; ")(cookie)), token: rotated.token };
  });
}

function whoamiStatus(url: string, headers: Readonly<Record<string, string>>): Effect.Effect<number> {
  return Effect.map(
    answer(() => request({ baseUrl: url, headers, method: "GET", path: whoamiPath })),
    (response) => response.status,
  );
}

function answersAt(url: string, setting: string, rotated: RotatedAdmin): Effect.Effect<Answers> {
  return Effect.all(
    {
      rotated: whoamiStatus(url, { authorization: `Bearer ${rotated.token}` }),
      session: whoamiStatus(url, { cookie: rotated.cookie }),
      setting: whoamiStatus(url, { authorization: `Bearer ${setting}` }),
    },
    { concurrency: 1 },
  );
}

function restartedAfterRotation(restart: {
  readonly adminToken?: string;
}): Effect.Effect<Answers, never, CommandLineNeeds> {
  return Effect.scoped(
    Effect.gen(function* rotateThenRestart() {
      const database = yield* freshDatabasePath;
      const first = yield* startServe({ database });
      const rotated = yield* rotatedAdmin(first.url, first.adminToken);
      yield* first.stop;
      const second = yield* startServe({ ...restart, database });
      return yield* answersAt(second.url, second.adminToken, rotated);
    }),
  );
}

it.effect("a rotated admin token and its web session keep working across a restart with the same setting", () =>
  Effect.gen(function* restartKeepsRotation() {
    const once = yield* restartedAfterRotation({});

    expect(once).toStrictEqual({ rotated: 200, session: 200, setting: 401 });
  }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);

it.effect("after a restart with a changed COOKOUT_ADMIN_TOKEN only its token works, and older web sessions end", () =>
  Effect.gen(function* restartWithChangedSetting() {
    const changed = yield* restartedAfterRotation({ adminToken: NEW_ADMIN_TOKEN });

    expect(changed).toStrictEqual({ rotated: 401, session: 401, setting: 200 });
  }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);
