import type { ChannelName, IdentityName, MessageId } from "../../sdk/index.ts";
import type { Composer, Draft } from "../../composer/index.ts";
import type { Read } from "./use-board.ts";
import type { ThreadMessagesState } from "../../board/index.ts";

interface ThreadDraftOf {
  readonly composer: Composer;
  readonly channel: ChannelName;
  readonly thread: MessageId;
  readonly messages: Pick<Read<ThreadMessagesState>, "snapshot">;
  readonly me: string;
}

function isLoaded(state: ThreadMessagesState): state is Extract<ThreadMessagesState, { status: "loaded" }> {
  return state.status === "loaded";
}

function membersOf(state: ThreadMessagesState, me: string): readonly IdentityName[] {
  const loaded = [state].filter((each) => isLoaded(each));
  const posts = [...loaded.map((thread) => thread.parent), ...loaded.flatMap((thread) => thread.replies)];
  const posters = posts.map((message) => message.author.name).toReversed();
  return [...new Set(posters)].filter((name) => name !== me);
}

export function threadDraft({ channel, composer, me, messages, thread }: ThreadDraftOf): Draft {
  return composer.draft(`${channel}/${String(thread)}`, () => membersOf(messages.snapshot(), me));
}

export type { Composer } from "../../composer/index.ts";
