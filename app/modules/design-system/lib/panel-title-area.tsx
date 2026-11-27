import type { PanelTitleField, PanelTitling } from "./panel-titling-parts.ts";
import type { ActionMenuParts } from "./menu-parts.ts";
import { PanelTitle } from "./panel-title.tsx";
import { PanelTitleEditButton } from "./panel-title-edit-button.tsx";
import { PanelTitleForm } from "./panel-title-form.tsx";
import type { ReactNode } from "react";

interface PanelTitleAreaParts {
  readonly label: string;
  readonly detail: string;
  readonly title: string | null;
  readonly menu: ActionMenuParts | null;
  readonly titling?: PanelTitling | null | undefined;
}

function fieldOf(titling: PanelTitling | null): PanelTitleField | null {
  if (titling === null) {
    return null;
  }
  return titling.field;
}

export function PanelTitleArea(parts: PanelTitleAreaParts): ReactNode {
  const titling = parts.titling ?? null;
  const field = fieldOf(titling);
  if (field !== null) {
    return <PanelTitleForm field={field} />;
  }
  return (
    <>
      <PanelTitle detail={parts.detail} label={parts.label} menu={parts.menu} title={parts.title} />
      {titling !== null && <PanelTitleEditButton edit={titling.edit} />}
    </>
  );
}
