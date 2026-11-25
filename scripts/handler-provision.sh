#!/usr/bin/env bash
# scripts/handler-provision.sh [command]: make the cookout at $COOKOUT_URL (admin token in
# $COOKOUT_TOKEN) ready for the example handler app $COOKOUT_HANDLER_APP (default
# cookout-handler-example). It deletes the channel `handler-example` if it is there (earlier runs
# created it; scripts/handler-check.sh now calls in a channel of its own) and, if the Webhook command
# `command` (default `example`) is missing, adds it pointing at https://$COOKOUT_HANDLER_APP.fly.dev/webhook
# with the schema in packages/handler-example/command.schema.json. It pipes the secret, shown this
# once, straight into `flyctl secrets import --stage` on the app (with $FLY_API_TOKEN, or the flyctl
# login). If the Webhook command exists but the app has no COOKOUT_COMMAND_SECRET (staging failed after an
# earlier add), it rotates the Webhook command's secret and stages the new one the same way. If the handler
# identity (the agent named after the Webhook command) is deactivated, it reactivates it, because a deactivated
# handler's result replies are refused with token_revoked (#191); it discards the fresh token that shows.
# It never prints a secret or token, and changes nothing on a rerun once the app has the secret, the
# handler identity is active and the channel is gone.
set -euo pipefail

command="${1:-example}"
retired_channel=handler-example
app="${COOKOUT_HANDLER_APP:-cookout-handler-example}"
: "${COOKOUT_URL:?set COOKOUT_URL}" "${COOKOUT_TOKEN:?set COOKOUT_TOKEN}"

stage_secret() {
  jq -er '"COOKOUT_COMMAND_SECRET=\(.secret)"' | flyctl secrets import --stage -a "$app" > /dev/null
}

if node app/main.ts channel list | jq -e --arg name "$retired_channel" 'any(.channels[]; .name == $name)' > /dev/null; then
  node app/main.ts channel delete "$retired_channel" > /dev/null
  echo "handler-provision: deleted channel $retired_channel"
fi

if node app/main.ts identity list --deactivated \
  | jq -e --arg name "$command" 'any(.identities[]; .name == $name and .deactivated == true)' > /dev/null; then
  node app/main.ts identity reactivate "$command" > /dev/null
  echo "handler-provision: reactivated the deactivated handler identity $command"
fi

if ! node app/main.ts command list | jq -e --arg name "$command" 'any(.commands[]; .name == $name)' > /dev/null; then
  node app/main.ts command add "$command" --url "https://$app.fly.dev/webhook" \
    --schema packages/handler-example/command.schema.json \
    --description "The example handler (packages/handler-example) on Fly" | stage_secret
  echo "handler-provision: added Webhook command $command and staged its secret on $app"
  exit 0
fi

secrets=$(flyctl secrets list -a "$app" --json)
if jq -e 'any(.[]; (.Name // .name) == "COOKOUT_COMMAND_SECRET")' <<< "$secrets" > /dev/null; then
  echo "handler-provision: Webhook command $command exists and $app has its secret"
  exit 0
fi
node app/main.ts command rotate "$command" | stage_secret
echo "handler-provision: Webhook command $command exists but $app had no secret, so it rotated the secret and staged it on $app"
