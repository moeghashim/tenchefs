import type { Act, Keymap } from "../../keymap/index.ts";
import type { MessageShortcuts, PersonKeysSource } from "../../design-system/messages.tsx";

function messagePersonOf(message: Act | null): { readonly messagePerson?: Act } {
  if (message === null) {
    return {};
  }
  return { messagePerson: message };
}

function personKeysOf(keymap: Keymap): PersonKeysSource {
  return {
    announce: keymap.announce,
    bind: ({ acts, within }) =>
      keymap.bind({
        actions: { copyName: acts.copyName, viewProfile: acts.viewProfile, ...messagePersonOf(acts.message) },
        scope: "person",
        within,
      }),
    shortcuts: {
      copyName: keymap.shortcutOf("copyName"),
      message: keymap.shortcutOf("messagePerson"),
      viewProfile: keymap.shortcutOf("viewProfile"),
    },
  };
}

function messageShortcutsOf(keymap: Keymap): MessageShortcuts {
  return {
    copyLink: keymap.shortcutOf("copyMessageLink"),
    delete: keymap.shortcutOf("deleteMessage"),
    markUnread: keymap.shortcutOf("markUnread"),
    openThread: keymap.shortcutOf("openThread"),
    reply: keymap.shortcutOf("replyToMessage"),
    thread: keymap.shortcutOf("toggleThreadClosed"),
    unfold: keymap.shortcutOf("unfoldMessage"),
  };
}

export { messageShortcutsOf, personKeysOf };
