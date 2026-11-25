import { expect, it, onTestFinished, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { inSidebar, inTopBar } from "./regions.ts";
import { adminClient } from "./identities.ts";
import { openAt } from "./render.tsx";

function narrowWindow(): void {
  vi.stubGlobal("matchMedia", () => ({
    addEventListener: vi.fn<() => void>(),
    matches: false,
    removeEventListener: vi.fn<() => void>(),
  }));
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });
}

function followed(name: string): void {
  const link = inSidebar().getByRole("link", { name });
  link.focus();
  fireEvent.click(link);
  globalThis.location.hash = "#/people";
}

it("on a narrow screen, following a sidebar link lands focus on the new view's heading", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  narrowWindow();
  const close = openAt({ client: adminClient(), hash: "#/" });
  fireEvent.click(await inTopBar().findByRole("button", { name: "Open the sidebar" }));
  followed("People & agents");

  const heading = await screen.findByRole("heading", { level: 1, name: "People & agents" });

  await vi.waitFor(() => {
    expect(globalThis.document.activeElement).toBe(heading);
  });

  close();
});
