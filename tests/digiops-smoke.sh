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
test "$(curl -sS -o /dev/null -w '%{http_code}' "$base/ojas-api.php")" = 404
test "$(curl -sS -o /dev/null -w '%{http_code}' "$base/runtime/users.json")" = 404
test "$(curl -sS -o /dev/null -w '%{http_code}' "$base/api/storage.php")" = 404
