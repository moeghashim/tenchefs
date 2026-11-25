import { Suggestions, TextArea } from "../../design-system/controls.tsx";
import { useId, useSyncExternalStore } from "react";
import type { Draft } from "../../composer/index.ts";
import type { ReactNode } from "react";
import { useSuggestions } from "./use-suggestions.ts";

const NONE = 0;

interface DraftTextProps {
  readonly draft: Draft;
  readonly label: string;
  readonly focused: boolean;
  readonly required: boolean;
}

export function DraftText(props: DraftTextProps): ReactNode {
  const { draft } = props;
  const { chooseHighlighted: handlePick, dismiss: handleClose, edit: handleEdit, highlight: handleMove } = draft;
  const handleFiles = draft.attachments.attach;
  const written = useSyncExternalStore(draft.subscribe, draft.snapshot);
  const shown = useSuggestions({ commands: written.commands, draft, suggestions: written.suggestions });
  const choosing = shown.options.length > NONE;
  const handleChoose = shown.onChoose;
  const list = useId();
  return (
    <>
      <TextArea
        caret={written.caret}
        choosing={choosing}
        focusRequests={written.focusRequests}
        focused={props.focused}
        highlighted={written.highlighted}
        label={props.label}
        list={list}
        name="text"
        onClose={handleClose}
        onEdit={handleEdit}
        onMove={handleMove}
        onPasteFiles={handleFiles}
        onPick={handlePick}
        required={props.required}
        value={written.text}
      />
      {choosing && (
        <Suggestions
          highlighted={written.highlighted}
          label={shown.label}
          list={list}
          onChoose={handleChoose}
          options={shown.options}
        />
      )}
    </>
  );
}
