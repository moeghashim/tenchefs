import { adminClient, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { inSidebar } from "./regions.ts";
import { openAt } from "./render.tsx";
import { watched } from "./watched.ts";

it("a display name set elsewhere for whoever is logged in shows in the settings footer with no reload", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const name = "web-logged-in-renamed";
  const human = await newIdentity({ kind: "human", name });
  const { live, stream } = watched(human.client);
  const close = openAt({ client: human.client, hash: "#/", live });
  await inSidebar().findByRole("link", { name: "Settings" });
  await stream;

  await adminClient().setDisplayName(name, "Renamed Elsewhere");

  await expect(inSidebar().findByText("Renamed Elsewhere")).resolves.toBeInstanceOf(HTMLElement);

  close();
});
