import type { ReactNode } from "react";

interface ImageBox {
  readonly width: number;
  readonly height: number;
}

interface AttachmentListParts {
  readonly label: string;
  readonly children: ReactNode;
}

interface ImageParts {
  readonly name: string;
  readonly src: string;
  readonly size: ImageBox | null;
}

interface AttachmentImageParts extends ImageParts {
  readonly small: boolean;
}

interface ImageThumbnailParts extends ImageParts {
  readonly detail: string;
}

interface FileChipParts {
  readonly name: string;
  readonly detail: string;
  readonly href: string | null;
}

export type { AttachmentImageParts, AttachmentListParts, FileChipParts, ImageBox, ImageParts, ImageThumbnailParts };
