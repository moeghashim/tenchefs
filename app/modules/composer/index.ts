/**
 * The `composer` store: what is written in each message box (a thread's
 * reply box or a channel's message box) and in each display name field of
 * the settings page, and the identities it suggests for an `@` mention. Every
 * identity, human and agent, comes from the board store's identities slice,
 * shown while any reader of a draft is subscribed; the composer keeps only the
 * page's state and sends every identity change through the board store's
 * `identityCalls`. `draft(key)` is one box's draft, an
 * external store read with `useSyncExternalStore`, the same store each time
 * for one key, so a draft is still there on coming back to its box. `edit` takes the box's text
 * and caret: when the caret sits just after `@` and the start of a name, as
 * `mentionPattern` reads a mention (one space may follow the `@`, as dictation types "@ "), the suggestions are the identities whose
 * names start with it, a thread's members first (those `draft` is given,
 * most recent poster first), then the rest by name; a channel's box puts its `channelPosters` first (#666), a replier
 * other than a thread's latest counting as posting just after the thread's starter, as the page has no time for them. `choose` swaps that `@` and prefix for the whole
 * mention and a space (or puts it at the caret if no mention is being typed),
 * and puts the caret after it; `clear` empties the box. While there are
 * suggestions, one is `highlighted` (the first, after each edit): `highlight`
 * moves it down or up, wrapping round, and `chooseHighlighted` chooses it.
 * When the identities or Webhook commands change, the suggestions are read again, but the highlighted
 * one stays highlighted while still listed, and suggestions `dismiss` hid stay hidden, so a change
 * elsewhere never moves what the keys act on.
 * `replyTo(name)` puts `@name ` at the start of the box (Reply on a thread's
 * message, or on a channel message for its thread's box), unless the text already mentions them or they are deactivated,
 * and asks the box to take focus with the caret at the end.
 * `identities` is the identity list itself, an external store too, over the
 * board store's identities slice, so a view can tell a human from an agent
 * and show each display name, as the board store keeps it up to date. An
 * identity deleted elsewhere leaves the list, and a profile open on it closes,
 * with `identities.deletion` naming it for a notice until dismissed.
 * Until the identities load, or if the server refuses them, nobody is
 * suggested. `setAdmin` makes an identity an admin or removes admin from it,
 * putting the identity the server answers in the list, and `adminChange` is
 * that change's state: being sent, or why the server refused it.
 * `displayName(name)` is that identity's display name as it is edited: its
 * text is `null` until edited, so the field shows the saved one; `save` sends
 * the field's text trimmed (empty clears it), puts the answer in the identity
 * list at once and forgets the text, or, if the server refuses, keeps the
 * text and the refusal. `description(name)` is an agent's description as it
 * is edited, and saves the same way.
 * `avatar(name)` is an avatar picked and not saved yet (#560): `choose` refuses a file over 2 MB or, after `options.crop`, not an image, else keeps the 256 px PNG with a `data:` URL to preview;
 * `save` sends it and saves as `description` does, and `cancel` forgets it. `canvasAvatarCrop` is the page's crop.
 * `identities.actions(name)` is what an agent's owner or an admin does to
 * that identity: rotate its token, list and revoke its agent session (the board store's agent sessions for it, shown while `subscribeToSessions` has a reader),
 * deactivate it, reactivate it, delete it and transfer it. Each is asked
 * first (`ask.rotate()` and so on puts it in `confirming`), runs on `confirm`
 * and stays `confirming` while it runs and if the server refuses it, so the
 * question stays open with the refusal kept as `action`; it closes once the
 * action succeeds, or on `cancel`, which does nothing while it runs and keeps a refusal as `action` until the next ask,
 * so a row can still show it (#278).
 * Each answer goes in the identity list at once, and a fresh token is in its
 * snapshot until `forgetToken` (`copyToken` puts it on the clipboard).
 * `identities.creation` creates an agent the caller owns, whose token then
 * shows in that agent's `actions`.
 * `channelDraft(channel)`, a channel's box, also suggests, when the whole text is `/` and a prefix, the Commands with names starting with it (only `/schedule`), then the registered Webhook commands that do (from the board store's list, read once the identities load), less any named like a Command.
 * Choosing a Command completes the box to `/name `, and so does choosing an inline Webhook command, one whose form `inlineField` reads as exactly one text field (#872); `commandRun(text)` says when sending `/name`, or `/name ` and a text, runs a Command, calls an inline Webhook command with that text, or opens a Webhook command's form, instead of posting.
 * Choosing any other Webhook command, or `openWebhookCommand`, makes it the draft's `webhookCommand`, whose data the box prompts
 * for, until `clear`, or `unpickWebhookCommand`, which brings back the text as it was; `dismiss` hides any suggestions until the next edit.
 * `draft(key)`, a thread's reply box, suggests and runs the same Commands and Webhook commands (#873, #874): its Webhook command calls are made as replies in the thread, while `/schedule` still schedules a top-level message in the thread's channel.
 * Each box's text, unsent, is kept in the browser's storage (`options.storage`, under the browser-storage module's
 * `keptTextKey`) for the identity logged in when the box is first drawn, so it shows only in its own box and only to
 * that identity, and comes back, with the caret at its end, when the page opens again (#600); while nobody is logged in it is kept
 * on the page only. Each identity has its
 * own draft for a box. Emptying the box, by hand or by `clear` after sending, forgets it. Attachments are not kept.
 * A draft's `attachments` are the files added to its box and not sent yet (#377): `attach` adds them, leaving out
 * one over 10 MB and stopping at the 11th with the server's own refusal wording, `remove` takes one out, and `clear`
 * on the draft empties them with its text. An image among them has an object URL for its thumbnail until it leaves.
 */
import type { AgentCreation, IdentityActions } from "./lib/owner-powers.ts";
import type { AvatarChoice, AvatarCrop, DisplayNameDraft, TriggerSettings } from "./lib/profile-stores.ts";
import type { BrowserStorage, CommandRun, DraftSnapshot, KeptText, Sources, WebhookCommand } from "./lib/snapshot.ts";
import {
  COMMANDS,
  EMPTY,
  changesFor,
  channelWebhookCommands,
  commandRunIn,
  draftChanges,
  keptTextIn,
} from "./lib/snapshot.ts";
import type { Identity, IdentityName } from "../sdk/index.ts";
import type { IdentityList, IdentityStore } from "./lib/identity-list.ts";
import { loggedInName, selectedStore, webhookCommandList } from "../board/index.ts";
import { storeIn, withAttachments } from "./lib/draft.ts";
import type { AdminChanges } from "./lib/admin-change.ts";
import type { IdentityDeletion } from "./lib/identity-deletion.ts";
import type { PendingAttachments } from "./lib/draft.ts";
import { createAdminChanges } from "./lib/admin-change.ts";
import { createIdentityDeletion } from "./lib/identity-deletion.ts";
import { createIdentityList } from "./lib/identity-list.ts";
import { listenersOf } from "./lib/listeners.ts";
import { ownerPowersOf } from "./lib/owner-powers.ts";
import { profileStoresOf } from "./lib/profile-stores.ts";

function createDraft(list: IdentityList, sources: Sources, kept: KeptText): Omit<Draft, "attachments"> {
  const listeners = listenersOf(list.show);
  const changes = changesFor(sources);
  const { change, current } = draftChanges({ kept, notify: listeners.notify });

  list.onChange(() => {
    change(changes.refreshed);
  });
  return {
    choose: (name) => {
      change((snapshot) => changes.mentioned(snapshot, name));
    },
    chooseHighlighted: () => {
      change((snapshot) => changes.chosen(snapshot));
    },
    clear: () => {
      change(() => changes.written(EMPTY, EMPTY));
    },
    commandRun: (text) =>
      commandRunIn({ commands: sources.commands, text, webhookCommands: sources.webhookCommands() }),
    dismiss: () => {
      change(changes.dismissed);
    },
    edit: (text, caret) => {
      change((snapshot) => changes.written(snapshot, { caret, text }));
    },
    highlight: (direction) => {
      change((snapshot) => changes.highlightMoved(snapshot, direction));
    },
    openWebhookCommand: (name) => {
      change((snapshot) => changes.opened(snapshot, name));
    },
    pickCommand: (name) => {
      change((snapshot) => changes.completed(snapshot, name));
    },
    pickWebhookCommand: (name) => {
      change((snapshot) => changes.picked(snapshot, name));
    },
    replyTo: (name) => {
      change((snapshot) => changes.repliedTo(snapshot, name));
    },
    snapshot: current,
    subscribe: listeners.add,
    unpickWebhookCommand: () => {
      change(changes.unpicked);
    },
  };
}

interface IdentitiesMaking {
  readonly list: IdentityList;
  readonly adminChanges: AdminChanges;
  readonly deletion: IdentityDeletion;
  readonly readers: Pick<ReturnType<typeof listenersOf>, "add">;
}

interface IdentitiesShown {
  readonly identities: readonly Identity[];
  readonly adminChange: ReturnType<AdminChanges["adminChange"]>;
}

function identitiesOf({ adminChanges, deletion, list, readers }: IdentitiesMaking): Identities {
  let shown: IdentitiesShown | null = null;
  function shownNow(): IdentitiesShown {
    const identities = list.identities();
    const adminChange = adminChanges.adminChange();
    if (shown === null || shown.identities !== identities || shown.adminChange !== adminChange) {
      shown = { adminChange, identities };
    }
    return shown;
  }
  return {
    ...adminChanges,
    ...ownerPowersOf(list),
    deletion,
    snapshot: list.identities,
    subscribe: selectedStore({ snapshot: shownNow, subscribe: readers.add }).subscribe,
  };
}

/** One message box's draft. `subscribe` and `snapshot` are the two halves `useSyncExternalStore` takes. */
export interface Draft {
  /** Calls `listener` after every change, until the returned function is called. */
  readonly subscribe: (listener: () => void) => () => void;
  /** The current snapshot: a new object whenever it changes, the same one until then. */
  readonly snapshot: () => DraftSnapshot;
  /** Takes the box's text and caret as the person typed them. */
  readonly edit: (text: string, caret: number) => void;
  /** Puts `@name ` in place of the mention being typed. */
  readonly choose: (name: string) => void;
  /** Chooses the highlighted suggestion, if there are any: a mention to put in, a Command to complete, or a Webhook command to pick. */
  readonly chooseHighlighted: () => void;
  /** Puts `@name ` at the start of the box, unless the text already mentions them or they are deactivated, and has the box take focus with the caret at the end; with `null` (replying to yourself) it only takes focus. */
  readonly replyTo: (name: string | null) => void;
  /** Completes the box to `/name ` with the caret at its end, if the box suggests the named Command. */
  readonly pickCommand: (name: string) => void;
  /**
   * What sending `text` runs in place of posting, or `null` when it names no Command or Webhook command, so it posts: a Command with the text after `/name `;
   * a `call` of an inline Webhook command (one whose form is one text field) with that text verbatim as its field's value; or the `form` of a Webhook command to open, for one that isn't inline or has no text.
   */
  readonly commandRun: (text: string) => CommandRun | null;
  /** Picks the named Webhook command, if the box suggests it: an inline one completes the box to `/name ` as `pickCommand` does, any other one is picked as `openWebhookCommand` does. */
  readonly pickWebhookCommand: (name: string) => void;
  /** Opens the named registered Webhook command's form, keeping the text for `unpickWebhookCommand`. */
  readonly openWebhookCommand: (name: string) => void;
  /** Drops the picked Webhook command and keeps the text, so the box comes back as it was, its suggestions hidden and `returned` true until the next edit. */
  readonly unpickWebhookCommand: () => void;
  /** Hides the suggestions until the next edit. */
  readonly dismiss: () => void;
  /** Moves the highlight one suggestion down or up, wrapping round. */
  readonly highlight: (direction: "down" | "up") => void;
  /** The files added to the box and not sent yet, by paste, drop or the attach button (#377). */
  readonly attachments: PendingAttachments;
  /** Empties the box, its pending files included, and drops the picked Webhook command, as after sending its message or call. */
  readonly clear: () => void;
}

/** The identity list. `subscribe` and `snapshot` are the two halves `useSyncExternalStore` takes. */
export interface Identities extends AdminChanges {
  /** Calls `listener` once the list loads and whenever an identity in it changes, until the returned function is called. */
  readonly subscribe: (listener: () => void) => () => void;
  /** Every identity, sorted by name: empty until it loads, or if the server refuses it. */
  readonly snapshot: () => readonly Identity[];
  /** What its owner or an admin does to this identity: the same store each time for one name. */
  readonly actions: (name: IdentityName) => IdentityActions;
  /** Creating an agent the caller owns. */
  readonly creation: AgentCreation;
  /**
   * The identity just deleted elsewhere whose open profile closed, for a notice, until `dismiss`: `null` if none.
   * With `live`, an identity deleted elsewhere leaves the list at once, and a profile open on it closes.
   */
  readonly deletion: Pick<IdentityDeletion, "dismiss" | "snapshot" | "subscribe">;
}

/** The composer store: a draft for each message box (and each identity typing in it), and for each display name being edited. */
export interface Composer {
  /**
   * The draft for the box with this key (`channel/id` for a thread's reply box): the same store each time for one key. It suggests the Commands and the Webhook commands, as a channel's box does.
   * `members`, read at each edit, names the identities to suggest ahead of the other matches, in its order (a thread's members, most recent poster first); the first call for a key sets it.
   */
  readonly draft: (key: string, members: () => readonly IdentityName[]) => Draft;
  /** The draft for a channel's message box, which also suggests the Commands and the Webhook commands: the same store each time for one channel. */
  readonly channelDraft: (channel: string) => Draft;
  /** Who posted a message or a reply in this channel, from its messages the page has loaded, most recent first, without whoever is logged in. */
  readonly channelPosters: (channel: string) => readonly IdentityName[];
  /** The display name being edited for this identity: the same store each time for one name. */
  readonly displayName: (name: IdentityName) => DisplayNameDraft;
  /** The description being edited for this agent: the same store each time for one name. */
  readonly description: (name: IdentityName) => DisplayNameDraft;
  /** The avatar picked for this identity and not saved yet: the same store each time for one name. */
  readonly avatar: (name: IdentityName) => AvatarChoice;
  /** The identity list the suggestions come from. */
  readonly identities: Identities;
  /** This agent's trigger URL for its owner: read when first shown, set with a write-only token, or cleared (#378). */
  readonly trigger: (name: IdentityName) => TriggerSettings;
}

/** What the composer store needs: the board store, which holds the identities and the Webhook commands the boxes suggest, and makes the identities' changes on the server. */
export interface ComposerOptions {
  readonly boardStore: IdentityStore;
  /** Where each box's unsent text is kept: the browser's local storage on the page. */
  readonly storage: BrowserStorage;
  /** How a picked image becomes an avatar's PNG: `canvasAvatarCrop` on the page. */
  readonly crop: AvatarCrop;
}

/**
 * Makes a composer store whose identities come from `options.boardStore`.
 * @param options The board store.
 * @returns The store.
 */
export function createComposer(options: ComposerOptions): Composer {
  const drafts = new Map<string, Draft>();
  const keptText = keptTextIn(options.storage);
  const list = createIdentityList(options.boardStore);
  const deletion = createIdentityDeletion(options.boardStore);
  const readers = listenersOf(list.show);
  function webhookCommands(): readonly WebhookCommand[] {
    return channelWebhookCommands(webhookCommandList(options.boardStore.snapshot()));
  }
  function keptDraft(box: string, sources: Omit<Sources, "identities">): Draft {
    const kept = keptText(loggedInName(options.boardStore.snapshot()), box);
    const all = { ...sources, identities: list.identities };
    return storeIn({ key: kept.key, make: () => withAttachments(createDraft(list, all, kept)), stores: drafts });
  }
  list.onChange(readers.notify);
  return {
    ...profileStoresOf({ crop: options.crop, list }),
    channelDraft: (channel) =>
      keptDraft(channel, { commands: COMMANDS, members: () => list.posters(channel), webhookCommands }),
    channelPosters: list.posters,
    draft: (key, members) => keptDraft(key, { commands: COMMANDS, members, webhookCommands }),
    identities: identitiesOf({ adminChanges: createAdminChanges(list), deletion, list, readers }),
  };
}

export type { AvatarChoice, DisplayNameDraft } from "./lib/profile-stores.ts";
export type { Command, CommandRun } from "./lib/snapshot.ts";
export { type Prompt, type PromptField, fieldsOf, promptOf } from "./lib/schema-fields.ts";
export { canvasAvatarCrop } from "./lib/canvas-crop.ts";
export { type TriggerSettings, type TriggerSnapshot, savedUrl } from "./lib/trigger-settings.ts";
export type { AgentCreation } from "./lib/agent-creation.ts";
export type { PendingAttachment, PendingAttachments } from "./lib/pending-attachments.ts";
export type { IdentityAction, IdentityActions, MessageCount } from "./lib/identity-actions.ts";
