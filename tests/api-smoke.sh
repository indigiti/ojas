#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
pid=
trap 'if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; fi; rm -rf "$tmp"' EXIT
export OJAS_DATA_DIR="$tmp" OJAS_DOCUMENT_ROOT="$PWD/apps/api/public" OJAS_LOCAL_HTTP=1
make_user() { php apps/api/invite.php "$1" | awk '/Password/{print $NF}'; }
pw=$(make_user test@example.com)
pw2=$(make_user second@example.com)
php -S 127.0.0.1:8342 -t apps/api/public apps/api/public/index.php >"$tmp/server.log" 2>&1 &
pid=$!
url=http://127.0.0.1:8342/api/v1
for i in {1..30}; do if curl -fsS "$url/health" 2>/dev/null; then break; fi; sleep .2; done
curl -fsS "$url/health" | jq -e '.ok'
[[ $(curl -s -o /dev/null -w '%{http_code}' "$url/progress") == 401 ]]
login() {
  local token
  token=$(curl -fsS -c "$2" "$url/me" | jq -r .csrf)
  curl -fsS -b "$2" -c "$2" -H "X-CSRF-Token: $token" -H 'Content-Type: application/json' -d "$(jq -nc --arg e "$1" --arg p "$3" '{email:$e,password:$p}')" "$url/auth/login" | jq -er .csrf
}
csrf=$(login test@example.com "$tmp/c1" "$pw")
csrf2=$(login second@example.com "$tmp/c2" "$pw2")
[[ $(curl -s -o /dev/null -w '%{http_code}' -b "$tmp/c1" -X POST "$url/workouts") == 403 ]]
data='{"id":"12345678-abcd-4321-abcd-123456789abc","plan":{"name":"Smoke","exercises":["squat"]},"sets":[{"exercise":"squat","kg":35,"reps":8}]}'
post() { curl -sS -o "$tmp/response" -w '%{http_code}' -b "$tmp/c1" -H "X-CSRF-Token: $csrf" -H 'Content-Type: application/json' -d "$1" "$url/workouts"; }
[[ $(post "$data") == 201 ]]
[[ $(post "$data") == 200 ]]
[[ $(post "$(jq '.sets[0].reps=9' <<< "$data")") == 409 ]]
[[ $(post "$(jq '.sets[0].reps=0' <<< "$data")") == 422 ]]
curl -fsS -b "$tmp/c1" "$url/progress" | jq -e '.workouts | length==1'
curl -fsS -b "$tmp/c2" "$url/progress" | jq -e '.workouts | length==0'
plan=$(curl -fsS -b "$tmp/c1" -H "X-CSRF-Token: $csrf" -H 'Content-Type: application/json' -d '{"name":"Private plan","exercises":["row"]}' "$url/routines" | jq -er .routine.id)
[[ $(curl -sS -o /dev/null -w '%{http_code}' -b "$tmp/c2" -H "X-CSRF-Token: $csrf2" -H 'Content-Type: application/json' -X PATCH -d '{"name":"Attempt","exercises":["row"]}' "$url/routines/$plan") == 404 ]]
echo "API smoke checks passed"
