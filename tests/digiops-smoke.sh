#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
chmod 755 "$tmp"
name="ojas-apache-${GITHUB_RUN_ID:-local}-$$"
trap 'docker rm -f "$name" >/dev/null 2>&1 || true; rm -rf "$tmp"' EXIT
mkdir -p "$tmp/public_html/ojas" "$tmp/private_html/ojas"
cp -a release/public/. "$tmp/public_html/ojas/"
cp -a release/private/. "$tmp/private_html/ojas/"
# Test-only: allow the Apache worker to create runtime under the private app root.
chmod 777 "$tmp/private_html/ojas"
docker run -d --name "$name" -p 127.0.0.1::80 -v "$tmp:/fixture" php:8.3-apache bash -ec '
  a2enmod rewrite
  sed -i "s@/var/www/html@/fixture/public_html@g" /etc/apache2/sites-available/000-default.conf
  printf "<Directory /fixture/public_html>\nAllowOverride FileInfo\nRequire all granted\n</Directory>\n" > /etc/apache2/conf-enabled/ojas-fixture.conf
  exec apache2-foreground
'
base="http://$(docker port "$name" 80/tcp)/ojas"
for i in {1..30}; do if curl -fsS "$base/" >"$tmp/index.html" 2>/dev/null; then break; fi; sleep 1; done
asset=$(grep -Eo '/ojas/_next/[^" ]+\.js' "$tmp/index.html" | sed -n '1p')
test -n "$asset"
curl -fsS "${base%/ojas}$asset" >/dev/null
curl -fsS "$base/api/v1/health" | jq -e '.ok == true'
curl -fsS -D "$tmp/headers" "$base/api/v1/me" | jq -e '.user == null and (.csrf|length == 64)'
grep -Eiq '^set-cookie: __Secure-ojas=.*path=/ojas/api/v1/.*secure.*HttpOnly' "$tmp/headers"
test "$(curl -sS -o /dev/null -w '%{http_code}' "$base/api/v1/progress")" = 401
test "$(curl -sS -o /dev/null -w '%{http_code}' "$base/api/v1/index.php")" = 404
curl -fsSI "$base/api/v1/health" >/dev/null
# Prove the browser's direct PHP route works even without rewrite rules.
rm "$tmp/public_html/ojas/.htaccess"
curl -fsS "$base/api/v1/index.php?route=%2Fhealth" | jq -e '.ok == true'
curl -fsSI "$base/api/v1/index.php?route=%2Fhealth" >/dev/null
curl -fsS -D "$tmp/headers" "$base/api/v1/index.php?route=%2Fme" | jq -e '.user == null and (.csrf|length == 64)'
grep -Eiq '^set-cookie: __Secure-ojas=.*path=/ojas/api/v1/.*secure.*HttpOnly' "$tmp/headers"
test "$(curl -sS -o /dev/null -w '%{http_code}' "$base/api/v1/index.php?route=%2Fprogress")" = 401
test "$(curl -sS -o /dev/null -w '%{http_code}' "$base/api/v1/index.php?route[]=health")" = 404
test "$(curl -sS -o /dev/null -w '%{http_code}' "$base/runtime/users.json")" = 404
test "$(curl -sS -o /dev/null -w '%{http_code}' "$base/api/storage.php")" = 404

gateway="$base/api/v1/index.php"
cookie() { sed -nE 's/^Set-Cookie: (__Secure-ojas=[^;]+).*/\1/ip' "$tmp/headers" | tail -1; }
curl -fsS -D "$tmp/headers" "$gateway?route=/me" | jq -e '.demoAvailable == false' >/dev/null
token=$(curl -fsS -D "$tmp/headers" "$gateway?route=/me" | jq -er .csrf)
test "$(curl -sS -o /dev/null -w '%{http_code}' -b "$(cookie)" -H "X-CSRF-Token: $token" -X POST "$gateway?route=/auth/demo")" = 404
stage=(-H 'Host: stage.digiti.in')
open_demo() {
  local token anon
  token=$(curl -fsS "${stage[@]}" -D "$tmp/headers" "$gateway?route=/me" | jq -er 'select(.demoAvailable == true) | .csrf')
  anon=$(cookie)
  test -n "$anon"
  test "$(curl -sS "${stage[@]}" -b "$anon" -o /dev/null -w '%{http_code}' -X POST "$gateway?route=/auth/demo")" = 403
  curl -fsS "${stage[@]}" -b "$anon" -D "$tmp/headers" -H "X-CSRF-Token: $token" -X POST "$gateway?route=/auth/demo" | jq -er 'select(.user.demo == true) | .csrf'
}
first_csrf=$(open_demo)
first=$(cookie)
payload='{"id":"12345678-abcd-4321-abcd-123456789abc","plan":{"name":"Demo","exercises":["squat"]},"sets":[{"exercise":"squat","kg":35,"reps":8}]}'
curl -fsS "${stage[@]}" -b "$first" -H "X-CSRF-Token: $first_csrf" -H 'Content-Type: application/json' -d "$payload" "$gateway?route=/workouts" | jq -e '.workout.sets[0].reps == 8'
curl -fsS "${stage[@]}" -b "$first" "$gateway?route=/progress" | jq -e '.workouts | length == 1'
open_demo >/dev/null
second=$(cookie)
test "$first" != "$second"
curl -fsS "${stage[@]}" -b "$second" "$gateway?route=/progress" | jq -e '.workouts | length == 0'
curl -fsS "${stage[@]}" -b "$first" -H "X-CSRF-Token: $first_csrf" -X POST "$gateway?route=/auth/logout" | jq -e .ok
test "$(curl -sS "${stage[@]}" -b "$first" -o /dev/null -w '%{http_code}' "$gateway?route=/progress")" = 401
test -z "$(find "$tmp/private_html/ojas/runtime" -type f -name 'user_*.json' -print -quit)"
