/**
 * The `landing` store: where keyboard focus lands after a move to another view (spec mattpocock/cookout#417, user
 * story 2: one focused thing at all times). The app makes one with `createLanding` and hands it to every view through
 * `LandingContext`. A key or button that moves calls `ask` right after the move: it takes focus off what it was on
 * and asks for a landing. A link's click, which moves only after its handler, calls `askOnFollow` instead, which asks
 * once the page's location hash changes. Once the new view is drawn the app calls `settle(target)`, and if a landing
 * was asked for, focus goes to the first element the CSS selector `target` matches, as soon as one is drawn, unless
 * something else takes focus first or none is drawn within 10 s. `watch(target)` does the same without being asked,
 * as the login page does for its Token field; its target may instead be a function that finds the element or
 * returns null, tried on each change to the page, as → on a sidebar channel link does for that channel's newest
 * message. `subscribe` and `snapshot` (whether a landing is asked for and not yet
 * settled) let the app settle after each ask, even one that doesn't change the location.
 */
export { type Landing, LandingContext, createLanding } from "./lib/landing.ts";
