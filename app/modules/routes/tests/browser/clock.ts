import type { CookoutClient, CreateIdentityRequest } from "../../../sdk/index.ts";
import type { Fixtures, PlaywrightTestArgs, PlaywrightTestOptions } from "@playwright/test";
import { moveClockForward, testClient } from "../../../testing/index.ts";
import type { Person } from "./people.ts";
import { createdBy } from "./people.ts";
import { startDevCookout } from "../../../../../scripts/lib/dev-cookout.ts";

interface OwnCookout {
  readonly admin: CookoutClient;
  readonly daysPass: (days: number) => Promise<void>;
  readonly newIdentity: (request: CreateIdentityRequest) => Promise<Person>;
  readonly webUrl: string;
}

interface ClockFixtures {
  readonly ownCookout: OwnCookout;
}

interface ClockOptions {
  readonly webFolder: string;
}

const clockFixtures: Fixtures<ClockFixtures & ClockOptions, object, PlaywrightTestArgs & PlaywrightTestOptions> = {
  baseURL: async ({ ownCookout }, provide) => {
    await provide(ownCookout.webUrl);
  },
  ownCookout: async ({ webFolder }, provide) => {
    const cookout = await startDevCookout({ webFolder });
    const { adminToken, clockUrl, webUrl } = cookout;
    const admin = testClient({ token: adminToken, url: webUrl });
    async function newIdentity(request: CreateIdentityRequest): Promise<Person> {
      const { token } = await createdBy({ by: admin, request });
      return { client: testClient({ token, url: webUrl }), token };
    }
    async function daysPass(days: number): Promise<void> {
      await moveClockForward({ clockUrl, days });
    }
    try {
      await provide({ admin, daysPass, newIdentity, webUrl });
    } finally {
      await cookout.stop();
    }
  },
  webFolder: ["", { option: true }],
};

export { type ClockFixtures, type ClockOptions, type OwnCookout, clockFixtures };
