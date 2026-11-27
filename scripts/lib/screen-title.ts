import { createCookoutClient } from "../../app/modules/sdk/index.ts";
import { isMessageId } from "../../app/modules/messages/index.ts";

interface ScreenThread {
  readonly thread: unknown;
  readonly token: string;
  readonly url: string;
}

const THREAD_TITLE = "Flaky login test";

async function titleScreenThread({ thread, token, url }: ScreenThread): Promise<void> {
  if (typeof thread !== "number" || !isMessageId(thread)) {
    throw new TypeError("pnpm seed printed no thread to title");
  }
  await createCookoutClient({ env: {}, token, url }).setThreadTitle(thread, THREAD_TITLE);
}

export { titleScreenThread };
