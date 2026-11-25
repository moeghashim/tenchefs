import type { Locator, Page } from "@playwright/test";

const SPECIAL = /[$()*+.?[\\\]^{|}]/gu;

interface Labelled {
  readonly page: Page;
  readonly label: string;
}

interface Saying {
  readonly page: Page;
  readonly start: string;
}

export function inSidebar(page: Page): Locator {
  return page.getByRole("navigation", { exact: true, name: "Sidebar" });
}

export function sidebarLink({ label, page }: Labelled): Locator {
  return inSidebar(page)
    .getByRole("link")
    .filter({ has: page.getByText(label, { exact: true }) });
}

export function inPane(page: Page): Locator {
  return page.getByRole("main");
}

export function inThread(page: Page): Locator {
  return page.getByRole("complementary", { exact: true, name: "Thread" });
}

export function inConversation(page: Page): Locator {
  return page.getByRole("complementary", { exact: true, name: "Conversation" });
}

export function inProfile(page: Page): Locator {
  return page.getByRole("complementary", { exact: true, name: "Profile" });
}

export function inTopBar(page: Page): Locator {
  return page.getByRole("banner", { exact: true, name: "Top bar" });
}

export function inDialog(page: Page): Locator {
  return page.getByRole("alertdialog");
}

export function alertSaying({ page, start }: Saying): Locator {
  return page.getByRole("alert").filter({ hasText: new RegExp(`^${start.replaceAll(SPECIAL, String.raw`\$&`)}`, "u") });
}
