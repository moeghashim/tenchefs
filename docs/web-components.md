# Web components

The shape a React component takes to pass the UI lint rules on its first commit. Writing it this way from the start is cheap; #97 rewrote about 25 files to fit it after the fact.

## One component, shown

`SidebarView` in [sidebar.tsx](../app/modules/views/lib/sidebar.tsx), trimmed:

```tsx
interface SidebarProps {
  readonly identity: Identity;
  readonly layout: Layout;
  readonly route: Route;
}

export function SidebarView(props: SidebarProps): ReactNode {
  const { layout } = props;
  const state = useSyncExternalStore(layout.subscribe, layout.snapshot);
  const handleFollow = layout.closeSidebar;
  const handleToggleCollapsed = layout.toggleCollapsed;
  return (
    <Sidebar collapsed={state.collapsed} label={TEXT.sidebar} onToggleCollapsed={handleToggleCollapsed}>
      <SidebarBody onFollow={handleFollow}>
        <SidebarLinks route={props.route} />
      </SidebarBody>
      <SidebarFooter>
        <SidebarSettings identity={props.identity} route={props.route} />
      </SidebarFooter>
    </Sidebar>
  );
}
```

What each rule asks, and how this meets it:

- `no-multi-comp`: one component per file. A second component, even a small row, gets its own file in the module's lib folder.
- `jsx-max-depth`: keep the returned tree shallow. When nesting grows, the inner part becomes its own component (and so its own file); design-system parts such as `Sidebar` and `SidebarFooter` carry the markup.
- `jsx-no-jsx-as-prop`: pass JSX as `children`, never as another prop.
- `no-ternary`: show or hide with `&&`; pick between values in a small function with `if` and early returns.
- `jsx-handler-names`: a function passed to an `on…` prop is named `handle…` (`handleFollow`, `handleToggleCollapsed`); one made in the component is wrapped in `useCallback`, as `handleChoose` is in [theme-choice.tsx](../app/modules/views/lib/theme-choice.tsx).
- `prefer-readonly-parameter-types`: every props field is `readonly`, and arrays are `readonly T[]`.
- `max-dependencies`: a file imports only what it draws with; split the component before its import list grows long.

## State comes from a store

A view holds no state that outlives it. State lives in a store, a plain `.ts` module with no React, that exposes `subscribe` and `snapshot`, and methods that change the state and notify subscribers. There are two kinds.

- **Server state** (channels, messages, threads, identities, the inbox, the live link) lives in one store, the board store in [board/index.ts](../app/modules/board/index.ts). It is the web's one SDK caller and the one follower of the live stream; the board-store-owner lint rule ([lint/rules/board-store-owner.js](../lint/rules/board-store-owner.js)) fails any other web module that imports the SDK client or the `live` module. `Authors` gives the board store to every view through context. A view reads it through a selector, a pure function of the board store's snapshot such as `channelPage(name)` or `threadOf(place)`, using the hooks in [views/lib/use-board.ts](../app/modules/views/lib/use-board.ts) (`useChannelPage`, `useShownThread`, `useChannels` and the rest). Each hook subscribes with `subscribeShowing`, so the store loads what is on screen. A view changes server state by calling the board store's methods, such as `store.calls.close(id)` or `store.channelPages.post(channel, request)`.
- **Page-only state** (the layout, drafts, reading, page focus, a form's progress) lives in its own store, such as `createLayout` in [layout/index.ts](../app/modules/layout/index.ts). [web.tsx](../app/web.tsx) makes each store once and passes it down through `CookoutApp`'s props. A view reads it with `useSyncExternalStore(store.subscribe, store.snapshot)` and calls its methods from handlers. A page-only store that changes the server, such as the new-channel form, takes the board store's method for that call; it doesn't make a client of its own.
- **Focus** after a change. A move to another view lands focus through `app/modules/landing` ([landing/index.ts](../app/modules/landing/index.ts)). A control that goes away when pressed, such as an attachment's Remove or a dialog's Cancel, calls `watch(target)` from `LandingContext` so focus lands on a named element instead of the page.

Tests in `app/modules/routes/tests/` draw `CookoutApp` on real stores against a real server and check what a person sees.

## A menu choice has a key

Every menu choice (`MenuChoice` in [menu-parts.ts](../app/modules/design-system/lib/menu-parts.ts)) requires `keys`, a `Shortcut`, so a choice written without one is a type error and fails `pnpm check` ([ADR 0143](adr/0143-every-menu-choice-has-a-key.md)). To add one:

1. Add the action's row to `KEYS` in [keys.ts](../app/modules/keymap/lib/keys.ts): its chord, what it does and the scope it works in. A new key is Proposed until Matt approves it.
2. Give the choice `keys: keymap.shortcutOf("<action>")`, or the matching `MessageKeys` shortcut inside a message, never a string written by hand.
3. Bind the action in the view that owns the scope, so the key does what the choice does. The design system offers a menu's choices to `MessageActions` against the element they act on (a message's `article`, a panel's title, a message box's form), and the bound action runs the choice the registry holds for its keys there, so no hidden control is needed.

## Check it

Commit after each component: the pre-commit hook prints what is left to fix while the component is small. Then `pnpm screenshots` takes the standard screens in both themes ([verification.md](verification.md#see-the-web-ui-in-both-themes)).
