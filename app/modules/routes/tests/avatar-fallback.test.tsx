import type { AvatarImage, AvatarImageSource } from "../../design-system/content.tsx";
import { AvatarImages, Profile } from "../../design-system/content.tsx";
import { IdentityCard, IdentityCards } from "../../design-system/messages.tsx";
import type { IdentityCardParts, IdentityCardSource } from "../../design-system/messages.tsx";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { createElement } from "react";

const NAME = "ada-lovelace";
const IMAGE: AvatarImage = { alt: "Ada Lovelace", src: "/v1/avatars/ada-face" };

const CARD: IdentityCardParts = {
  agent: false,
  broughtInBy: null,
  deactivated: false,
  description: null,
  displayName: "Ada Lovelace",
  kind: "Human",
  name: NAME,
  presence: null,
  profileHref: `#/people/${NAME}`,
};

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const IMAGES: AvatarImageSource = { imageOf: () => IMAGE, subscribe };
const CARDS: IdentityCardSource = { cardOf: () => CARD, sessionOf: () => null, subscribe, subscribeSession: subscribe };

interface Face {
  readonly src: string | null;
  readonly initials: string | null;
}

function faceIn(region: () => HTMLElement): Face {
  const face = within(region()).getByTestId("avatar");
  return { initials: face.dataset["initials"] ?? null, src: face.getAttribute("src") };
}

it("an avatar shows its picture, named by the display name, and its initials once the picture fails to load", {
  timeout: 2000,
}, () => {
  expect.hasAssertions();

  const { container, unmount } = render(
    <AvatarImages value={IMAGES}>
      <Profile agent={false} name={NAME} presence={null}>
        {NAME}
      </Profile>
    </AvatarImages>,
  );
  const before = faceIn(() => container);
  fireEvent.error(within(container).getByRole("img", { name: "Ada Lovelace" }));

  expect([before, faceIn(() => container)]).toStrictEqual([
    { initials: null, src: IMAGE.src },
    { initials: "AL", src: null },
  ]);

  unmount();
});

it("an identity card's tile shows the identity's picture, and its initials once the picture fails to load", {
  timeout: 2000,
}, async () => {
  expect.hasAssertions();

  const trigger = (
    <IdentityCards value={CARDS}>
      <IdentityCard name={NAME}>
        <a href={`#/people/${NAME}`}>{NAME}</a>
      </IdentityCard>
    </IdentityCards>
  );
  const { container, unmount } = render(createElement(AvatarImages, { value: IMAGES }, trigger));
  act(() => {
    within(container).getByRole("link", { name: NAME }).focus();
  });
  const card = await screen.findByRole("dialog", { name: "Ada Lovelace" });
  const before = faceIn(() => card);
  fireEvent.error(within(card).getByRole("img", { name: "Ada Lovelace" }));

  expect([before, faceIn(() => card)]).toStrictEqual([
    { initials: null, src: IMAGE.src },
    { initials: "AL", src: null },
  ]);

  unmount();
});
