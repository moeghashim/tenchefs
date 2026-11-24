import { IdentityCard, IdentityCards } from "../../design-system/index.tsx";
import type { IdentityCardParts, IdentityCardSource } from "../../design-system/index.tsx";
import { act, render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";

const NAME = "ada";

const CARD: IdentityCardParts = {
  agent: false,
  broughtInBy: null,
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

it("a card for an identity with no presence, drawn where no composer is provided, shows its avatar tile with no presence dot or words, and Message disabled", {
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
  const card = await screen.findByRole("dialog", { name: NAME });
  const lines: string[] = [];
  for (const line of card.querySelectorAll("p")) {
    lines.push(line.textContent);
  }

  expect([
    within(card).getByTestId("avatar").dataset["initials"],
    card.querySelector("[data-presence]"),
    lines,
    within(card).getByRole("button", { name: "Message" }).hasAttribute("disabled"),
  ]).toStrictEqual(["A", null, [NAME, "Human"], true]);

  unmount();
});
