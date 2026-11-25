import type { Answering, ClientMethod } from "./answering.ts";
import type { CookoutClient } from "../../sdk/index.ts";
import type { Live } from "../../testing/web.ts";
import { answering } from "./answering.ts";
import { openAt } from "./render.tsx";
import { openWithClockStopped } from "./clock.ts";

interface ViewOpening {
  readonly client: CookoutClient;
  readonly hash: string;
  readonly live?: Live;
  readonly open?: typeof openAt;
  readonly waitingOn: readonly ClientMethod[];
}

interface OpenedView {
  readonly answered: Answering["answered"];
  readonly close: () => void;
}

async function viewOpened({ client, hash, live, open = openAt, waitingOn }: ViewOpening): Promise<OpenedView> {
  const { answered, client: answeringClient } = answering(client);
  const close = open({ client: answeringClient, hash, ...(live && { live }) });
  await Promise.all(
    waitingOn.map(async (method) => {
      await answered(method);
    }),
  );
  return { answered, close };
}

interface ProfileOpening {
  readonly client: CookoutClient;
  readonly name: string;
  readonly waitingOn?: readonly ClientMethod[];
}

const PROFILE_CALLS: readonly ClientMethod[] = ["listIdentities", "countMessagesBy"];

async function profileOpened({ client, name, waitingOn = PROFILE_CALLS }: ProfileOpening): Promise<OpenedView> {
  const opened = await viewOpened({ client, hash: `#/people/${name}`, waitingOn });
  return opened;
}

interface ConversationOpening {
  readonly client: CookoutClient;
  readonly hash: string;
  readonly waitingOn?: readonly ClientMethod[];
}

const THREAD_CALLS: readonly ClientMethod[] = ["getThread"];

async function conversationOpened({
  client,
  hash,
  waitingOn = THREAD_CALLS,
}: ConversationOpening): Promise<OpenedView> {
  const opened = await viewOpened({ client, hash, open: openWithClockStopped, waitingOn });
  return opened;
}

export type { ClientMethod } from "./answering.ts";
export { type OpenedView, conversationOpened, profileOpened, viewOpened };
