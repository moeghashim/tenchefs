import { inject } from "vitest";

const NO_DELAY = 0;
const realTimeout = globalThis.setTimeout;

async function slept(delay: number): Promise<boolean> {
  const { promise, resolve } = Promise.withResolvers<boolean>();
  realTimeout(() => {
    resolve(true);
  }, delay);
  const woke = await promise;
  return woke;
}

interface Holding<Client> {
  readonly client: Client;
  readonly delay: number;
}

function heldBack<Client extends object>({ client, delay }: Holding<Client>): Client {
  if (delay === NO_DELAY) {
    return client;
  }
  return new Proxy(client, {
    get: (target, key): unknown => {
      const value: unknown = Reflect.get(target, key);
      if (typeof value !== "function") {
        return value;
      }
      return async (...args: readonly unknown[]): Promise<unknown> => {
        await slept(delay);
        const answer: unknown = await Reflect.apply(value, target, args);
        return answer;
      };
    },
  });
}

function slowCalls<Client extends object>(client: Client): Client {
  return heldBack({ client, delay: inject("webSlowMs") ?? NO_DELAY });
}

export { heldBack, slowCalls };
