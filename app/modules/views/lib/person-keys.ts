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
    attach: keymap.shortcutOf("attachFiles"),
    copyLink: keymap.shortcutOf("copyMessageLink"),
    copyText: keymap.shortcutOf("copyMessageText"),
    delete: keymap.shortcutOf("deleteMessage"),
    markUnread: keymap.shortcutOf("markUnread"),
    nextImage: keymap.shortcutOf("nextImage"),
    openThread: keymap.shortcutOf("openThread"),
    previousImage: keymap.shortcutOf("previousImage"),
    reply: keymap.shortcutOf("replyToMessage"),
    schedule: keymap.shortcutOf("scheduleMessage"),
    thread: keymap.shortcutOf("toggleThreadClosed"),
    thumbsDown: keymap.shortcutOf("toggleThumbsDown"),
    thumbsUp: keymap.shortcutOf("toggleThumbsUp"),
    unfold: keymap.shortcutOf("unfoldMessage"),
  };
}

export { messageShortcutsOf, personKeysOf };
