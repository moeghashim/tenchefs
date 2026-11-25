import { noPickIntersections as rule } from "../rules/type-declarations.js";
import { ruleTester } from "./rule-tester.js";

const BASE = "interface Base { a: string; b: number }\n";

ruleTester.run("no-pick-intersections", rule, {
  invalid: [
    {
      code: `${BASE}type X = Pick<Base, "a"> & { c: boolean };`,
      errors: [{ data: { name: "X", utility: "Pick" }, messageId: "intersection" }],
    },
    {
      code: `${BASE}export type X = Omit<Base, "a"> & { c: boolean };`,
      errors: [{ data: { name: "X", utility: "Omit" }, messageId: "intersection" }],
    },
    {
      code: `${BASE}type X = { c: boolean } & Pick<Base, "a" | "b">;`,
      errors: [{ messageId: "intersection" }],
    },
    {
      code: `type X = Pick<Imported, "a"> & { c: boolean };`,
      errors: [{ messageId: "intersection" }],
    },
    {
      code: `type X = Pick<models.Base, "a"> & { c: boolean };`,
      errors: [{ messageId: "intersection" }],
    },
    {
      code: `${BASE}type Y = { d: string };\ntype X = Pick<Base, "a"> & Y & { c: boolean };`,
      errors: [{ messageId: "intersection" }],
    },
  ],
  valid: [
    { code: `${BASE}type X = Pick<Base, "a">;` },
    { code: `${BASE}type X = Omit<Base, "a">;` },
    { code: `${BASE}type X = Pick<Base, "a"> & Omit<Base, "b">;` },
    { code: `${BASE}const f = (x: Pick<Base, "a"> & { c: boolean }) => x;` },
    { code: `${BASE}type X = { y: Pick<Base, "a"> & { c: boolean } };` },
    { code: `${BASE}interface X extends Pick<Base, "a"> { c: boolean }` },
    { code: `type X<T> = Pick<T, "a"> & { c: boolean };` },
    { code: `function f<T>() { type X = Omit<T, "a"> & { c: boolean }; return null as unknown as X; }` },
    { code: `type X = Pick<Box<string>, "a"> & { c: boolean };` },
    { code: `type X = Pick<A | B, "a"> & { c: boolean };` },
    { code: `type Either = { a: string } | { a: number };\ntype X = Omit<Either, "a"> & { c: boolean };` },
    { code: `export type Either = { a: string } | { a: number };\ntype X = Omit<Either, "a"> & { c: boolean };` },
    { code: `${BASE}type X = Pick<Base, "a"> & Pick<T | U, "b"> & { c: boolean };` },
    { code: `${BASE}type X = Pick<Base, "a"> | { c: boolean };` },
  ],
});
