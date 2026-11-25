#!/usr/bin/env bash
# pnpm e2e:docker: build the image, then run packages/e2e against it twice, once per store: the
# SQLite leg, on a fresh named volume with fly.toml's [env], and the Postgres leg, the same again
# with a throwaway Postgres container beside the cookout container and DATABASE_URL pointing at
# it (mattpocock/cookout#336). Each leg makes its own COOKOUT_ADMIN_TOKEN, fails if the cookout's
# logs show it or the database password, and fails if any e2e- channel remains after the suite.
# Every container, volume, network and image goes again at the end, also on failure or Ctrl-C.
# Exits with the first failing suite's code, or 1 when a suite passed but left an e2e- channel.
# COOKOUT_PUBLIC_URL is the one [env] value replaced: Docker maps a free local port to the
# container's 8080, so the Host the suite sends is the local address's, not the deployed one's.
# The example handler (packages/handler-example) runs as another container in the cookout's
# network namespace, as the deployed one runs beside the deployed cookout: each leg adds the
# Webhook command `example` (URL http://127.0.0.1:8787/webhook) through the cookout CLI, then starts the
# handler with the secret that add shows once, posting its replies to http://127.0.0.1:8080.
set -euo pipefail

run="cookout-e2e-$$-$RANDOM"
image="$run:latest"
handler_image="$run-handler:latest"
postgres_image="postgres:18-alpine"
scratch=$(mktemp -d)
containers=()
volumes=()
networks=()

tear_down() {
  local i
  for ((i = ${#containers[@]} - 1; i >= 0; i--)); do
    docker rm --force --volumes "${containers[i]}" > /dev/null 2>&1 || true
  done
  for volume in ${volumes[@]+"${volumes[@]}"}; do
    docker volume rm --force "$volume" > /dev/null 2>&1 || true
  done
  for network in ${networks[@]+"${networks[@]}"}; do
    docker network rm "$network" > /dev/null 2>&1 || true
  done
  docker image rm --force "$image" "$handler_image" > /dev/null 2>&1 || true
  rm -rf "$scratch"
  echo "e2e:docker: removed the containers, volumes, networks and images of $run"
}
trap tear_down EXIT
trap 'exit 130' INT TERM

env_flags=()
while IFS= read -r pair; do
  case "$pair" in
    COOKOUT_PUBLIC_URL=*) ;;
    *) env_flags+=(--env "$pair") ;;
  esac
done < <(awk '/^\[/ { in_env = ($0 == "[env]"); next } in_env && /=/ { sub(/^[ \t]*/, ""); split($0, kv, /[ \t]*=[ \t]*/); gsub(/"/, "", kv[2]); print kv[1] "=" kv[2] }' fly.toml)

echo "e2e:docker: docker build -t $image ."
docker build --quiet -t "$image" . > /dev/null
echo "e2e:docker: docker build -f packages/handler-example/Dockerfile -t $handler_image ."
docker build --quiet -f packages/handler-example/Dockerfile -t "$handler_image" . > /dev/null

# wait_until <seconds> <what> <container> <command…>: run the command every 0.5 s until it succeeds,
# failing with the container's logs if it stops first, or after the given number of seconds.
wait_until() {
  local seconds=$1 what=$2 container=$3
  shift 3
  for _ in $(seq $((seconds * 2))); do
    if "$@" > /dev/null 2>&1; then
      return 0
    fi
    if [ "$(docker inspect --format '{{.State.Running}}' "$container")" != "true" ]; then
      echo "e2e:docker: $what stopped first:" >&2
      docker logs "$container" >&2
      exit 1
    fi
    sleep 0.5
  done
  echo "e2e:docker: $what didn't happen within $seconds s." >&2
  exit 1
}

logs_say() {
  docker logs "$1" 2>/dev/null | grep -q "$2"
}

# start_postgres <name>: start a throwaway Postgres container on the network <name>, and set
# database_url to its database there and database_password to its password.
start_postgres() {
  local name=$1
  database_password=$(node -e 'console.log(require("node:crypto").randomBytes(24).toString("hex"))')
  docker network create "$name" > /dev/null
  networks+=("$name")
  containers+=("$name-db")
  POSTGRES_PASSWORD="$database_password" docker run --detach --name "$name-db" --network "$name" \
    --env POSTGRES_USER=cookout --env POSTGRES_DB=cookout --env POSTGRES_PASSWORD \
    --tmpfs /var/lib/postgresql "$postgres_image" > /dev/null
  wait_until 60 "the Postgres container becoming ready" "$name-db" \
    docker exec "$name-db" pg_isready --host 127.0.0.1 --username cookout --dbname cookout
  database_url="postgres://cookout:$database_password@$name-db:5432/cookout"
  echo "e2e:docker: started Postgres ($postgres_image) as $name-db"
}

# run_leg <store>: run the cookout image on sqlite or postgres, then the suite against it.
run_leg() {
  local store=$1
  local name="$run-$store"
  local handler="$name-handler"
  local port url admin_token logs suite left
  local store_flags=()
  database_url=""
  database_password=""
  port=$(node -e 'const s = require("node:net").createServer().listen(0, "127.0.0.1", () => { console.log(s.address().port); s.close(); });')
  url="http://127.0.0.1:$port"
  admin_token=$(node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))')
  if [ "$store" = postgres ]; then
    start_postgres "$name"
    store_flags=(--network "$name" --env DATABASE_URL)
  fi

  echo "e2e:docker: [$store] starting the cookout"
  containers+=("$name")
  volumes+=("$name")
  COOKOUT_ADMIN_TOKEN="$admin_token" DATABASE_URL="$database_url" docker run --detach --name "$name" \
    --publish "127.0.0.1:$port:8080" --volume "$name:/data" --env COOKOUT_ADMIN_TOKEN "${env_flags[@]}" \
    --env "COOKOUT_PUBLIC_URL=$url" ${store_flags[@]+"${store_flags[@]}"} "$image" > /dev/null
  wait_until 60 "the cookout container listening" "$name" logs_say "$name" '"listening"'
  logs=$(docker logs "$name" 2>&1)
  if grep -qF "$admin_token" <<< "$logs"; then
    echo "e2e:docker: [$store] the container's logs show COOKOUT_ADMIN_TOKEN." >&2
    exit 1
  fi
  if [ -n "$database_password" ] && grep -qF "$database_password" <<< "$logs"; then
    echo "e2e:docker: [$store] the container's logs show the password in DATABASE_URL." >&2
    exit 1
  fi
  if [ "$store" = postgres ] && ! grep -qF "\"database\":\"postgres://$name-db:5432/cookout\"" <<< "$logs"; then
    echo "e2e:docker: [$store] the container's startup line doesn't name the Postgres database:" >&2
    echo "$logs" >&2
    exit 1
  fi

  COOKOUT_URL="$url" COOKOUT_TOKEN="$admin_token" COOKOUT_STATE_DIR="$scratch/$store-state" COOKOUT_ALLOW_HUMAN=1 \
    node app/main.ts command add example --url http://127.0.0.1:8787/webhook \
    --schema packages/handler-example/command.schema.json \
    --description "The example handler (packages/handler-example) in its own container" > "$scratch/added.json"
  COOKOUT_COMMAND_SECRET=$(node -e 'console.log(JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).secret)' "$scratch/added.json")
  rm "$scratch/added.json"
  export COOKOUT_COMMAND_SECRET
  containers+=("$handler")
  docker run --detach --name "$handler" --network "container:$name" --env COOKOUT_COMMAND_SECRET \
    --env COOKOUT_URL=http://127.0.0.1:8080 --env HOST=127.0.0.1 --env PORT=8787 "$handler_image" > /dev/null
  unset COOKOUT_COMMAND_SECRET
  wait_until 30 "the handler container listening" "$handler" logs_say "$handler" '^handler listening on '
  echo "e2e:docker: [$store] added the Webhook command example; its handler is listening beside the cookout"

  echo "e2e:docker: [$store] running packages/e2e against $url"
  rm -f .timings/e2e-tests.json .timings/e2e-browser.json
  suite=0
  COOKOUT_E2E_URL="$url" COOKOUT_E2E_ADMIN_TOKEN="$admin_token" pnpm --filter ./packages/e2e test || suite=$?
  node scripts/slowest-files.ts e2e-tests vitest .timings/e2e-tests.json "$PWD/packages/e2e"
  node scripts/slowest-files.ts e2e-browser playwright .timings/e2e-browser.json packages/e2e/app/modules/cookout/tests/browser
  if [ "$suite" -ne 0 ]; then
    echo "e2e:docker: [$store] the suite failed" >&2
    exit "$suite"
  fi

  COOKOUT_URL="$url" COOKOUT_TOKEN="$admin_token" COOKOUT_STATE_DIR="$scratch/$store-state" COOKOUT_ALLOW_HUMAN=1 \
    node app/main.ts channel list > "$scratch/channels.json"
  left=$(node -e 'const { channels } = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); console.log(channels.map(({ name }) => name).filter((name) => name.startsWith("e2e-")).join(" "))' "$scratch/channels.json")
  if [ -n "$left" ]; then
    echo "e2e:docker: [$store] e2e left these channels on the cookout: $left" >&2
    exit 1
  fi
  echo "e2e:docker: [$store] the run left no e2e- channel"
}

run_leg sqlite
run_leg postgres
echo "e2e:docker: both legs passed, on SQLite and on Postgres"
