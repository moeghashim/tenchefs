import type { InboxItem, MessageId, TopLevelMessage } from "../../sdk/index.ts";

interface Reparenting {
  readonly items: Map<MessageId, InboxItem>;
  readonly parent: TopLevelMessage;
}

function reparent({ items, parent }: Reparenting): boolean {
  let held = false;
  for (const [id, item] of items) {
    if (item.parent.id === parent.id) {
      items.set(id, { ...item, parent });
      held = true;
    }
  }
  return held;
}

export { reparent };
