#!/usr/bin/env bash
# scripts/handler-check.sh [command]: check the example handler at $COOKOUT_HANDLER_URL
# (default https://cookout-handler-example.fly.dev) is healthy, call the Webhook command `command` (default `example`)
# on $COOKOUT_URL with $COOKOUT_TOKEN (an admin's) in a channel `e2e-handler-check-<time>-<pid>` it
# creates for the call and deletes on exit, and pass only if the Webhook command's handler replies in the
# call's thread within 30 s. The admin is a real person on the deployed cookout, so it unsubscribes
# from the channel and unfollows the call's thread: the check reaches no one's Inbox.
set -euo pipefail

command="${1:-example}"
channel="e2e-handler-check-$(date +%s)-$$"
handler="${COOKOUT_HANDLER_URL:-https://cookout-handler-example.fly.dev}"
: "${COOKOUT_URL:?set COOKOUT_URL}" "${COOKOUT_TOKEN:?set COOKOUT_TOKEN}"

curl -fsS -o /dev/null "$handler/health"
node app/main.ts channel create "$channel" > /dev/null
trap 'node app/main.ts channel delete "$channel" > /dev/null' EXIT
node app/main.ts unsubscribe "$channel" > /dev/null
thread=$(node app/main.ts command call "$command" --channel "$channel" --data '{"branch":"main"}' | jq -r .threadId)
node app/main.ts unfollow "$thread" > /dev/null
start=$(date +%s)
while [ $(($(date +%s) - start)) -lt 30 ]; do
  reply=$(node app/main.ts thread get "$thread" | jq -c --arg name "$command" '[.replies[] | select(.author.name == $name) | [.text, .data]] | first // empty')
  if [ -n "$reply" ]; then
    echo "handler-check: thread $thread got $reply after $(($(date +%s) - start))s"
    exit 0
  fi
  sleep 2
done
echo "handler-check: no reply from /$command's handler in thread $thread within 30 s" >&2
exit 1
