#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
test -f apps/web/out/index.html
grep -Fq '/ojas/_next/' apps/web/out/index.html
mkdir -p release/public release/private/build
cp -a apps/web/out/. release/public/
cp deploy/digiops/.htaccess release/public/
mkdir -p release/public/api/v1
cp deploy/digiops/ojas-api.php release/public/api/v1/index.php
cp -a apps/api release/private/api
cp docs/STAGING.md release/private/
php <<'PHP'
<?php
$release = [
    'schema'=>'DIGIOPS-RELEASE/1',
    'name'=>'OJAS',
    'version'=>'0.1.0',
    'builtAt'=>gmdate(DATE_ATOM),
    'sourceSha'=>getenv('GITHUB_SHA') ?: 'local',
    'branch'=>getenv('GITHUB_REF_NAME') ?: 'local',
    'ciRunNumber'=>getenv('GITHUB_RUN_NUMBER') ?: '',
    'ciRunId'=>getenv('GITHUB_RUN_ID') ?: '',
    'ciRunAttempt'=>getenv('GITHUB_RUN_ATTEMPT') ?: '',
    'public'=>'public', 'private'=>'private',
    'publicPath'=>'public_html/ojas/', 'privatePath'=>'private_html/ojas/',
    'persistentPaths'=>['runtime/'],
];
$json=json_encode($release, JSON_THROW_ON_ERROR|JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES).PHP_EOL;
if (file_put_contents('release/RELEASE.json',$json) === false ||
    file_put_contents('release/private/build/release.json',$json) === false) exit(1);
PHP
test ! -e release/private/runtime
