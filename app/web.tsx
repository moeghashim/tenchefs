/**
 * The browser program: makes the stores on SDK clients for the page's own
 * cookout, with the live stream on its `EventSource`, and draws the web UI in
 * `#root`. It imports nothing from the backend.
 * The page's client sends no token: once the person logs in, the browser
 * sends the session cookie instead. Logging in uses a client with the token.
 * The layout keeps the theme in the browser's local storage and sets it on the
 * page's root element, as `public/assets/theme.js` does before the first paint.
 * The Inbox's read rule counts time on the page's timers while the page is
 * visible and focused.
 */
import { browserReadingTools, createReading, createUnread } from "./modules/unread/index.ts";
import { createAgentJoinApprovals, createLoginApprovals, createSession } from "./modules/session/index.ts";
import { createBoard, createBoardStore } from "./modules/board/index.ts";
import { createLive, eventSourceAdapter } from "./modules/live/index.ts";
import { CookoutApp } from "./modules/routes/index.tsx";
import { createComposer } from "./modules/composer/index.ts";
import { createCookoutClient } from "./modules/sdk/index.ts";
import { createLayout } from "./modules/layout/index.ts";
import { createRoot } from "react-dom/client";

const root = document.querySelector("#root");

if (root !== null) {
  const url = globalThis.location.origin;
  const client = createCookoutClient({ env: {}, url });
  const session = createSession({
    client,
    clientWithToken: (token) => createCookoutClient({ env: {}, token, url }),
  });
  const live = createLive(eventSourceAdapter(url));
  const board = createBoard({ client, live });
  const unread = createUnread({ client, live });
  const layout = createLayout({ root: globalThis.document.documentElement, storage: globalThis.localStorage });
  createRoot(root).render(
    <CookoutApp
      agentJoinApprovals={createAgentJoinApprovals(client)}
      board={board}
      boardStore={createBoardStore({ client, live })}
      composer={createComposer({ client, commands: board.commands, live })}
      layout={layout}
      live={live}
      loginApprovals={createLoginApprovals(client)}
      reading={createReading(browserReadingTools())}
      session={session}
      unread={unread}
    />,
  );
}
