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
workout="$url/workouts/12345678-abcd-4321-abcd-123456789abc"
correction='{"date":"2024-01-02","revision":0,"sets":[{"exercise":"squat","kg":37.5,"reps":9}]}'
edit_workout() {
  curl -sS -o "$tmp/response" -w '%{http_code}' -b "$2" -H "X-CSRF-Token: $3" -H 'Content-Type: application/json' -X PATCH -d "$1" "$workout"
}
[[ $(edit_workout "$correction" "$tmp/c2" "$csrf2") == 404 ]]
[[ $(edit_workout "$(jq '.date="2024-02-30"' <<< "$correction")" "$tmp/c1" "$csrf") == 422 ]]
[[ $(edit_workout "$correction" "$tmp/c1" "$csrf") == 200 ]]
jq -e '.workout.revision==1 and (.workout.finishedAt|startswith("2024-01-02")) and .workout.sets[0].kg==37.5' "$tmp/response"
[[ $(edit_workout "$correction" "$tmp/c1" "$csrf") == 409 ]]
[[ $(post "$data") == 200 ]]
jq -e '.workout.sets[0].reps==9' "$tmp/response"
routine_payload='{"name":"Prescribed","exercises":["row"],"targets":{"row":{"sets":3,"reps":8,"restSeconds":0}}}'
curl -fsS -b "$tmp/c1" -H "X-CSRF-Token: $csrf" -H 'Content-Type: application/json' -d "$routine_payload" "$url/routines" | jq -e '.routine.targets.row == {sets:3,reps:8,restSeconds:0}'
curl -fsS -b "$tmp/c1" "$url/routines" | jq -e '.routines | any(.name=="Prescribed" and .targets.row.sets==3)'
invalid=$(jq '.targets.row.restSeconds=901' <<< "$routine_payload")
[[ $(curl -sS -o /dev/null -w '%{http_code}' -b "$tmp/c1" -H "X-CSRF-Token: $csrf" -H 'Content-Type: application/json' -d "$invalid" "$url/routines") == 422 ]]
put_schedule() {
 curl -sS -o "$tmp/response" -w '%{http_code}' -b "$1" -H "X-CSRF-Token: $2" -H 'Content-Type: application/json' -X PUT -d "$3" "$url/schedule"
}
weekly='{"mode":"weekly","slots":["starter",null,null,null,null,null,null]}'
[[ $(put_schedule "$tmp/c1" "$csrf" "$weekly") == 200 ]]
jq -e '.schedule.slots[0]=="starter" and .schedule.slots[1]==null' "$tmp/response"
curl -fsS -b "$tmp/c2" "$url/schedule" | jq -e '.schedule==null'
foreign=$(jq -nc --arg plan "$plan" '{mode:"rotation",slots:[$plan]}')
[[ $(put_schedule "$tmp/c2" "$csrf2" "$foreign") == 422 ]]
rotation='{"mode":"rotation","slots":["starter","starter-push"]}'
[[ $(put_schedule "$tmp/c1" "$csrf" "$rotation") == 200 ]]
sid=$(jq -er .schedule.id "$tmp/response")
payload=$(jq --arg sid "$sid" '.id="22345678-abcd-4321-abcd-123456789abc" | .rotation={id:$sid,step:0,planId:"starter"}' <<< "$data")
[[ $(post "$payload") == 201 ]]
jq -e '.schedule.step==1' "$tmp/response"
[[ $(post "$payload") == 200 ]]
jq -e '.schedule.step==1' "$tmp/response"
[[ $(post "$(jq '.id="32345678-abcd-4321-abcd-123456789abc"' <<< "$payload")") == 201 ]]
jq -e '.schedule.step==1' "$tmp/response"
[[ $(put_schedule "$tmp/c1" "$csrf" "$rotation") == 200 ]]
jq -e --arg sid "$sid" '.schedule.step==1 and .schedule.id==$sid' "$tmp/response"
rich=$(jq '.id="42345678-abcd-4321-abcd-123456789abc" | .sets=[{exercise:"squat",kg:35,reps:8,kind:"warmup",rir:3,restSeconds:0,group:"A"},{exercise:"squat",kg:0,reps:0,kind:"cardio",seconds:180,km:0.5}]' <<< "$data")
[[ $(post "$rich") == 201 ]]
jq -e '.workout.sets[0].restSeconds==0 and .workout.sets[1].km==0.5' "$tmp/response"
[[ $(post "$rich") == 200 ]]
[[ $(post "$(jq '.sets[0].rpe=8' <<< "$rich")") == 422 ]]
[[ $(post "$(jq '.sets[1].seconds=0' <<< "$rich")") == 422 ]]
curl -fsS -b "$tmp/c1" "$url/export" | jq -e '.version==1 and (.workouts | any(.sets | any(.kind=="cardio"))) and (.workouts | all(has("fingerprint")|not))'
curl -fsS -b "$tmp/c2" "$url/export" | jq -e '.workouts==[] and .routines==[]'
put_weight() {
 curl -sS -o "$tmp/response" -w '%{http_code}' -b "$tmp/c1" -H "X-CSRF-Token: $csrf" -H 'Content-Type: application/json' -X PUT -d "$1" "$url/bodyweight"
}
[[ $(put_weight '{"date":"2024-02-30","kg":72}') == 422 ]]
[[ $(put_weight '{"date":"2024-02-29","kg":0}') == 422 ]]
[[ $(put_weight '{"date":"2024-02-29","kg":72.1}') == 200 ]]
[[ $(put_weight '{"date":"2024-02-29","kg":71.8}') == 200 ]]
curl -fsS -b "$tmp/c1" "$url/progress" | jq -e '.bodyweight==[{date:"2024-02-29",kg:71.8}]'
curl -fsS -b "$tmp/c1" "$url/export" | jq -e '.bodyweight[0].kg==71.8'
curl -fsS -b "$tmp/c2" "$url/progress" | jq -e '.bodyweight==[]'
curl -fsS -b "$tmp/c1" "$url/exercises" | jq -e '.exercises as $names | (.library | length==36) and (.library | all(to_entries[]; .value.name==$names[.key] and (.value.muscles|length>0))) and .library["goblet-squat"].equipment=="Dumbbell"'
curl -fsS -b "$tmp/c1" -H "X-CSRF-Token: $csrf" -H 'Content-Type: application/json' -d '{"name":"Catalog test","exercises":["goblet-squat"]}' "$url/routines" | jq -e '.routine.exercises==["goblet-squat"]'
curl -fsS -b "$tmp/c1" "$url/routines" | jq -e '.routines | any(.id=="starter-5x5-a" and .targets["barbell-row"].sets==5) and any(.id=="starter-5x5-b" and .targets.deadlift.sets==1)'
backup=$(curl -fsS -b "$tmp/c1" "$url/export")
import_backup() {
 curl -sS -o "$tmp/response" -w '%{http_code}' -b "$tmp/c2" -H "X-CSRF-Token: $csrf2" -H 'Content-Type: application/json' -d "$1" "$url/import"
}
[[ $(import_backup "$(jq '.workouts[0].finishedAt="2024-02-30T00:00:00+00:00"' <<< "$backup")") == 422 ]]
curl -fsS -b "$tmp/c2" "$url/export" | jq -e '.workouts==[] and .routines==[] and .bodyweight==[]'
[[ $(import_backup "$backup") == 200 ]]
jq -e '.added>0 and .skipped==0' "$tmp/response"
[[ $(import_backup "$backup") == 200 ]]
jq -e '.added==0 and .skipped>0' "$tmp/response"
curl -fsS -b "$tmp/c2" "$url/export" | jq -e '.schedule==null and (.workouts|length>0) and .bodyweight[0].kg==71.8'
advanced=$(jq '.targets.row += {group:"A",backup:"barbell-row"}' <<< "$routine_payload")
curl -fsS -b "$tmp/c1" -H "X-CSRF-Token: $csrf" -H 'Content-Type: application/json' -d "$advanced" "$url/routines" | jq -e '.routine.targets.row.group=="A" and .routine.targets.row.backup=="barbell-row"'
echo "API smoke checks passed"
