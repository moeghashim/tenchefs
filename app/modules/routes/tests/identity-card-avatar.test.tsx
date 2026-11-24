import { IdentityCard, IdentityCards } from "../../design-system/index.tsx";
import type { IdentityCardParts, IdentityCardSource } from "../../design-system/index.tsx";
import { act, render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";

const NAME = "ada";

const CARD: IdentityCardParts = {
  agent: false,
  deactivated: false,
  description: null,
  displayName: null,
  kind: "Human",
  name: NAME,
  presence: null,
  profileHref: `#/people/${NAME}`,
};

function sourceOf(card: IdentityCardParts): IdentityCardSource {
  const listeners = new Set<() => void>();
  return {
    cardOf: () => card,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

it("a card for an identity with no presence shows its avatar with no presence dot and no presence words", {
  timeout: 2000,
}, async () => {
  expect.hasAssertions();

  const { container, unmount } = render(
    <IdentityCards value={sourceOf(CARD)}>
      <IdentityCard name={NAME}>
        <a href={`#/people/${NAME}`}>{NAME}</a>
      </IdentityCard>
    </IdentityCards>,
  );
  act(() => {
    within(container).getByRole("link", { name: NAME }).focus();
  });
  const card = await screen.findByRole("tooltip");
  const lines: string[] = [];
  for (const line of card.querySelectorAll("p")) {
    lines.push(line.textContent);
  }

  expect([
    within(card).getByTestId("avatar").dataset["initials"],
    card.querySelector("[data-presence]"),
    lines,
  ]).toStrictEqual(["A", null, [NAME, "Human"]]);

  unmount();
});
