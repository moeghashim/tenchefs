import { noOverloads as rule } from "../rules/type-declarations.js";
import { ruleTester } from "./rule-tester.js";

ruleTester.run("no-overloads", rule, {
  invalid: [
    {
      code: "function f(a: string): string;\nfunction f(a: number): number;\nfunction f(a: unknown) { return a; }",
      errors: [{ messageId: "overload" }, { messageId: "overload" }],
    },
    {
      code: "class A { f(a: string): void;\nf(a: unknown) {} }",
      errors: [{ messageId: "overload" }],
    },
  ],
  valid: [
    { code: "function f(a: string | number) { return a; }" },
    { code: "declare function f(a: string): void;" },
    { code: "abstract class A { abstract f(): void; }" },
  ],
});
