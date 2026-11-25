import { exactLocators as rule } from "../rules/exact-locators.js";
import { ruleTester } from "./rule-tester.js";

const inexact = [{ messageId: "inexact" }];
const pattern = [{ messageId: "pattern" }];

ruleTester.run("exact-locators", rule, {
  invalid: [
    { code: 'page.getByRole("button", { name: "Send" });', errors: inexact },
    { code: 'page.getByRole("button", { exact: false, name: "Send" });', errors: inexact },
    { code: "page.getByRole('group', { name: `Messages` });", errors: inexact },
    { code: "page.getByRole('button', { name: label });", errors: inexact },
    { code: 'page.getByRole("button", { name: /send/iu });', errors: pattern },
    { code: 'page.getByRole("button", { exact: true, name: new RegExp("send", "u") });', errors: pattern },
    { code: 'page.getByText("Hello");', errors: inexact },
    { code: 'page.getByText("Hello", { exact: false });', errors: inexact },
    { code: "pane.getByText(body);", errors: inexact },
    { code: "page.getByText(/hello/u);", errors: pattern },
    { code: 'page.getByLabel("Token");', errors: inexact },
    { code: "page.getByLabel(/token/u, { exact: true });", errors: pattern },
    { code: 'page["getByText"]("Hello");', errors: inexact },
    { code: 'const BOX = { name: "Search" } as const;\npage.getByRole("combobox", BOX);', errors: inexact },
    { code: 'const HELLO = { exact: false };\npage.getByText("Hello", HELLO);', errors: inexact },
  ],
  valid: [
    { code: 'page.getByRole("button", { exact: true, name: "Send" });' },
    { code: "page.getByRole('group', { exact: true, name: `Messages` });" },
    { code: 'page.getByRole("main");' },
    { code: 'page.getByRole("checkbox", { checked: true });' },
    { code: 'page.getByText("Hello", { exact: true });' },
    { code: 'page.getByLabel("Token", { exact: true });' },
    { code: 'page.getByPlaceholder("Search");' },
    { code: 'page.getByTestId("composer");' },
    { code: 'const BOX = { exact: true, name: "Search" } as const;\npage.getByRole("combobox", BOX);' },
    { code: 'const HELLO = { exact: true };\npage.getByText("Hello", HELLO);' },
  ],
});
