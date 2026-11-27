import { AvatarPreview, Button, ButtonRow } from "../../design-system/controls.tsx";
import { useCallback, useContext } from "react";
import type { AvatarChoice } from "../../composer/index.ts";
import { LandingContext } from "../../landing/index.ts";
import type { ReactNode } from "react";

const PICKER = "[data-avatar-picker]";

const TEXT = { cancel: "Cancel", preview: "New avatar", save: "Save" } as const;

interface AvatarChosenProps {
  readonly agent: boolean;
  readonly choice: AvatarChoice;
  readonly preview: string;
  readonly saving: boolean;
}

export function AvatarChosen(props: AvatarChosenProps): ReactNode {
  const { choice } = props;
  const { watch } = useContext(LandingContext);
  const handleSave = useCallback(() => {
    watch(PICKER);
    choice.save();
  }, [choice, watch]);
  const handleCancel = useCallback(() => {
    watch(PICKER);
    choice.cancel();
  }, [choice, watch]);
  return (
    <>
      <AvatarPreview agent={props.agent} alt={TEXT.preview} src={props.preview} />
      <ButtonRow>
        <Button disabled={props.saving} onClick={handleSave}>
          {TEXT.save}
        </Button>
        <Button disabled={props.saving} onClick={handleCancel}>
          {TEXT.cancel}
        </Button>
      </ButtonRow>
    </>
  );
}
