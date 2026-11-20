# OJAS on DigiOps staging

DigiOps consumes the **digiops-release** GitHub Actions artifact from a successful push to **main**. It contains public/, private/, and RELEASE.json. PRs build and test the package but do not publish a deployment candidate.

| DigiOps setting | Value |
| --- | --- |
| Repository / branch | indigiti/ojas / main |
| Artifact | digiops-release |
| Application URL | /ojas/ |
| Public / private path | public_html/ojas/ / private_html/ojas/ |
| Health path | /api/v1/index.php?route=/health relative to /ojas/; confirm the resulting full URL is https://stage.digiti.in/ojas/api/v1/index.php?route=/health |

The Next.js export is compiled for /ojas. The browser calls /ojas/api/v1/index.php directly with a route parameter; the API implementation remains in private_html/ojas/api. The host needs PHP 8.2+. Pretty API URLs are optional and require Apache mod_rewrite and FileInfo overrides. Cloudways should serve /ojas/_next assets as static files. No Node or Python server is required. The optional FastAPI prototype is not part of this deployment.

The PHP worker initializes private_html/ojas/runtime on first API request and must be able to write it. DigiOps overlays the private payload; the package never contains the runtime directory, so deploys and rollbacks do not replace user data. Keep it outside public_html; back it up separately. The public health endpoint checks storage configuration without exposing private data or filesystem paths.

After publishing, verify the homepage, assets and API health; unauthenticated GET /ojas/api/v1/index.php?route=/progress must return 401. Confirm the gateway without a route returns 404. Then create a pilot account using the host CLI as the PHP service identity (no public setup endpoint or default password):

```sh
OJAS_DATA_DIR="$APP_HOME/private_html/ojas/runtime" \
OJAS_DOCUMENT_ROOT="$APP_HOME/public_html" \
php "$APP_HOME/private_html/ojas/api/invite.php" pilot@example.com
```

Set APP_HOME to the Cloudways application root. If you do not have shell access, have a server administrator provision the pilot account. Share the generated password only over a private channel. Test mobile sign-in, plan creation, workout draft recovery after reload, offline logging with the page already open, retry after reconnect, and Progress. Do not open public signup on JSON storage.
