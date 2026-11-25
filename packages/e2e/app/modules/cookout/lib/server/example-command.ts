import { Array as Arr, Effect } from "effect";
import type { CookoutUnderTestService } from "./cookout-under-test.ts";

const exampleWebhookCommand = "example";

function noExampleWebhookCommand(url: string): string {
  return (
    `${url} has no Webhook command ${exampleWebhookCommand}, so the example handler isn't reachable from it. ` +
    "Run pnpm e2e:docker, or scripts/handler-provision.sh on the deployed cookout."
  );
}

function requireExampleWebhookCommand({ admin, url }: CookoutUnderTestService): Effect.Effect<void> {
  return Effect.gen(function* listTheWebhookCommands() {
    const { commands } = yield* Effect.promise(() => admin.listCommands());
    const missing = !Arr.some(commands, ({ name }) => name === exampleWebhookCommand);
    const failure = new Error(noExampleWebhookCommand(url));
    yield* Effect.when(Effect.die(failure), Effect.succeed(missing));
  });
}

export { exampleWebhookCommand, requireExampleWebhookCommand };
