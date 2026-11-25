import type { Link, Live } from "../../live/index.ts";
import type { Part } from "./slice.ts";
import { createListeners } from "./listeners.ts";

type Followed = Pick<Part<unknown>, "apply" | "back">;

type FollowedLive = Live | null;

interface Following {
  readonly live: FollowedLive;
  readonly parts: readonly Followed[];
  readonly rereads: readonly (() => void)[];
}

function catchUpOf(following: Omit<Following, "live">): () => void {
  return () => {
    for (const part of following.parts) {
      part.back();
    }
    for (const reread of following.rereads) {
      reread();
    }
  };
}

function followerOf(following: Following): () => void {
  const { live, parts } = following;
  let followed = false;
  return () => {
    if (followed || live === null) {
      return;
    }
    followed = true;
    live.follow({
      back: catchUpOf(following),
      heard: (event) => {
        for (const part of parts) {
          part.apply(event);
        }
      },
    });
  };
}

const UP: Link = "up";

interface Linked {
  readonly link: () => Link;
  readonly subscribeToLink: (listener: () => void) => () => void;
}

function linkedTo(live: FollowedLive): Linked {
  if (live === null) {
    return { link: () => UP, subscribeToLink: createListeners().subscribe };
  }
  return { link: live.link, subscribeToLink: live.subscribeToLink };
}

export { type FollowedLive, type Linked, followerOf, linkedTo };
