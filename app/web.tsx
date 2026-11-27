/**
 * The browser program: makes the stores on SDK clients for the page's own
 * cookout, with the live stream on its `EventSource`, and draws the web UI in
 * `#root`. It imports nothing from the backend.
 * The page's client sends no token: once the person logs in, the browser
 * sends the session cookie instead. Logging in uses a client with the token.
 * The layout keeps the theme in the browser's local storage and sets it on the
 * page's root element, as `public/assets/theme.js` does before the first paint;
 * the composer keeps each message box's unsent text there too, and crops a picked avatar on a canvas.
 * The Inbox's read rule counts time on the page's timers while the page is
 * visible and focused. The keymap names keys for the browser's platform (⌘ on a Mac).
 */
import { browserReadingTools, createReading, createUnread } from "./modules/unread/index.ts";
import { canvasAvatarCrop, createComposer } from "./modules/composer/index.ts";
import { createAgentJoinApprovals, createBoardStore, createLoginApprovals } from "./modules/board/index.ts";
import { createLive, eventSourceAdapter } from "./modules/live/index.ts";
import { CookoutApp } from "./modules/routes/index.tsx";
import { createCookoutClient } from "./modules/sdk/index.ts";
import { createKeymap } from "./modules/keymap/index.ts";
import { createLayout } from "./modules/layout/index.ts";
import { createRoot } from "react-dom/client";
import { createSearch } from "./modules/search/web.ts";

const root = document.querySelector("#root");

if (root !== null) {
  const url = globalThis.location.origin;
  const client = createCookoutClient({ env: {}, url });
  const live = createLive(eventSourceAdapter(url));
  const boardStore = createBoardStore({ client, live, url });
  const unread = createUnread({ boardStore });
  const storage = globalThis.localStorage;
  const layout = createLayout({ root: globalThis.document.documentElement, storage });
  createRoot(root).render(
    <CookoutApp
      agentJoinApprovals={createAgentJoinApprovals(client)}
      boardStore={boardStore}
      composer={createComposer({ boardStore, crop: canvasAvatarCrop, storage })}
      keymap={createKeymap({ platform: globalThis.navigator.platform })}
      layout={layout}
      loginApprovals={createLoginApprovals(client)}
      reading={createReading(browserReadingTools())}
      search={createSearch({ search: boardStore.calls.search })}
      session={boardStore.session}
      unread={unread}
    />,
  );
}
