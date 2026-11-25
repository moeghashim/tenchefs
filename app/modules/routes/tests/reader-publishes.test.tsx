import { expect, it, onTestFinished, vi } from "vitest";
import { handFocus, recordPublishes } from "../../testing/web.ts";
import type { MessageId } from "../../sdk/index.ts";
import { adminClient } from "./identities.ts";
import { createPageFocus } from "../../page-focus/index.ts";
import { createReading } from "../../unread/index.ts";
import { handClock } from "./hand-clock.ts";

const NONE = 0;
const NAME = "web-reader-publishes";

async function posted(): Promise<MessageId> {
  await adminClient().createChannel({ name: NAME });
  const { message } = await adminClient().createMessage({ channel: NAME, text: "Lunch?" });
  return message.id;
}

it("a conversation's reader publishes nothing when it is marked unread again", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const id = await posted();
  const reader = createReading({ clock: handClock().clock, page: createPageFocus(handFocus().adapter) }).reader(NAME, {
    ack: vi.fn<(id: MessageId) => void>(),
    firstUnread: () => id,
    markUnread: vi.fn<(id: MessageId) => void>(),
    newest: () => ({ id, mine: false }),
    subscribe: () => vi.fn<() => void>(),
    subscribeToUnread: () => vi.fn<() => void>(),
  });
  onTestFinished(reader.subscribe(vi.fn<() => void>()));
  reader.markUnread();
  const publishes = recordPublishes(reader);

  reader.markUnread();

  expect(publishes.count()).toBe(NONE);
});
