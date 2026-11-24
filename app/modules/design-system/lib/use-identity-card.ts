import { useCallback, useContext, useId, useMemo, useState } from "react";
import type { CardFocus } from "./card-focus.ts";
import { IdentityCardComposer } from "./identity-card-parts.ts";
import type { IdentityCardControl } from "./identity-card-parts.ts";
import type { KeyboardEvent } from "react";
import { createCardFocus } from "./card-focus.ts";

const TAB = "Tab";

interface IdentityCardState {
  readonly open: boolean;
  readonly mark: string;
  readonly onOpenChange: (open: boolean) => void;
  readonly onTriggerBlur: () => void;
  readonly onTriggerKeyDown: (event: KeyboardEvent) => void;
  readonly control: IdentityCardControl;
}

interface Shown {
  readonly name: string;
  readonly deactivated: boolean;
}

interface Controlled {
  readonly shown: Shown;
  readonly focus: CardFocus;
  readonly compose: ((name: string) => void) | null;
  readonly setOpen: (open: boolean) => void;
}

function controlOf({ compose, focus, setOpen, shown }: Controlled): IdentityCardControl {
  function backToName(): void {
    focus.backToName();
    setOpen(false);
  }
  function close(): void {
    setOpen(false);
  }
  return {
    canMessage: compose !== null && !shown.deactivated,
    mark: focus.mark,
    onClose: close,
    onEscape: () => {
      if (focus.holdsFocus()) {
        backToName();
      }
    },
    onMessage: () => {
      if (compose !== null && !shown.deactivated) {
        close();
        compose(shown.name);
      }
    },
    onStopKeyDown: (event) => {
      if (event.key === TAB && focus.atEdge(event.shiftKey)) {
        event.preventDefault();
        backToName();
      }
    },
  };
}

function useIdentityCard(shown: Shown): IdentityCardState {
  const mark = useId();
  const focus = useMemo(() => createCardFocus(mark), [mark]);
  const [open, setOpen] = useState(false);
  const compose = useContext(IdentityCardComposer);
  const onOpenChange = useCallback(
    (next: boolean) => {
      if (focus.allows(next)) {
        setOpen(next);
      }
    },
    [focus],
  );
  const onTriggerKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === TAB && !event.shiftKey && open) {
        event.preventDefault();
        focus.enter();
      }
    },
    [focus, open],
  );
  const control = useMemo(() => controlOf({ compose, focus, setOpen, shown }), [compose, focus, shown]);
  return { control, mark, onOpenChange, onTriggerBlur: focus.blurred, onTriggerKeyDown, open };
}

export { useIdentityCard };
