import { Array as Arr, Option, String as Str } from "effect";

interface Named {
  readonly name: string;
  readonly marks: readonly string[];
}

const BROWSERS: readonly Named[] = [
  { marks: ["Edg/", "EdgA/", "EdgiOS/", "Edge/"], name: "Edge" },
  { marks: ["OPR/"], name: "Opera" },
  { marks: ["Firefox/", "FxiOS/"], name: "Firefox" },
  { marks: ["Chrome/", "CriOS/"], name: "Chrome" },
  { marks: ["Safari/"], name: "Safari" },
];

const SYSTEMS: readonly Named[] = [
  { marks: ["iPhone", "iPad", "iPod"], name: "iOS" },
  { marks: ["Android"], name: "Android" },
  { marks: ["CrOS"], name: "ChromeOS" },
  { marks: ["Windows"], name: "Windows" },
  { marks: ["Mac OS X", "Macintosh"], name: "macOS" },
  { marks: ["Linux"], name: "Linux" },
];

const UNNAMED = "web browser";

function nameIn(named: readonly Named[], userAgent: string): Option.Option<string> {
  return Option.map(
    Arr.findFirst(named, ({ marks }) => Arr.some(marks, (mark) => Str.includes(mark)(userAgent))),
    ({ name }) => name,
  );
}

function browserOn(userAgent: string): string {
  const browser = Option.getOrElse(nameIn(BROWSERS, userAgent), () => "A browser");
  return `${browser} on ${Option.getOrElse(nameIn(SYSTEMS, userAgent), () => "an unknown OS")}`;
}

function webSessionWhere(userAgent = ""): string {
  return Option.getOrElse(
    Option.zipWith(
      nameIn(BROWSERS, userAgent),
      nameIn(SYSTEMS, userAgent),
      (browser, system) => `${browser} on ${system}`,
    ),
    () => UNNAMED,
  );
}

export { browserOn, webSessionWhere };
