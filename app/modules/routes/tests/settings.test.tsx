import { expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { inSettings, inSidebar } from "./regions.ts";
import { adminClient } from "./identities.ts";
import { openAt } from "./render.tsx";

async function openSettings(): Promise<void> {
  fireEvent.click(await inSidebar().findByRole("link", { name: "Settings" }));
  await inSettings().findByRole("heading", { level: 2, name: "Theme" });
}

function chosenTheme(): readonly string[] {
  return ["System", "Light", "Dark"].filter((name) => screen.queryByRole("radio", { checked: true, name }) !== null);
}

function themeSet(): string | null {
  return globalThis.document.documentElement.dataset["theme"] ?? null;
}

function sectionHeadings(): readonly string[] {
  const headings: string[] = [];
  for (const heading of inSettings().getAllByRole("heading", { level: 2 })) {
    headings.push(heading.textContent);
  }
  return headings;
}

async function chooseLightThenLeave(): Promise<readonly [readonly string[], string | null]> {
  const close = openAt({ client: adminClient(), hash: "#/" });
  await openSettings();
  const before = chosenTheme();
  fireEvent.click(screen.getByRole("radio", { name: "Light" }));
  const applied = themeSet();
  close();
  return [before, applied];
}

it("the sidebar's Settings link opens the settings page, with a heading for each section", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const close = openAt({ client: adminClient(), hash: "#/" });
  await openSettings();

  expect([
    globalThis.location.hash,
    inSidebar().getByRole("link", { name: "Settings" }).getAttribute("aria-current"),
    screen.getByRole("heading", { level: 1, name: "Settings" }).textContent,
    sectionHeadings(),
    inSidebar().queryByRole("button", { name: "Settings" }),
  ]).toStrictEqual(["#/settings", "page", "Settings", ["Profile", "Theme", "My agents", "Session"], null]);

  close();
});

it("a link to one section of the settings page takes the focus to that section's heading", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const close = openAt({ client: adminClient(), hash: "#/settings/agents" });
  const heading = await inSettings().findByRole("heading", { level: 2, name: "My agents" });
  await waitFor(() => {
    expect(globalThis.document.activeElement).toBe(heading);
  });
  globalThis.location.hash = "#/settings/theme";
  const theme = await inSettings().findByRole("heading", { level: 2, name: "Theme" });

  await waitFor(() => {
    expect(globalThis.document.activeElement).toBe(theme);
  });

  close();
});

it("a link to a section the settings page doesn't have is no page", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = openAt({ client: adminClient(), hash: "#/settings/nothing" });

  const missing = await screen.findByText("No page has this address.");

  expect(missing.textContent).toBe("No page has this address.");

  close();
});

it("the settings page's theme switch applies the theme at once and remembers it for the next visit", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const [before, applied] = await chooseLightThenLeave();
  const close = openAt({ client: adminClient(), hash: "#/" });
  await openSettings();

  expect([before, applied, chosenTheme(), themeSet()]).toStrictEqual([["System"], "light", ["Light"], "light"]);

  close();
});

it("choosing System leaves the theme to the operating system's setting", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = openAt({ client: adminClient(), hash: "#/" });
  await openSettings();
  fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
  const dark = themeSet();
  fireEvent.click(screen.getByRole("radio", { name: "System" }));

  expect([dark, themeSet(), chosenTheme()]).toStrictEqual(["dark", null, ["System"]]);

  close();
});
