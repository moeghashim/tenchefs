import { createContext } from "react";

type Announce = (text: string) => unknown;

const UNHEARD: Announce = Boolean;

const Announcer = createContext<Announce>(UNHEARD);

export { type Announce, Announcer };
