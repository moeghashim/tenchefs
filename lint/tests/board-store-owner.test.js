import { boardStoreOwner } from "../rules/board-store-owner.js";
import { ruleTester } from "./rule-tester.js";

const client = [{ messageId: "client" }];
const live = [{ messageId: "live" }];

ruleTester.run("board-store-owner", boardStoreOwner, {
  invalid: [
    { code: 'import { createCookoutClient } from "../../sdk/index.ts";', errors: client },
    { code: 'import { refusalOf, createCookoutClient } from "../sdk/index.ts";', errors: client },
    { code: 'import { createCookoutClient as make } from "../../sdk/index.ts";', errors: client },
    { code: 'import * as sdk from "../../sdk/index.ts";', errors: client },
    { code: 'export { createCookoutClient } from "../../sdk/index.ts";', errors: client },
    { code: 'import { createLive } from "../../live/index.ts";', errors: live },
    { code: 'import type { Live } from "../../live/index.ts";', errors: live },
    { code: 'export type { Live } from "../live/index.ts";', errors: live },
    { code: 'export * from "../../live/index.ts";', errors: live },
  ],
  valid: [
    { code: 'import { refusalOf } from "../../sdk/index.ts";' },
    { code: 'import type { CookoutClient, MessageId } from "../../sdk/index.ts";' },
    { code: 'import { createBoardStore } from "../../board/index.ts";' },
    { code: 'import { liveness } from "../../alive/index.ts";' },
    { code: 'import { createLayout } from "./live/layout.ts";' },
  ],
});
