import { createLayout, threadWidths } from "../../layout/index.ts";
import { expect, it, vi } from "vitest";
import { handFocus, handLive, recordPublishes } from "../../testing/web.ts";
import type { Layout } from "../../layout/index.ts";
import type { Search } from "../../search/web.ts";
import { createKeymap } from "../../keymap/index.ts";
import { createLive } from "../../live/index.ts";
import { createPageFocus } from "../../page-focus/index.ts";
import { createSearch } from "../../search/web.ts";

const NONE = 0;
const ONE = 1;
const NO_SUGGESTIONS = 0;

function memoryStorage(): Pick<Storage, "getItem" | "removeItem" | "setItem"> {
  const kept = new Map<string, string>();
  return {
    getItem: (key) => kept.get(key) ?? null,
    removeItem: (key) => {
      kept.delete(key);
    },
    setItem: (key, value) => {
      kept.set(key, value);
    },
  };
}

function layout(): Layout {
  return createLayout({
    root: { removeAttribute: vi.fn<() => void>(), setAttribute: vi.fn<() => void>() },
    storage: memoryStorage(),
  });
}

it("the layout publishes nothing for a choice it already holds", { timeout: 5000 }, () => {
  expect.hasAssertions();

  const store = layout();
  const { identityFilter, identityKind, theme } = store.snapshot();
  const publishes = recordPublishes(store);

  store.chooseTheme(theme);
  store.closeSidebar();
  store.filterIdentities(identityFilter);
  store.showKind(identityKind);
  store.resizeThread(threadWidths.start);

  expect(publishes.count()).toBe(NONE);
});

it("the keymap publishes nothing when the shortcut list is closed again or opened again", { timeout: 5000 }, () => {
  expect.hasAssertions();

  const keymap = createKeymap({ platform: "Linux" });
  const closed = recordPublishes(keymap);
  keymap.closeShortcutList();
  keymap.openShortcutList();
  const opened = recordPublishes(keymap);

  keymap.openShortcutList();

  expect([closed.count(), opened.count()]).toStrictEqual([ONE, NONE]);
});

function openedAndDismissed(): Search {
  const search = createSearch({ search: vi.fn<Parameters<typeof createSearch>[number]["search"]>() });
  search.open();
  search.dismissSuggestions();
  return search;
}

it("the search publishes nothing when it is closed again, opened again or its suggestions dismissed again", {
  timeout: 5000,
}, () => {
  expect.hasAssertions();

  const search = openedAndDismissed();
  const publishes = recordPublishes(search);

  search.open();
  search.dismissSuggestions();
  search.move("up");
  search.moveSuggestion("up", NO_SUGGESTIONS);
  search.sortBy(search.snapshot().sort);

  expect(publishes.count()).toBe(NONE);
});

it("the page's focus publishes nothing when the page is focused again", { timeout: 5000 }, () => {
  expect.hasAssertions();

  const hand = handFocus();
  const focus = createPageFocus(hand.adapter);
  const publishes = recordPublishes({ snapshot: focus.focused, subscribe: focus.subscribe });

  hand.focus();
  hand.show();

  expect(publishes.count()).toBe(NONE);
});

it("the live link publishes nothing when it is reported up while up", { timeout: 5000 }, () => {
  expect.hasAssertions();

  const hand = handLive();
  const live = createLive(hand.adapter);
  live.follow({ back: vi.fn<() => void>(), heard: vi.fn<() => void>() });
  const publishes = recordPublishes({ snapshot: live.link, subscribe: live.subscribeToLink });

  hand.report("up");

  expect(publishes.count()).toBe(NONE);
});
