import { expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { newIdentity } from "./identities.ts";
import { openAt } from "./render.tsx";

type Shown = readonly (readonly [string, boolean])[];

async function radiosIn(name: string): Promise<Shown> {
  const group = await screen.findByRole("radiogroup", { name });
  const shown: (readonly [string, boolean])[] = [];
  for (const radio of within(group).getAllByRole("radio")) {
    shown.push([radio.getAttribute("value") ?? "", radio.matches(":checked")]);
  }
  return shown;
}

it("the People kind filter and the Settings theme choice are radio groups, with the one chosen checked", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { client } = await newIdentity({ kind: "human", name: "web-choice-radios" });
  const closePeople = openAt({ client, hash: "#/people" });
  const kinds = await radiosIn("Kind");
  closePeople();
  const closeSettings = openAt({ client, hash: "#/settings/theme" });
  const themes = await radiosIn("Theme");
  closeSettings();

  expect([kinds, themes]).toStrictEqual([
    [
      ["all", true],
      ["human", false],
      ["agent", false],
    ],
    [
      ["system", true],
      ["light", false],
      ["dark", false],
    ],
  ]);
});
