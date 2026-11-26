import type { BoardStore, DeleteOutcome, MessageDeleting } from "../index.ts";
import type { Message, MessageId } from "../../sdk/index.ts";
import { adminClient, channelShown, humanIn, idsOf, opened, postedIn, repliedTo } from "./held-store.ts";
import { expect, it, vi } from "vitest";
import { messageDeleting } from "../index.ts";

interface Deleted {
  readonly outcome: DeleteOutcome;
  readonly after: MessageDeleting;
}

interface Deleting {
  readonly store: BoardStore;
  readonly message: Message;
}

function askedIdOf(deleting: MessageDeleting): MessageId | null {
  if (deleting.asked === null) {
    return null;
  }
  return deleting.asked.id;
}

async function deleted({ message, store }: Deleting): Promise<Deleted> {
  const answered = vi.fn<(outcome: DeleteOutcome) => void>();
  store.calls.askDelete(message);
  store.calls.deleteMessage(message.id, answered);
  const outcome = await vi.waitFor(() => {
    const [[answer] = []] = answered.mock.calls;
    if (typeof answer !== "object") {
      throw new TypeError("Not answered yet.");
    }
    return answer;
  });
  return { after: messageDeleting(store.snapshot()), outcome };
}

function deletedIdOf(outcome: DeleteOutcome): MessageId | null {
  if ("deleted" in outcome) {
    return outcome.deleted.id;
  }
  return null;
}

it("deleting a message asked to be deleted marks its slot in the shown channel page and answers it deleted", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const parent = await postedIn("web-calls-delete");
  const { store } = opened();
  const page = await channelShown({ channel: parent.channel, store });
  const { after, outcome } = await deleted({ message: parent, store });

  expect({
    after,
    deleted: [...page().deleted],
    ids: idsOf(page().messages),
    outcome: deletedIdOf(outcome),
  }).toStrictEqual({
    after: { asked: null, pending: false, refusal: null },
    deleted: [parent.id],
    ids: [parent.id],
    outcome: parent.id,
  });
});

it("a refused delete keeps the message asked and its refusal, and leaves the message shown", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const parent = await postedIn("web-calls-delete-refused");
  const reply = await repliedTo({ parent });
  const bob = await humanIn(parent.channel);
  const { store } = opened({ client: bob.client });
  const page = await channelShown({ channel: parent.channel, store });
  const { after, outcome } = await deleted({ message: reply, store });

  expect({ asked: askedIdOf(after), deleted: [...page().deleted], outcome }).toStrictEqual({
    asked: reply.id,
    deleted: [],
    outcome: { refusal: after.refusal },
  });
});

it("cancelling a delete forgets the message asked and deletes nothing", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const parent = await postedIn("web-calls-delete-cancel");
  const { store } = opened();
  store.calls.askDelete(parent);
  store.calls.cancelDelete();
  const { parent: still } = await adminClient().getThread(parent.id);
  const asked = askedIdOf(messageDeleting(store.snapshot()));

  expect({ asked, id: still.id }).toStrictEqual({
    asked: null,
    id: parent.id,
  });
});

it("a delete asked while another is pending is dropped: it deletes nothing and is never answered", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const parent = await postedIn("web-calls-delete-pending");
  const [first, dropped, later] = [
    await repliedTo({ parent }),
    await repliedTo({ parent }),
    await repliedTo({ parent }),
  ];
  const { store } = opened();
  const droppedAnswered = vi.fn<(outcome: DeleteOutcome) => void>();
  const firstDeleted = deleted({ message: first, store });
  store.calls.deleteMessage(dropped.id, droppedAnswered);
  const { outcome: firstOutcome } = await firstDeleted;
  const [{ outcome: laterOutcome }, { parent: after }] = [
    await deleted({ message: later, store }),
    await adminClient().getThread(parent.id),
  ];

  expect({
    droppedAnswers: droppedAnswered.mock.calls.length,
    first: deletedIdOf(firstOutcome),
    later: deletedIdOf(laterOutcome),
    replyCount: after.replyCount,
  }).toStrictEqual({
    droppedAnswers: 0,
    first: first.id,
    later: later.id,
    replyCount: 1,
  });
});
