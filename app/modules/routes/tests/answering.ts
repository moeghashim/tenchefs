import type { CookoutClient } from "../../sdk/index.ts";

type ClientMethod = {
  readonly [Key in keyof CookoutClient]: CookoutClient[Key] extends (...args: never) => unknown ? Key : never;
}[keyof CookoutClient];

interface Answering {
  readonly answered: (method: ClientMethod) => Promise<void>;
  readonly client: CookoutClient;
}

function answering(client: CookoutClient): Answering {
  const answers = new Map<PropertyKey, PromiseWithResolvers<boolean>>();
  function answerOf(method: PropertyKey): PromiseWithResolvers<boolean> {
    const known = answers.get(method) ?? Promise.withResolvers<boolean>();
    answers.set(method, known);
    return known;
  }
  const answeringClient = new Proxy(client, {
    get: (target, key): unknown => {
      const value: unknown = Reflect.get(target, key);
      if (typeof value !== "function") {
        return value;
      }
      return async (...args: readonly unknown[]): Promise<unknown> => {
        try {
          const answer: unknown = await Reflect.apply(value, target, args);
          return answer;
        } finally {
          answerOf(key).resolve(true);
        }
      };
    },
  });
  return {
    answered: async (method) => {
      await answerOf(method).promise;
      answers.delete(method);
    },
    client: answeringClient,
  };
}

interface Repeating {
  readonly answered: Answering["answered"];
  readonly done: () => Promise<boolean>;
  readonly method: ClientMethod;
}

async function answeredUntil(repeating: Repeating): Promise<void> {
  if (await repeating.done()) {
    return;
  }
  await repeating.answered(repeating.method);
  await answeredUntil(repeating);
}

export { type Answering, type ClientMethod, answeredUntil, answering };
