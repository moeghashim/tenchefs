#!/usr/bin/env bash
# scripts/new-cloud-worker.sh <N> (pnpm new-cloud-worker <N>): run in your own terminal, logged in to the board as a
# human with `cookout login`. It creates the agent identity cookout-cloud-worker-<N> (display name "Cookout (cloud
# <N>)"), owned by you, and copies its Identity token, shown this once, to the clipboard with the first of pbcopy,
# clip.exe (WSL), wl-copy, xclip or xsel that works. It never prints the token, unless no clipboard tool works: then
# it says so and prints it, with a warning. Then it prints the next steps. A name in use is the CLI's own refusal,
# passed through with its exit code.
set -euo pipefail

usage="usage: pnpm new-cloud-worker <N>, where N is a positive integer such as 2"
if [ "$#" -ne 1 ] || [[ ! "$1" =~ ^[1-9][0-9]*$ ]]; then
  echo "new-cloud-worker: $usage" >&2
  exit 1
fi
if ! command -v cookout > /dev/null; then
  echo "new-cloud-worker: cookout isn't on PATH: install it with npm i -g @ai-hero/cookout, then cookout login" >&2
  exit 1
fi

worker="$1"
name="cookout-cloud-worker-$worker"
created=$(cookout identity create "$name" --kind agent --display-name "Cookout (cloud $worker)")
token=$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(0, "utf8")).token)' <<< "$created")

copy() {
  for tool in pbcopy clip.exe wl-copy "xclip -selection clipboard" "xsel --clipboard"; do
    # shellcheck disable=SC2086 # the tool's flags split on purpose
    if command -v ${tool%% *} > /dev/null && printf '%s' "$token" | $tool 2> /dev/null; then
      echo "${tool%% *}"
      return 0
    fi
  done
  return 1
}

if copied_with=$(copy); then
  echo "new-cloud-worker: created $name and copied its token to the clipboard ($copied_with)."
else
  echo "new-cloud-worker: no clipboard tool found (pbcopy, clip.exe, wl-copy, xclip, xsel), so here is the token." >&2
  echo "new-cloud-worker: warning: it is shown this once and is now in your terminal's scrollback; clear it after pasting." >&2
  echo "$token"
fi
printf '%s\n' "Next:" \
  "1. Start a new cloud session on worker $worker's own environment, not worker 1's: the environment's secret decides who the session is." \
  "2. In that session, paste the token when it asks for the cookout credential."
