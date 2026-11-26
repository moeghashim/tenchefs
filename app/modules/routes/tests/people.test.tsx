import { adminClient, agentShown, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { inPane, inProfile, inSidebar } from "./regions.ts";
import { profileOpened, viewOpened } from "./view-opened.ts";
import type { CookoutClient } from "../../sdk/index.ts";
import { testAgentDisplayName } from "../../testing/index.ts";

const DATE_LENGTH = 10;
const START = 0;
const CREW = 4;
const ONLY_IDENTITIES = ["listIdentities"] as const;

async function crewOf(prefix: string): Promise<CookoutClient> {
  const human = await newIdentity({ kind: "human", name: `${prefix}-human` });
  await newIdentity({ kind: "human", name: `${prefix}-boss` });
  await newIdentity({ kind: "agent", name: `${prefix}-bot`, owner: `${prefix}-human` });
  await newIdentity({ kind: "agent", name: `${prefix}-loner` });
  await adminClient().makeAdmin(`${prefix}-boss`);
  return human.client;
}

function identityList(): HTMLElement {
  return screen.getByRole("list", { name: "Identities" });
}

function rowTexts(): readonly string[] {
  const texts: string[] = [];
  for (const row of within(identityList()).queryAllByRole("link")) {
    texts.push(row.textContent);
  }
  return texts;
}

function filterBy(text: string): void {
  fireEvent.change(screen.getByRole("textbox", { name: "Filter by name" }), { target: { value: text } });
}

function kind(label: string): HTMLElement {
  return inPane().getByRole("radio", { name: (name) => name.startsWith(`${label} `) });
}

function kindText(label: string): string {
  const shown = kind(label).closest("label");
  if (shown === null) {
    return "";
  }
  return shown.textContent;
}

async function openFiltered(client: CookoutClient, hash: string, filter: string): Promise<() => void> {
  const { close } = await viewOpened({ client, hash, waitingOn: ["listIdentities"] });
  filterBy(filter);
  await waitFor(() => {
    expect(rowTexts()).toHaveLength(CREW);
  });
  return close;
}

async function profile(): Promise<HTMLElement> {
  const panel = await screen.findByRole("complementary", { name: "Profile" });
  return panel;
}

async function profileName(): Promise<string> {
  const heading = await inProfile().findByRole("heading", { level: 3 });
  return heading.textContent;
}

async function joinedOf(name: string): Promise<string> {
  const { identities } = await adminClient().listIdentities();
  for (const identity of identities) {
    if (identity.name === name) {
      return `joined ${identity.createdAt.slice(START, DATE_LENGTH)}`;
    }
  }
  return "never joined";
}

it("#/people lists every identity, with its kind, owner and tags, and you marked", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const human = await crewOf("web-people-list");
  const { close } = await viewOpened({ client: human, hash: "#/people", waitingOn: ["listIdentities"] });
  await within(await screen.findByRole("list", { name: "Identities" })).findAllByRole("link");
  const everyone = rowTexts().length;
  filterBy("web-people-list");

  await waitFor(() => {
    expect(rowTexts()).toHaveLength(CREW);
  });

  expect([
    screen.getByRole("heading", { level: 1 }).textContent,
    screen.getByText(/^\d+ identities$/u).textContent,
    rowTexts(),
    inSidebar().getByRole("link", { name: "People & agents" }).getAttribute("aria-current"),
  ]).toStrictEqual([
    "People & agents",
    `${String(everyone)} identities`,
    [
      "web-people-list-bossadminHuman",
      `${agentShown("web-people-list-bot")}agentAgent · owned by web-people-list-human`,
      "web-people-list-human(you)Human",
      `${agentShown("web-people-list-loner")}agentAgent · owned by admin`,
    ],
    "page",
  ]);

  close();
});

it("the kind filter narrows the list to humans or agents, and count what the name filter leaves", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const close = await openFiltered(await crewOf("web-people-chips"), "#/people", "web-people-chips");
  const counts = [kindText("All"), kindText("Humans"), kindText("Agents")];
  fireEvent.click(kind("Agents"));
  const agents = [...rowTexts(), kind("All").matches(":checked"), kind("Agents").matches(":checked")];
  fireEvent.click(kind("Humans"));
  const humans = rowTexts();
  filterBy("web-people-chips-nobody");

  expect([counts, agents, humans, screen.getByText("Nobody matches.").textContent]).toStrictEqual([
    ["All 4", "Humans 2", "Agents 2"],
    [
      `${agentShown("web-people-chips-bot")}agentAgent · owned by web-people-chips-human`,
      `${agentShown("web-people-chips-loner")}agentAgent · owned by admin`,
      false,
      true,
    ],
    ["web-people-chips-bossadminHuman", "web-people-chips-human(you)Human"],
    "Nobody matches.",
  ]);

  close();
});

it("following a row opens its profile beside the list, highlighted, and closing it goes back to #/people", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const close = await openFiltered(await crewOf("web-people-open"), "#/people", "web-people-open");
  const bot = new RegExp(testAgentDisplayName("web-people-open-bot"), "u");
  fireEvent.click(within(identityList()).getByRole("link", { name: bot }));
  const panel = await profile();
  const opened = [
    globalThis.location.hash,
    within(panel).getByRole("heading", { level: 3 }).textContent,
    within(panel).getByText(/^Agent · owned by/u).textContent,
    within(panel).getByText(/^joined/u).textContent,
    within(identityList())
      .getByRole("link", { name: new RegExp(testAgentDisplayName("web-people-open-bot"), "u") })
      .getAttribute("aria-current"),
  ];
  fireEvent.click(within(panel).getByRole("link", { name: "Close profile" }));
  await waitFor(() => {
    expect(screen.queryByRole("complementary", { name: "Profile" })).toBeNull();
  });

  expect([opened, globalThis.location.hash]).toStrictEqual([
    [
      "#/people/web-people-open-bot",
      `${agentShown("web-people-open-bot")}agent`,
      "Agent · owned by web-people-open-human",
      await joinedOf("web-people-open-bot"),
      "page",
    ],
    "#/people",
  ]);

  close();
});

it("a profile's address opens it, with the admin tag and display name, and an unknown name says so", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const human = await crewOf("web-people-link");
  await adminClient().setDisplayName("web-people-link-boss", "The Boss");
  const { close } = await profileOpened({ client: human, name: "web-people-link-boss", waitingOn: ONLY_IDENTITIES });
  const panel = await profile();
  const shown = [
    await profileName(),
    within(panel).getByText("The Boss").textContent,
    within(panel).getByText("Human").textContent,
  ];
  globalThis.location.hash = "#/people/web-people-link-nobody";
  const unknown = await inProfile().findByText("Unknown identity");

  expect([shown, unknown.textContent]).toStrictEqual([
    ["The Boss@web-people-link-bossadmin", "The Boss", "Human"],
    "Unknown identity",
  ]);

  close();
});

it("the sidebar's footer opens your own profile", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { answered, close } = await viewOpened({
    client: await crewOf("web-people-self"),
    hash: "#/",
    waitingOn: ["whoami"],
  });
  const nav = await screen.findByRole("navigation", { name: "Sidebar" });
  fireEvent.click(await within(nav).findByRole("link", { name: "web-people-self-human, Offline" }));
  await answered("listIdentities");
  const name = await inProfile().findByRole("heading", { level: 3 });

  expect([globalThis.location.hash, name.textContent]).toStrictEqual([
    "#/people/web-people-self-human",
    "web-people-self-human",
  ]);

  close();
});

it("a profile address with a name no identity could have says there is nothing here", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { close } = await viewOpened({ client: adminClient(), hash: "#/people/Not_A_Name", waitingOn: ["whoami"] });

  const heading = await screen.findByRole("heading", { level: 1, name: "Nothing here" });

  expect(heading.textContent).toBe("Nothing here");

  close();
});

it("a non-admin sees no admin button, and nor does an admin on an agent's profile", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const asHuman = await profileOpened({
    client: await crewOf("web-people-nobutton"),
    name: "web-people-nobutton-boss",
    waitingOn: ONLY_IDENTITIES,
  });
  await profileName();
  const humanButtons = within(await profile()).queryAllByRole("button");
  asHuman.close();
  const asAdmin = await profileOpened({ client: adminClient(), name: "web-people-nobutton-loner" });
  await profileName();

  expect([humanButtons, within(await profile()).queryAllByRole("button", { name: /admin/u })]).toStrictEqual([[], []]);

  asAdmin.close();
});
