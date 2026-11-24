import type { ChannelName, InboxItem, MessageId, ReadPosition } from "../../sdk/index.ts";

interface Held {
  readonly items: Map<MessageId, InboxItem>;
  readonly positions: Map<string, MessageId>;
  readonly places: Map<string, Pick<ReadPosition, "channel" | "thread">>;
}

function isScopeIn(channel: ChannelName, scope: string): boolean {
  return scope === channel || scope.startsWith(`${channel}/`);
}

function forgetItems(items: Held["items"], channel: ChannelName): void {
  for (const [id, item] of items) {
    if (item.message.channel === channel) {
      items.delete(id);
    }
  }
}

function forgetScopes({ places, positions }: Omit<Held, "items">, channel: ChannelName): void {
  const scopes = [...positions.keys(), ...places.keys()].filter((scope) => isScopeIn(channel, scope));
  for (const scope of scopes) {
    places.delete(scope);
    positions.delete(scope);
  }
}

function forgetChannelIn({ channel, ...held }: Held & { readonly channel: ChannelName }): void {
  forgetItems(held.items, channel);
  forgetScopes(held, channel);
}

export { forgetChannelIn };
