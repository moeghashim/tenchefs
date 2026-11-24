import type { BoardStore } from "../../board/index.ts";
import { createBoardStore } from "../../board/index.ts";
import { createContext } from "react";
import { createCookoutClient } from "../../sdk/index.ts";

const url = globalThis.location.origin;
const client = createCookoutClient({ env: {}, url });

const ReactionList = createContext<BoardStore>(createBoardStore({ client, live: null, url }));

export { ReactionList };
