import type { CookoutClient, CookoutClientOptions } from "../../sdk/index.ts";
import { createCookoutClient } from "../../sdk/index.ts";

const UNREACHABLE_URL = "http://127.0.0.1:1";

interface Unreachable {
  readonly token?: string;
}

function testClient(options: CookoutClientOptions = {}): CookoutClient {
  return createCookoutClient(options);
}

function unreachableClient(unreachable: Unreachable = {}): CookoutClient {
  return createCookoutClient({ env: {}, ...unreachable, url: UNREACHABLE_URL });
}

export { testClient, unreachableClient };
