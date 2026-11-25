import { adminClient, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { inPane } from "./regions.ts";
import { openAt } from "./render.tsx";

const ONE_ROW = 1;

function chipText(label: string): string {
  const shown = inPane()
    .getByRole("radio", { name: (name) => name.startsWith(`${label} `) })
    .closest("label");
  if (shown === null) {
    return "";
  }
  return shown.textContent;
}

async function filteredTo(text: string): Promise<readonly string[]> {
  fireEvent.change(screen.getByRole("textbox", { name: "Filter by name" }), { target: { value: text } });
  const rows = await waitFor(() => {
    const links = within(screen.getByRole("list", { name: "Identities" })).getAllByRole("link");

    expect(links).toHaveLength(ONE_ROW);

    return links;
  });
  const texts: string[] = [];
  for (const row of rows) {
    texts.push(row.textContent);
  }
  return [...texts, chipText("All"), chipText("Humans"), chipText("Agents")];
}

it("the name filter matches part of a display name in any case, or of owner/name, and the kind filter counts it", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const human = await newIdentity({ kind: "human", name: "web-people-filter-human" });
  await newIdentity({ kind: "human", name: "web-people-filter-boss" });
  await adminClient().setDisplayName("web-people-filter-boss", "Ada Web-People-Filter Lovelace");
  await newIdentity({ kind: "agent", name: "web-people-filter-human/scout", owner: "web-people-filter-human" });
  const close = openAt({ client: human.client, hash: "#/people" });
  await screen.findByRole("list", { name: "Identities" });

  expect([await filteredTo("ada web-PEOPLE-filter"), await filteredTo("Filter-Human/Sc")]).toStrictEqual([
    [expect.stringContaining("web-people-filter-boss"), "All 1", "Humans 1", "Agents 0"],
    [expect.stringContaining("web-people-filter-human/scout"), "All 1", "Humans 0", "Agents 1"],
  ]);

  close();
});
