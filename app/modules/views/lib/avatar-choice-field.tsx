import { Alert } from "../../design-system/content.tsx";
import type { AvatarChoice } from "../../composer/index.ts";
import { AvatarChosen } from "./avatar-chosen.tsx";
import { AvatarField } from "../../design-system/controls.tsx";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

const ACCEPTED = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;

const TEXT = { avatar: "Avatar", pick: "Set avatar" } as const;

interface AvatarChoiceFieldProps {
  readonly agent: boolean;
  readonly choice: AvatarChoice;
}

export function AvatarChoiceField(props: AvatarChoiceFieldProps): ReactNode {
  const { choice } = props;
  const state = useSyncExternalStore(choice.subscribe, choice.snapshot);
  const handleFile = choice.choose;
  return (
    <AvatarField accept={ACCEPTED} label={TEXT.avatar} onFile={handleFile} pick={TEXT.pick}>
      {state.status !== "empty" && state.status !== "refused" && (
        <AvatarChosen agent={props.agent} choice={choice} preview={state.preview} saving={state.status === "saving"} />
      )}
      {state.status === "refused" && <Alert>{state.message}</Alert>}
      {state.status === "failed" && <Alert>{`Couldn't set the avatar (${state.code}): ${state.message}`}</Alert>}
    </AvatarField>
  );
}
