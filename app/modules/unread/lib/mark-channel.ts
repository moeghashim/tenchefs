import type { ChannelName, CookoutClient, InboxItem, MessageId, Refusal } from "../../sdk/index.ts";
import type { InboxItems } from "./inbox-items.ts";
import { createNotifier } from "./notifier.ts";
import { refusalOf } from "../../sdk/index.ts";

interface MarkChannelOptions {
  readonly client: Pick<CookoutClient, "ack">;
  readonly items: InboxItems;
  readonly onRead: (item: InboxItem) => void;
  readonly onChange: () => void;
}

type MarkChannelRefusal = Refusal & { readonly channel: ChannelName };

interface MarkChannel {
  readonly subscribe: (listener: () => void) => () => void;
  readonly refusal: () => MarkChannelRefusal | null;
  readonly markChannelRead: (channel: ChannelName) => void;
}

function placeOf(item: InboxItem): string {
  if (item.message.kind === "reply") {
    return String(item.message.replyTo);
  }
  return "channel";
}

function newestByPlace(items: readonly InboxItem[], channel: ChannelName): readonly MessageId[] {
  const newest = new Map<string, MessageId>();
  for (const item of items) {
    if (item.channel.name === channel) {
      newest.set(placeOf(item), item.message.id);
    }
  }
  return [...newest.values()];
}

function createMarkChannel(options: MarkChannelOptions): MarkChannel {
  const { client, items, onChange, onRead } = options;
  const refused = createNotifier<MarkChannelRefusal | null>(null);
  let marking: Promise<void> = Promise.resolve();

  async function ackOne(messageId: MessageId): Promise<Refusal | null> {
    try {
      const { readPosition } = await client.ack(messageId);
      items.readAll([readPosition], onRead);
      onChange();
      return null;
    } catch (error: unknown) {
      return refusalOf(error);
    }
  }

  async function markAfter(previous: Promise<void>, channel: ChannelName, newest: readonly MessageId[]): Promise<void> {
    await previous;
    refused.publish(null);
    const refusals = await Promise.all(
      newest.map(async (messageId) => {
        const refusal = await ackOne(messageId);
        return refusal;
      }),
    );
    const refusal = refusals.find((each) => each !== null) ?? null;
    if (refusal !== null) {
      refused.publish({ ...refusal, channel });
    }
  }

  return {
    markChannelRead: (channel) => {
      marking = markAfter(marking, channel, newestByPlace(items.list(), channel));
    },
    refusal: refused.current,
    subscribe: refused.subscribe,
  };
}

export { type MarkChannel, createMarkChannel };
