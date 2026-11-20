# OJAS staging runbook

This release candidate is an invite-only pilot. Do not deploy as a public signup service. The optional FastAPI template service is not integrated into the web UI and is not required for staging; it is not yet a model-backed AI coach.

## Build and deploy

Use PHP 8.2+, HTTPS, and a dedicated staging subdomain for the first installation. In CI or another build machine, use Node.js 22, run `npm install` and `npm run build` in `apps/web`. Serve only the output under `apps/web/out` as the site document root. No Node process is needed on the host. The staging bundle has separate `web/` and `api/` directories; do not publish the whole bundle as the web root.

Place the PHP API and a persistent data directory outside that root. Set `OJAS_DATA_DIR` for PHP-FPM to the absolute, existing, writable private directory. Route only `/api/v1/*` to `apps/api/public/index.php`, retaining REQUEST_URI and the actual static DOCUMENT_ROOT. PHP must not expose stack traces. Do not set `OJAS_LOCAL_HTTP` in staging. Preserve PHP session storage across releases.

Nginx/FPM example (paths and PHP socket are installation-specific):

```nginx
root /srv/ojas/current/web;
index index.html;
location / { try_files $uri $uri/ =404; }
location ^~ /api/v1/ {
    include fastcgi_params;
    fastcgi_param SCRIPT_FILENAME /srv/ojas/current/api/public/index.php;
    fastcgi_pass unix:/run/php/php-fpm.sock;
}
```

For a subpath install, set `NEXT_PUBLIC_BASE_PATH` at build time and `OJAS_API_PREFIX` at runtime to the same path plus `/api/v1` (for example `/ojas/api/v1`). The host must mount the static export at that path. Do not deploy a root build under a subpath without rebuilding.

## Create pilot accounts

As the same service identity that owns the data files, run:

```sh
OJAS_DATA_DIR=/srv/ojas-data OJAS_DOCUMENT_ROOT=/srv/ojas/current/web php /srv/ojas/current/api/invite.php pilot@example.com
```

The password is shown once. Send credentials through a private channel. No test passwords are shipped.

## Verification

Run `bash tests/api-smoke.sh` with PHP, curl and jq. After deploying, verify HTTPS health at `/api/v1/health`; confirm unauthenticated history is rejected and static assets load. On iOS Safari and Android Chrome, test sign-in, custom routine, workout, offline set logging with the page already open, reconnect/retry, and progress. Reload while online mid-workout to verify same-browser draft recovery. The app does not cache its shell for a cold offline launch or sync active drafts across devices.

Confirm that private files cannot be fetched over HTTP. Rehearse backup/restore of the private data directory while writes are stopped. Test concurrent completions and a lost completion response before inviting users. Keep the previous deployment artifact for rollback; back up data before changing schema versions.
