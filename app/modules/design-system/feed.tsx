/**
 * The design system's feed: the inbox's centred column of rows (`layout.tsx` has the design system as a whole).
 *
 * - `Feed` is a named, centred column that scrolls, such as the inbox, read from the top.
 * - `FeedHeading` heads a part of a `Feed`, with its count, or, with no count, as a divider line.
 * - `FeedList` is a named list of `FeedRow`s.
 * - `FeedRow` is a link over the whole row (named by its text) leading with why it is there (`why`), then a message with its author's avatar and name (its own link, to `authorHref`, above the row's), what they did (`action`) and in which channel, a short time, a `Closed` marker when it is `closed` (its thread is closed), any `count` of how many of its messages are new ("3 new") and any `context` line (a reply's thread, or its thread's Thread title), then what it holds: its `FeedText` and any `RowButton`; given a `menu`, it is an `ActionMenu`'s target. A `for-you` row has an accent dot and why, a bold name and bright text; an `activity` row has a muted dot and why, a bold name and bright text; a `read` one is muted. A `current` row, the one whose conversation is shown, is highlighted and its link marked as the current page.
 * - `FeedText` is a row's text, up to two lines.
 * - `RowButton` is a small button raised above the row's link.
 * - `FeedNoticeRow` sits in a `FeedList` for an Inbox entry about an identity rather than a message: its why, then the identity's avatar and name (a link to `href`) and a short time, then any buttons; `for-you` or `read` as a `FeedRow`.
 * - `FeedNote` is a muted line in a feed: why a part is `empty`, or that it has reached the `end`.
 * - `ScheduledMark` is a post's muted clock mark with its `label`, such as "Scheduled": a button calling `onOpen`, or plain text where `onOpen` is `null`.
 * - `MoreButton` is a quiet full-width row under a list that loads more of it, with a spinner while `loading`.
 */
export {
  FeedRowClosed,
  ScheduledMark,
  MoreButton,
  Feed,
  FeedHeading,
  FeedList,
  FeedNote,
  FeedNoticeRow,
  FeedRow,
  FeedText,
  RowButton,
} from "./lib/feed-rows.ts";
