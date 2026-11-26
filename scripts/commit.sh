#!/usr/bin/env bash
# Runs `git commit "$@"`, but first fails a commit that stages nothing, so the pre-commit hook always gets to run (#256).
# lefthook skips every pre-commit job when nothing is staged, so the hook alone can't say so.
# A merge, `--amend`, `--allow-empty` and `--all` may stage nothing beforehand.
# After the commit, it warns when origin/v1 has commits since the branch's merge base that touch a file the branch
# changes, so a ticket hears about a clashing merge at its next commit rather than at merge-ticket (#475).
# The warning never blocks the commit, and never changes its exit code.
# It records how long its `git commit` took, almost all of it hook time, as a pre-commit line in the shared stage log
# that `pnpm budgets` reads (#639, scripts/lib/stage-log.ts). Recording never fails or slows the commit.
set -euo pipefail
allowed=false
for arg in "$@"; do
  case "$arg" in
    --amend | --allow-empty | --all | -a) allowed=true ;;
  esac
done
if [ "$allowed" = false ] && [ ! -f "$(git rev-parse --git-path MERGE_HEAD)" ] && git diff --cached --quiet; then
  echo "nothing staged: run git add first" >&2
  exit 1
fi

V1=refs/remotes/origin/v1
FETCH_SECONDS=2

# Fetches origin/v1 quietly, giving up after FETCH_SECONDS, and never asking for credentials.
fetch_v1() {
  local limit=()
  if command -v timeout >/dev/null; then
    limit=(timeout "$FETCH_SECONDS")
  fi
  GIT_TERMINAL_PROMPT=0 "${limit[@]}" git fetch --quiet --no-tags origin v1 </dev/null >/dev/null 2>&1
}

# Prints, on stderr, each commit on origin/v1's first-parent line since the merge base that touches a file the branch
# changes (committed or staged), with the files it touches. Merges are diffed against v1's side, so a merged ticket
# shows as its one merge commit.
warn_v1_overlap() {
  git rev-parse --verify --quiet "$V1" >/dev/null || return 0
  local base
  base="$(git merge-base HEAD "$V1" 2>/dev/null)" || return 0
  local files=()
  mapfile -t files < <(git -c core.quotePath=false diff --cached --name-only "$base")
  [ "${#files[@]}" -gt 0 ] || return 0
  local lines=()
  local line commit="" touched=""
  while IFS= read -r line; do
    if [[ "$line" == $'\x01'* ]]; then
      [ -z "$commit" ] || lines+=("  $commit: $touched")
      commit="${line#$'\x01'}"
      touched=""
    elif [ -n "$line" ]; then
      touched="${touched:+$touched, }$line"
    fi
  done < <(git -c core.quotePath=false --literal-pathspecs log --reverse --first-parent --diff-merges=first-parent \
    --name-only --format=$'\x01%h %s' "$base..$V1" -- "${files[@]}")
  [ -z "$commit" ] || lines+=("  $commit: $touched")
  [ "${#lines[@]}" -gt 0 ] || return 0
  if [ "${#lines[@]}" -eq 1 ]; then
    echo "warning: origin/v1 has 1 new commit touching files this branch changes; read it before you go on (merge-ticket will take it in):" >&2
  else
    echo "warning: origin/v1 has ${#lines[@]} new commits touching files this branch changes; read them before you go on (merge-ticket will take them in):" >&2
  fi
  printf '%s\n' "${lines[@]}" >&2
}

# Microseconds since the epoch, or whole seconds' worth where bash has no EPOCHREALTIME.
now_us() {
  if [ -n "${EPOCHREALTIME:-}" ]; then
    echo "${EPOCHREALTIME/[.,]/}"
  else
    echo "$((SECONDS * 1000000))"
  fi
}

# Appends `<ISO time>\tpre-commit\t<milliseconds>` to the stage log in the git common directory.
record_pre_commit() {
  local started="$1" log
  log="$(git rev-parse --git-common-dir)/stage-times.log"
  printf '%s\tpre-commit\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$((($(now_us) - started) / 1000))" >>"$log"
}

# The fetch runs alongside the hook, so it adds no time unless it outlasts the hook.
fetch_pid=""
if git remote get-url origin >/dev/null 2>&1; then
  fetch_v1 &
  fetch_pid=$!
fi
status=0
started="$(now_us)"
git commit "$@" || status=$?
(record_pre_commit "$started") 2>/dev/null || true
if [ -n "$fetch_pid" ]; then
  wait "$fetch_pid" || true
fi
warn_v1_overlap || true
exit "$status"
