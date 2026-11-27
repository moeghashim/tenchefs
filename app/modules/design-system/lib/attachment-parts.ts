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

interface ThumbnailParts extends ImageParts {
  readonly at: number;
}

interface ImageCarouselParts {
  readonly images: readonly ImageThumbnailParts[];
  readonly children: ReactNode;
}

interface ImageSteps {
  readonly at: number;
  readonly count: number;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
}

interface ImageStageParts extends ImageSteps {
  readonly image: ImageThumbnailParts;
}

interface ShownImageParts extends ImageStageParts {
  readonly onClosed: (event: Readonly<Event>) => void;
}

interface FileChipParts {
  readonly name: string;
  readonly detail: string;
  readonly href: string | null;
}

export type {
  AttachmentImageParts,
  AttachmentListParts,
  FileChipParts,
  ImageBox,
  ImageCarouselParts,
  ImageParts,
  ImageStageParts,
  ImageSteps,
  ImageThumbnailParts,
  ShownImageParts,
  ThumbnailParts,
};
