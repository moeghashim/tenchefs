import { Array as Arr, String as Str, pipe } from "effect";

interface ServiceSettings {
  readonly cookout: readonly string[];
  readonly log: string;
  readonly stateFolder: string;
}

const UNIT = "cookout-runner.service";
const LABEL = "dev.cookout.runner";
const BACKSLASH = "\\";
const QUOTE = '"';

function systemdValue(value: string): string {
  const escaped = pipe(
    value,
    Str.replaceAll(BACKSLASH, String.raw`\\`),
    Str.replaceAll(QUOTE, String.raw`\"`),
    Str.replaceAll("%", "%%"),
  );
  return `"${escaped}"`;
}

function systemdWord(word: string): string {
  return Str.replaceAll("$", "$$$$")(systemdValue(word));
}

function unitText({ cookout, log, stateFolder }: ServiceSettings): string {
  return Arr.join(
    [
      "[Unit]",
      "Description=cookout runner: wakes registered agents on mentions",
      "",
      "[Service]",
      `ExecStart=${Arr.join(Arr.map(cookout, systemdWord), " ")} runner start`,
      `Environment=${systemdValue(`COOKOUT_STATE_DIR=${stateFolder}`)}`,
      "Restart=always",
      "RestartSec=10",
      `StandardOutput=append:${log}`,
      `StandardError=append:${log}`,
      "",
      "[Install]",
      "WantedBy=default.target",
      "",
    ],
    "\n",
  );
}

function xml(text: string): string {
  return pipe(text, Str.replaceAll("&", "&amp;"), Str.replaceAll("<", "&lt;"), Str.replaceAll(">", "&gt;"));
}

function plistText({ cookout, log, stateFolder }: ServiceSettings): string {
  const argv = Arr.map([...cookout, "runner", "start"], (word) => `    <string>${xml(word)}</string>`);
  return Arr.join(
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0">',
      "<dict>",
      "  <key>Label</key>",
      `  <string>${LABEL}</string>`,
      "  <key>ProgramArguments</key>",
      "  <array>",
      ...argv,
      "  </array>",
      "  <key>EnvironmentVariables</key>",
      "  <dict>",
      "    <key>COOKOUT_STATE_DIR</key>",
      `    <string>${xml(stateFolder)}</string>`,
      "  </dict>",
      "  <key>RunAtLoad</key>",
      "  <true/>",
      "  <key>KeepAlive</key>",
      "  <true/>",
      "  <key>StandardOutPath</key>",
      `  <string>${xml(log)}</string>`,
      "  <key>StandardErrorPath</key>",
      `  <string>${xml(log)}</string>`,
      "</dict>",
      "</plist>",
      "",
    ],
    "\n",
  );
}

export { LABEL, type ServiceSettings, UNIT, plistText, unitText };
