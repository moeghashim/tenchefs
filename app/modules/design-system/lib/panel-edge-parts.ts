type EdgeSide = "left" | "right";

interface PanelEdgeParts {
  readonly label: string;
  readonly side: EdgeSide;
  readonly width: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly onResize: (width: number) => void;
  readonly onClose: (() => void) | null;
}

export type { PanelEdgeParts };
