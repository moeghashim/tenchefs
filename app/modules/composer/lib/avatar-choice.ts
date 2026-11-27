import type { IdentityName, Refusal } from "../../sdk/index.ts";
import { avatarLimits } from "../../avatars/index.ts";
import { listenersOf } from "./listeners.ts";
import { refusalOf } from "../../sdk/index.ts";

const BYTES_IN_A_MEGABYTE = 1_000_000;
const megabytes = `${String(avatarLimits.maximumBytes / BYTES_IN_A_MEGABYTE)} MB`;

const TEXT = {
  notAnImage: "That file isn't an image: pick a PNG, JPEG, GIF or WebP.",
  tooLarge: `That image is over ${megabytes}: pick one of at most ${megabytes}.`,
} as const;

type AvatarCrop = (file: Blob) => Promise<Uint8Array | null>;

interface Chosen {
  readonly png: Uint8Array;
  readonly preview: string;
}

type AvatarChoiceSnapshot =
  | { readonly status: "empty" }
  | { readonly status: "refused"; readonly message: string }
  | (Chosen & { readonly status: "chosen" })
  | (Chosen & { readonly status: "saving" })
  | (Chosen & Refusal & { readonly status: "failed" });

interface AvatarChoice {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => AvatarChoiceSnapshot;
  readonly choose: (file: Blob) => void;
  readonly save: () => void;
  readonly cancel: () => void;
}

interface AvatarChoiceOptions {
  readonly crop: AvatarCrop;
  readonly name: IdentityName;
  readonly set: (name: IdentityName, png: Uint8Array) => Promise<void>;
  readonly show: () => () => void;
}

function previewOf(png: Uint8Array): string {
  let binary = "";
  for (const byte of png) {
    binary += String.fromCodePoint(byte);
  }
  return `data:image/png;base64,${btoa(binary)}`;
}

function chosenOf(snapshot: AvatarChoiceSnapshot): Chosen | null {
  if (snapshot.status === "chosen" || snapshot.status === "failed") {
    return { png: snapshot.png, preview: snapshot.preview };
  }
  return null;
}

interface Steps {
  readonly options: AvatarChoiceOptions;
  readonly publish: (next: AvatarChoiceSnapshot) => void;
}

async function cropped({ options, publish }: Steps, file: Blob): Promise<void> {
  if (file.size > avatarLimits.maximumBytes) {
    publish({ message: TEXT.tooLarge, status: "refused" });
    return;
  }
  const png = await options.crop(file);
  if (png === null) {
    publish({ message: TEXT.notAnImage, status: "refused" });
    return;
  }
  publish({ png, preview: previewOf(png), status: "chosen" });
}

async function sent({ options, publish }: Steps, chosen: Chosen): Promise<void> {
  try {
    await options.set(options.name, chosen.png);
    publish({ status: "empty" });
  } catch (error: unknown) {
    publish({ ...chosen, ...refusalOf(error), status: "failed" });
  }
}

function createAvatarChoice(options: AvatarChoiceOptions): AvatarChoice {
  const listeners = listenersOf(options.show);
  let current: AvatarChoiceSnapshot = { status: "empty" };
  let queue = Promise.resolve();
  const steps: Steps = {
    options,
    publish: (next) => {
      current = next;
      listeners.notify();
    },
  };

  async function cropAfter(previous: Promise<void>, file: Blob): Promise<void> {
    await previous;
    await cropped(steps, file);
  }

  async function sendAfter(previous: Promise<void>, chosen: Chosen): Promise<void> {
    await previous;
    await sent(steps, chosen);
  }

  return {
    cancel: () => {
      steps.publish({ status: "empty" });
    },
    choose: (file) => {
      queue = cropAfter(queue, file);
    },
    save: () => {
      const chosen = chosenOf(current);
      if (chosen !== null) {
        steps.publish({ ...chosen, status: "saving" });
        queue = sendAfter(queue, chosen);
      }
    },
    snapshot: () => current,
    subscribe: listeners.add,
  };
}

export { type AvatarChoice, type AvatarCrop, createAvatarChoice };
