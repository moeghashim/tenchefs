import { Effect, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import { NodeHttpClient, NodeServices } from "@effect/platform-node";
import { builtWebFolder, freshDatabasePath, startServe } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { secretsLive } from "../../../secrets/server.ts";

interface Fetched {
  readonly body: string;
  readonly contentType: string;
  readonly status: number;
}

const OK = 200;
const isRefusal = Schema.is(Schema.Struct({ error: Schema.Struct({ code: Schema.String }) }));

function fetched(url: string): Effect.Effect<Fetched> {
  return Effect.gen(function* fetchPage() {
    const response = yield* HttpClient.execute(HttpClientRequest.get(url));
    const body = yield* response.text;
    return { body, contentType: response.headers["content-type"] ?? "", status: response.status };
  }).pipe(Effect.provide(FetchHttpClient.layer), Effect.orDie);
}

function statusWithHost(url: string, host: string): Effect.Effect<number> {
  return Effect.gen(function* fetchWithHost() {
    const response = yield* HttpClient.execute(
      HttpClientRequest.get(url).pipe(HttpClientRequest.setHeader("host", host)),
    );
    return response.status;
  }).pipe(Effect.provide(NodeHttpClient.layerNodeHttp), Effect.orDie);
}

function refusalCode(url: string): Effect.Effect<string> {
  return Effect.gen(function* fetchRefusal() {
    const response = yield* HttpClient.execute(HttpClientRequest.get(url));
    const body = yield* response.json;
    if (isRefusal(body)) {
      return `${String(response.status)} ${body.error.code}`;
    }
    return expect.unreachable(String(response.status));
  }).pipe(Effect.provide(FetchHttpClient.layer), Effect.orDie);
}

it.effect("cookout serve serves the built web UI's index.html at / and its assets next to it", () =>
  Effect.gen(function* servesTheWebUi() {
    const web = yield* builtWebFolder;
    const database = yield* freshDatabasePath;
    const server = yield* startServe({ database, webFolder: web.folder });
    const page = yield* fetched(`${server.url}/`);
    const script = yield* fetched(`${server.url}${web.scriptPath}`);

    expect(page).toStrictEqual({ body: web.indexHtml, contentType: "text/html", status: OK });
    expect(script).toStrictEqual({ body: web.scriptText, contentType: "text/javascript", status: OK });
  }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);

it.effect("with a public URL, the served page's link preview points at that URL", () =>
  Effect.gen(function* absolutePreview() {
    const web = yield* builtWebFolder;
    const database = yield* freshDatabasePath;
    const env = { COOKOUT_PUBLIC_URL: "https://cookout.example.com" };
    const server = yield* startServe({ database, env, webFolder: web.folder });
    const page = yield* fetched(`${server.url}/`);

    expect(page.body).toContain('<meta property="og:url" content="https://cookout.example.com/" />');
    expect(page.body).toContain(
      '<meta property="og:image" content="https://cookout.example.com/assets/og-card.png" />',
    );
    expect(page.contentType).toBe("text/html");
  }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);

it.effect("on Fly with no public URL set, the public URL is the app's fly.dev address, and a set one wins", () =>
  Effect.gen(function* flyPublicUrl() {
    const web = yield* builtWebFolder;
    const database = yield* freshDatabasePath;
    const fly = yield* startServe({ database, env: { FLY_APP_NAME: "new-app" }, webFolder: web.folder });
    const set = yield* startServe({
      database: `${database}-set`,
      env: { COOKOUT_PUBLIC_URL: "https://cookout.example.com", FLY_APP_NAME: "new-app" },
      webFolder: web.folder,
    });
    const flyPage = yield* fetched(`${fly.url}/`);
    const setPage = yield* fetched(`${set.url}/`);

    expect(flyPage.body).toContain('<meta property="og:url" content="https://new-app.fly.dev/" />');
    expect(setPage.body).toContain('<meta property="og:url" content="https://cookout.example.com/" />');
  }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);

function hstsOverForwardedHttps(url: string): Effect.Effect<string> {
  return Effect.gen(function* fetchForwarded() {
    const response = yield* HttpClient.execute(
      HttpClientRequest.get(`${url}/v1/health`).pipe(HttpClientRequest.setHeader("x-forwarded-proto", "https")),
    );
    return response.headers["strict-transport-security"] ?? "";
  }).pipe(Effect.provide(FetchHttpClient.layer), Effect.orDie);
}

it.effect("serve trusts X-Forwarded-Proto only on Fly, and answers a request Fly reports as HTTPS with HSTS", () =>
  Effect.gen(function* flyForwardedProto() {
    const database = yield* freshDatabasePath;
    const fly = yield* startServe({ database, env: { FLY_APP_NAME: "new-app" } });
    const elsewhere = yield* startServe({ database: `${database}-elsewhere` });
    const answers = yield* Effect.all([hstsOverForwardedHttps(fly.url), hstsOverForwardedHttps(elsewhere.url)], {
      concurrency: 1,
    });

    expect(answers).toStrictEqual(["max-age=31536000", ""]);
  }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);

it.effect("on Render with no public URL set, the public URL is the service's external URL, and a set one wins", () =>
  Effect.gen(function* renderPublicUrl() {
    const web = yield* builtWebFolder;
    const database = yield* freshDatabasePath;
    const render = yield* startServe({
      database,
      env: { RENDER_EXTERNAL_URL: "https://new-service.onrender.com" },
      webFolder: web.folder,
    });
    const set = yield* startServe({
      database: `${database}-set`,
      env: {
        COOKOUT_PUBLIC_URL: "https://cookout.example.com",
        RENDER_EXTERNAL_URL: "https://new-service.onrender.com",
      },
      webFolder: web.folder,
    });
    const renderPage = yield* fetched(`${render.url}/`);
    const setPage = yield* fetched(`${set.url}/`);
    const renderHost = yield* statusWithHost(`${render.url}/`, "new-service.onrender.com");

    expect(renderPage.body).toContain('<meta property="og:url" content="https://new-service.onrender.com/" />');
    expect(setPage.body).toContain('<meta property="og:url" content="https://cookout.example.com/" />');
    expect(renderHost).toBe(OK);
  }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);

it.effect("an asset the build doesn't have, or a path out of the build's folder, is not found", () =>
  Effect.gen(function* missingAssets() {
    const web = yield* builtWebFolder;
    const database = yield* freshDatabasePath;
    const server = yield* startServe({ database, webFolder: web.folder });
    const missing = yield* refusalCode(`${server.url}/assets/missing.js`);
    const escaping = yield* refusalCode(`${server.url}/assets/..%2Findex.html`);

    expect(missing).toBe("404 not_found");
    expect(escaping).toBe("404 not_found");
  }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);

it.effect("a cookout whose web UI isn't built answers / with not_found", () =>
  Effect.gen(function* unbuiltWebUi() {
    const database = yield* freshDatabasePath;
    const webFolder = `${database}-no-web-build`;
    const server = yield* startServe({ database, webFolder });
    const deployed = yield* startServe({
      database,
      env: { COOKOUT_PUBLIC_URL: "https://cookout.example.com" },
      webFolder,
    });
    const page = yield* refusalCode(`${server.url}/`);
    const deployedPage = yield* refusalCode(`${deployed.url}/`);

    expect(page).toBe("404 not_found");
    expect(deployedPage).toBe("404 not_found");
  }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);
