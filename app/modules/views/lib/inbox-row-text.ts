import type { InboxItem } from "../../sdk/index.ts";
import type { UnreadWhy } from "../../unread/index.ts";
import { plainTextOf } from "./markdown-plain-text.ts";
import { reactionSymbols } from "../../messages/index.ts";

const CONTEXT_LENGTH = 70;
const START = 0;
const ELLIPSIS = 1;

function contextOf(item: InboxItem): string | null {
  if (typeof item.parent.title === "string") {
    return item.parent.title;
  }
  if (item.message.kind !== "reply") {
    return null;
  }
  const text = plainTextOf(item.parent.text);
  if (text.length <= CONTEXT_LENGTH) {
    return text;
  }
  return `${text.slice(START, CONTEXT_LENGTH - ELLIPSIS)}…`;
}

const WHY_TEXT = {
  "followed-thread": "New reply in a thread you follow",
  "mentioned-you": "Mentioned you",
  "replied-to-you": "Replied to you",
} as const;

function reactedText({ newReactions = [] }: InboxItem): string {
  return newReactions
    .map((reaction) => `@${reaction.identity} reacted with ${reactionSymbols[reaction.reaction]}`)
    .join(", ");
}

interface WhyOf {
  readonly why: UnreadWhy;
  readonly item: InboxItem;
}

function whyText({ item, why }: WhyOf): string {
  if (why === "reacted") {
    return reactedText(item);
  }
  if (why === "subscribed-channel") {
    return `New in #${item.channel.name}`;
  }
  return WHY_TEXT[why];
}

export { contextOf, whyText };
