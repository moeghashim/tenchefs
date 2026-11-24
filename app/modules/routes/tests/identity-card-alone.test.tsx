import { act, render, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { IdentityCard } from "../../design-system/index.tsx";

const NAME = "ada";

it("a name drawn where no identity cards are provided opens no card when focused", { timeout: 2000 }, () => {
  expect.hasAssertions();

  const { container, unmount } = render(
    <IdentityCard name={NAME}>
      <a href={`#/people/${NAME}`}>{NAME}</a>
    </IdentityCard>,
  );
  act(() => {
    within(container).getByRole("link", { name: NAME }).focus();
  });

  expect([document.activeElement, document.querySelector('[role="tooltip"]')]).toStrictEqual([
    within(container).getByRole("link", { name: NAME }),
    null,
  ]);

  unmount();
});
