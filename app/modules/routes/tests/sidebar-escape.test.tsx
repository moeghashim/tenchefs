import { expect, it, onTestFinished, vi } from "vitest";
import { adminClient } from "./identities.ts";
import { fireEvent } from "@testing-library/react";
import { inTopBar } from "./regions.ts";
import { openAt } from "./render.tsx";

function windowOf(narrow: boolean): void {
  vi.stubGlobal("matchMedia", () => ({
    addEventListener: vi.fn<() => void>(),
    matches: !narrow,
    removeEventListener: vi.fn<() => void>(),
  }));
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });
}

async function openedThenEscaped(): Promise<HTMLElement> {
  fireEvent.click(await inTopBar().findByRole("button", { name: "Open the sidebar" }));
  const button = inTopBar().getByRole("button", { name: "Close the sidebar" });
  button.focus();
  fireEvent.keyDown(button, { key: "Escape" });
  return button;
}

it("on a narrow screen, Escape closes the open sidebar and focuses the button that opens it", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  windowOf(true);
  const close = openAt({ client: adminClient(), hash: "#/" });
  const button = await openedThenEscaped();

  expect([button.getAttribute("aria-label"), globalThis.document.activeElement]).toStrictEqual([
    "Open the sidebar",
    button,
  ]);

  close();
});

it("on a wide screen, Escape leaves the sidebar's open state alone", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  windowOf(false);
  const close = openAt({ client: adminClient(), hash: "#/" });
  const button = await openedThenEscaped();

  expect(button.getAttribute("aria-label")).toBe("Close the sidebar");

  close();
});
