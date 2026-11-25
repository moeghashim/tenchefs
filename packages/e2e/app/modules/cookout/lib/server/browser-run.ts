import type { ChannelResponse, IdentityWithTokenResponse } from "@ai-hero/cookout/sdk";
import { Context, Effect, Layer, ManagedRuntime, String as Str } from "effect";
import { CookoutUnderTest, cookoutUnderTest } from "./cookout-under-test.ts";
import type { Fixtures, Page, PlaywrightTestArgs } from "@playwright/test";
import type { CookoutUnderTestService } from "./cookout-under-test.ts";
import { requireExampleWebhookCommand } from "./example-command.ts";

interface BrowserRun {
  readonly url: string;
  readonly prefix: string;
  readonly createAgent: (name: string) => Promise<IdentityWithTokenResponse>;
  readonly createHuman: (name: string) => Promise<IdentityWithTokenResponse>;
  readonly createChannel: (name: string) => Promise<ChannelResponse>;
  readonly logIn: (token: string) => Promise<void>;
  readonly requireExampleCommand: () => Promise<void>;
}

interface BrowserFixtures {
  readonly cookout: BrowserRun;
}

const EVENTS_PATH = "/v1/events";
const bridge = ManagedRuntime.make(Layer.empty);

function logIn(page: Page, url: string): (token: string) => Promise<void> {
  return (token) =>
    bridge.runPromise(
      Effect.gen(function* logInWithStream() {
        const streamOpen = page.waitForResponse((response) => Str.includes(EVENTS_PATH)(response.url()));
        yield* Effect.promise(() => page.goto(url));
        yield* Effect.promise(() => page.getByLabel("Token").fill(token));
        yield* Effect.promise(() => page.getByRole("button", { name: "Log in" }).click());
        yield* Effect.promise(() => streamOpen);
      }),
    );
}

function browserRun(cookout: CookoutUnderTestService, page: Page): BrowserRun {
  return {
    createAgent: (name) => bridge.runPromise(cookout.createAgent(name)),
    createChannel: (name) => bridge.runPromise(cookout.createChannel(name)),
    createHuman: (name) => bridge.runPromise(cookout.createHuman(name)),
    logIn: logIn(page, cookout.url),
    prefix: cookout.prefix,
    requireExampleCommand: () => bridge.runPromise(requireExampleWebhookCommand(cookout)),
    url: cookout.url,
  };
}

const browserFixtures: Fixtures<BrowserFixtures, object, PlaywrightTestArgs> = {
  cookout: ({ page }, use) =>
    bridge.runPromise(
      Effect.scoped(
        Effect.gen(function* openRun() {
          const context = yield* Layer.build(cookoutUnderTest);
          const cookout = Context.get(context, CookoutUnderTest);
          yield* Effect.promise(() => use(browserRun(cookout, page)));
        }),
      ),
    ),
};

export { type BrowserFixtures, type BrowserRun, browserFixtures };
