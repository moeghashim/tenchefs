import type { ChannelName, CookoutClient, MessageId, ReadReceipt, TopLevelMessage } from "../../sdk/index.ts";

interface Page {
  readonly hasMore: boolean;
  readonly messages: readonly TopLevelMessage[];
  readonly receipts: readonly ReadReceipt[];
}

interface Paging {
  readonly client: Pick<CookoutClient, "listMessages">;
  readonly name: ChannelName;
  readonly pageSize: number;
}

interface Reaching {
  readonly paging: Paging;
  readonly newestShown: number;
  readonly page: Page;
}

const NOTHING_SHOWN = 0;

async function reachingBack({ newestShown, page, paging }: Reaching): Promise<Page> {
  const oldest = Math.min(...page.messages.map((message) => message.id));
  if (!page.hasMore || oldest <= newestShown) {
    return page;
  }
  const older = await paging.client.listMessages(paging.name, { before: oldest, limit: paging.pageSize });
  const reached = await reachingBack({ newestShown, page: older, paging });
  return {
    hasMore: reached.hasMore,
    messages: [...reached.messages, ...page.messages],
    receipts: [...reached.receipts, ...page.receipts],
  };
}

interface Since extends Paging {
  readonly shown: readonly MessageId[];
}

async function newestSince(paging: Since): Promise<Page> {
  const { shown } = paging;
  const newest = await paging.client.listMessages(paging.name, { limit: paging.pageSize });
  const newestShown = Math.max(NOTHING_SHOWN, ...shown);
  const page = await reachingBack({ newestShown, page: newest, paging });
  return page;
}

export { newestSince };
