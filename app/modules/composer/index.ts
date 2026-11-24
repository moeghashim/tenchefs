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
 * `mentionPattern` reads a mention, the suggestions are the identities whose
 * names start with it, a thread's members first (those `draft` is given,
 * most recent poster first), then the rest by name. `choose` swaps that `@` and prefix for the whole
 * mention and a space (or puts it at the caret if no mention is being typed),
 * and puts the caret after it; `clear` empties the box. While there are
 * suggestions, one is `highlighted` (the first, after each edit): `highlight`
 * moves it down or up, wrapping round, and `chooseHighlighted` chooses it.
 * `replyTo(name)` puts `@name ` at the start of the box (Reply on a thread's
 * message), unless the text already mentions them or they are deactivated,
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
 * `channelDraft(channel)`, a channel's box, also suggests the registered
 * commands (from the board store's command list, read once the identities load)
 * whose names start with what follows `/` when that is the whole text;
 * choosing one makes it the draft's `command`, whose data the box prompts
 * for, until `clear`, or `unpick`, which brings back the text as it was; `dismiss` hides any suggestions until the next edit. A
 * thread's reply box suggests no commands, since a call is a top-level message.
 */
import type { Command, Identity, IdentityName, Token } from "../sdk/index.ts";
import type { DisplayNameDraft, TriggerSettings } from "./lib/profile-stores.ts";
import type { DraftSnapshot, Sources } from "./lib/snapshot.ts";
import { EMPTY, changesFor } from "./lib/snapshot.ts";
import type { IdentityList, IdentityStore } from "./lib/identity-list.ts";
import type { AdminChanges } from "./lib/admin-change.ts";
import type { AgentCreation } from "./lib/agent-creation.ts";
import type { IdentityActions } from "./lib/identity-actions.ts";
import type { IdentityDeletion } from "./lib/identity-deletion.ts";
import { commandList } from "../board/index.ts";
import { createAdminChanges } from "./lib/admin-change.ts";
import { createAgentCreation } from "./lib/agent-creation.ts";
import { createIdentityActions } from "./lib/identity-actions.ts";
import { createIdentityDeletion } from "./lib/identity-deletion.ts";
import { createIdentityList } from "./lib/identity-list.ts";
import { listenersOf } from "./lib/listeners.ts";
import { profileStoresOf } from "./lib/profile-stores.ts";

const NO_COMMANDS: readonly Command[] = [];
const NO_MEMBERS: readonly IdentityName[] = [];

function noMembers(): readonly IdentityName[] {
  return NO_MEMBERS;
}

function createDraft(list: IdentityList, sources: Sources): Draft {
  const listeners = listenersOf(list.show);
  const changes = changesFor(sources);
  let current: DraftSnapshot = EMPTY;

  function change(update: (snapshot: DraftSnapshot) => DraftSnapshot): void {
    current = update(current);
    listeners.notify();
  }

  list.onChange(() => {
    change((snapshot) => changes.written(snapshot, snapshot));
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
    dismiss: () => {
      change(changes.dismissed);
    },
    edit: (text, caret) => {
      change((snapshot) => changes.written(snapshot, { caret, text }));
    },
    highlight: (direction) => {
      change((snapshot) => changes.highlightMoved(snapshot, direction));
    },
    pick: (name) => {
      change((snapshot) =>
        changes.picked(
          snapshot,
          snapshot.commands.filter((command) => command.name === name),
        ),
      );
    },
    replyTo: (name) => {
      change((snapshot) => changes.repliedTo(snapshot, name));
    },
    snapshot: () => current,
    subscribe: listeners.add,
    unpick: () => {
      change(changes.unpicked);
    },
  };
}

function storeIn<Store>(stores: Map<string, Store>, key: string, make: () => Store): Store {
  const store = stores.get(key) ?? make();
  stores.set(key, store);
  return store;
}

function ownerPowersOf(list: IdentityList): Pick<Identities, "actions" | "creation"> {
  const stores = new Map<string, IdentityActions>();
  function actions(name: IdentityName): IdentityActions {
    return storeIn(stores, name, () => createIdentityActions({ list, name }));
  }
  function created(name: IdentityName, token: Token): void {
    actions(name).showToken(token);
  }
  return { actions, creation: createAgentCreation({ created, list }) };
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
  /** Chooses the highlighted suggestion, if there are any: a mention to put in, or a command to pick. */
  readonly chooseHighlighted: () => void;
  /** Puts `@name ` at the start of the box, unless the text already mentions them or they are deactivated, and has the box take focus with the caret at the end; with `null` (replying to yourself) it only takes focus. */
  readonly replyTo: (name: string | null) => void;
  /** Picks the named command, if the box suggests it, keeping the text for `unpick`. */
  readonly pick: (name: string) => void;
  /** Drops the picked command and keeps the text, so the box comes back as it was, its suggestions hidden and `returned` true until the next edit. */
  readonly unpick: () => void;
  /** Hides the suggestions until the next edit. */
  readonly dismiss: () => void;
  /** Moves the highlight one suggestion down or up, wrapping round. */
  readonly highlight: (direction: "down" | "up") => void;
  /** Empties the box and drops the picked command, as after sending its message or call. */
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

/** The composer store: a draft for each message box, and for each display name being edited. */
export interface Composer {
  /**
   * The draft for the box with this key (`channel/id` for a thread's reply box): the same store each time for one key. It suggests no commands.
   * `members`, read at each edit, names the identities to suggest ahead of the other matches, in its order (a thread's members, most recent poster first); the first call for a key sets it.
   */
  readonly draft: (key: string, members?: () => readonly IdentityName[]) => Draft;
  /** The draft for a channel's message box, which also suggests commands: the same store each time for one channel. */
  readonly channelDraft: (channel: string) => Draft;
  /** The display name being edited for this identity: the same store each time for one name. */
  readonly displayName: (name: IdentityName) => DisplayNameDraft;
  /** The description being edited for this agent: the same store each time for one name. */
  readonly description: (name: IdentityName) => DisplayNameDraft;
  /** The identity list the suggestions come from. */
  readonly identities: Identities;
  /** This agent's trigger URL for its owner: read when first shown, set with a write-only token, or cleared (#378). */
  readonly trigger: (name: IdentityName) => TriggerSettings;
}

/** What the composer store needs: the board store, which holds the identities and the commands a channel's box suggests, and makes the identities' changes on the server. */
export interface ComposerOptions {
  readonly boardStore: IdentityStore;
}

/**
 * Makes a composer store whose identities come from `options.boardStore`.
 * @param options The board store.
 * @returns The store.
 */
export function createComposer(options: ComposerOptions): Composer {
  const drafts = new Map<string, Draft>();
  const list = createIdentityList(options.boardStore);
  const deletion = createIdentityDeletion(options.boardStore);
  const readers = listenersOf(list.show);
  function registered(): readonly Command[] {
    const commands = commandList(options.boardStore.snapshot());
    if (commands.status !== "loaded") {
      return NO_COMMANDS;
    }
    return commands.commands;
  }
  list.onChange(readers.notify);
  return {
    ...profileStoresOf(list),
    channelDraft: (channel) =>
      storeIn(drafts, channel, () =>
        createDraft(list, { commands: registered, identities: list.identities, members: noMembers }),
      ),
    draft: (key, members = noMembers) =>
      storeIn(drafts, key, () =>
        createDraft(list, { commands: () => NO_COMMANDS, identities: list.identities, members }),
      ),
    identities: {
      ...createAdminChanges(list),
      ...ownerPowersOf(list),
      deletion,
      snapshot: list.identities,
      subscribe: readers.add,
    },
  };
}

export type { DisplayNameDraft } from "./lib/profile-stores.ts";
export { type TriggerSettings, type TriggerSnapshot, savedUrl } from "./lib/trigger-settings.ts";
export type { AgentCreation } from "./lib/agent-creation.ts";
export type { IdentityAction, IdentityActions, MessageCount } from "./lib/identity-actions.ts";
