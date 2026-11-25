import type { CookoutClient, CreateIdentityRequest, IdentityWithTokenResponse, Token } from "../../sdk/index.ts";
import { createTestAgent, testAgentDisplayName, testClient } from "../../testing/index.ts";
import type { ClientMethod } from "./answering.ts";
import type { Session } from "../../board/index.ts";
import { createBoardStore } from "../../board/index.ts";
import { expect } from "vitest";
import { waitFor } from "@testing-library/react";
import { webTestCookout } from "../../../../scripts/web-test-server.ts";

const NONE = 0;
const ONE = 1;

interface Tracked {
  readonly client: CookoutClient;
  readonly settled: () => Promise<void>;
}

interface NewIdentity {
  readonly client: CookoutClient;
  readonly token: Token;
  readonly rotateToken: () => Promise<void>;
}

interface Revocable {
  readonly viewer: string;
  readonly revoked: string;
  readonly methods: readonly ClientMethod[];
}

interface RevocableView {
  readonly client: CookoutClient;
  readonly rotateToken: () => Promise<void>;
}

function tracked(client: CookoutClient): Tracked {
  let pending = NONE;
  const trackedClient = new Proxy(client, {
    get: (target, key): unknown => {
      const value: unknown = Reflect.get(target, key);
      if (typeof value !== "function") {
        return value;
      }
      return async (...args: readonly unknown[]): Promise<unknown> => {
        pending += ONE;
        try {
          const answer: unknown = await Reflect.apply(value, target, args);
          return answer;
        } finally {
          pending -= ONE;
        }
      };
    },
  });
  return {
    client: trackedClient,
    settled: async () => {
      await waitFor(() => {
        expect(pending).toBe(NONE);
      });
    },
  };
}

async function created(by: CookoutClient, request: CreateIdentityRequest): Promise<IdentityWithTokenResponse> {
  if (request.kind === "human") {
    const human = await by.createIdentity(request);
    return human;
  }
  const { kind: _kind, ...agent } = request;
  const agentCreated = await createTestAgent({ by, ...agent });
  return agentCreated;
}

interface Refusing {
  readonly client: CookoutClient;
  readonly refused: Promise<unknown>;
}

export function refusalNoticed(client: CookoutClient): Refusing {
  const refused = Promise.withResolvers<unknown>();
  return {
    client: {
      ...client,
      ack: async (messageId) => {
        const answer = await client.ack(messageId).catch((error: unknown) => {
          refused.resolve(error);
          throw error;
        });
        return answer;
      },
    },
    refused: refused.promise,
  };
}

export function anonymousClient(): CookoutClient {
  return testClient({ env: {}, url: webTestCookout().url });
}

export function clientWith(token: string): CookoutClient {
  return testClient({ env: {}, token, url: webTestCookout().url });
}

export function adminClient(): CookoutClient {
  return clientWith(webTestCookout().adminToken);
}

export function sessionOf(client: CookoutClient): Session {
  return createBoardStore({ client, live: null, url: webTestCookout().url }).session;
}

export async function newIdentity(request: CreateIdentityRequest): Promise<NewIdentity> {
  const { token } = await created(adminClient(), request);
  const { client, settled } = tracked(clientWith(token));
  return {
    client,
    rotateToken: async () => {
      await settled();
      await adminClient().rotateToken(request.name);
    },
    token,
  };
}

export async function revocableView({ methods, revoked, viewer }: Revocable): Promise<RevocableView> {
  const viewing = await newIdentity({ kind: "human", name: viewer });
  const rotated = await newIdentity({ kind: "human", name: revoked });
  const client: CookoutClient = { ...viewing.client };
  for (const method of methods) {
    Object.assign(client, { [method]: rotated.client[method] });
  }
  return { client, rotateToken: rotated.rotateToken };
}

export function agentShown(name: string): string {
  return `${testAgentDisplayName(name)}@${name}`;
}

export function agentOption(name: string): string {
  return `@${name}${testAgentDisplayName(name)}`;
}
