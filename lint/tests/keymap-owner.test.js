import { keymapOwner } from "../rules/keymap-owner.js";
import { ruleTester } from "./rule-tester.js";

const errors = [{ messageId: "listener" }];

ruleTester.run("keymap-owner", keymapOwner, {
  invalid: [
    { code: 'document.addEventListener("keydown", pressed);', errors },
    { code: 'globalThis.document.addEventListener("keyup", pressed, { capture: true });', errors },
    { code: 'window.addEventListener("keypress", pressed);', errors },
    { code: 'globalThis.addEventListener("keydown", pressed);', errors },
    { code: 'window.document["addEventListener"]("keydown", pressed);', errors },
    { code: "document.onkeydown = pressed;", errors },
    { code: "globalThis.onkeyup = pressed;", errors },
  ],
  valid: [
    { code: 'document.addEventListener("click", clicked);' },
    { code: 'globalThis.addEventListener("hashchange", changed);' },
    { code: 'box.addEventListener("keydown", pressed);' },
    { code: 'document.body.addEventListener("keydown", pressed);' },
    { code: "document.addEventListener(type, listener);" },
    { code: 'document.removeEventListener("keydown", pressed);' },
    { code: "box.onkeydown = pressed;" },
  ],
});
