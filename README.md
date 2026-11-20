# OJAS — Workout Web App Blueprint

**Status:** Staging pilot implementation on the development branch. See [deployment and test instructions](docs/STAGING.md).  
**Product:** A mobile-first strength-training log for individual lifters. openGym informs the workflow; OJAS does not depend on its runtime, code, or exercise media.

## 1. Pilot scope

The first release must complete one loop: **sign in → choose a routine → start a workout → log sets → finish → see the session in Progress**.

| Screen | Pilot behavior |
| --- | --- |
| Sign in | Invite-only pilot accounts; no public registration. |
| Today | Planned workout, last session, and a clear Start or Resume action. |
| Active Workout | Previous lift values, quick weight/reps entry, set completion, timestamp-based rest timer, and refresh-safe draft recovery. |
| Plans | Starter routines and a small curated exercise catalog; create, edit, and choose a routine. |
| Progress | Session history and per-exercise weight/reps trend. |

Use bottom navigation on mobile, accessible labels and focus states, large tap targets, and explicit saving, offline, and error states. On a lost connection, preserve the active draft on the same device; show completion as pending until the API acknowledges it. Full offline sync, multi-device draft merging, wearables, billing, gym memberships, and trainer portals are not pilot features.

## 2. Runtime and ownership

```text
Browser ── HTTPS ── Static Next.js pages
   └───── same-origin /api/v1 ── PHP ── private JSON data directory
                                  └──── optional FastAPI coach ── model provider
```

- **Web:** Next.js App Router + React + TypeScript + Tailwind CSS + shadcn/ui; Lucide icons. Use static export (output: 'export'); Node.js is a build dependency only. Client code fetches private data after session validation. Use fixed exported routes with query parameters for dynamic record IDs; no Next.js runtime Server Actions, runtime route handlers, or SSR auth.
- **Core API:** PHP owns authentication, authorization, validation, workout rules, progress reads, and all durable writes. Use secure HttpOnly session cookies, CSRF protection on mutations, password hashing, login throttling, and ownership checks on every private record.
- **AI coach:** Python + FastAPI is a separate optional service, called by PHP over an authenticated service connection. Start with routine drafts only. Send minimal, consented workout context; restrict output to known exercise IDs and validated training fields. Require user approval through PHP before saving a routine. Provider keys stay server-side; timeouts, errors, or a disabled flag never block workout logging.
- **Storage:** JSON is a test-stage adapter for one PHP deployment on a local persistent filesystem. Keep writable data outside the web root and Git. Use stable lock files, hold a lock across each read-modify-write, and atomically replace the target with a validated temp file on the same filesystem. Keep a user's completed session and its idempotency record in one atomic write. Version data, document backup/restore, and test concurrent writes and interrupted saves. Do not use a shared volume across app replicas. Preserve the API contract when replacing JSON with SQLite or PostgreSQL.

## 3. Data and API contract

Core records: User, Exercise, Routine, WorkoutSession, WorkoutSet. A session snapshots its routine so later plan edits do not rewrite history. Keep timestamps in UTC, record canonical load in kg, and treat display units as a user preference. Keep the active workout draft in IndexedDB, scoped by signed-in account; it is not a cross-device backup. Do not store passwords or session tokens there.

| Endpoint | Contract |
| --- | --- |
| POST /api/v1/auth/login; POST /api/v1/auth/logout; GET /api/v1/me | Establish, end, or inspect a PHP session. |
| GET /api/v1/exercises; GET/POST /api/v1/routines; PATCH /api/v1/routines/{id} | Read curated exercises and manage owned routines. |
| POST /api/v1/workouts | Finish a session with a client-generated idempotency key. A retry of the same payload returns the same session; a conflicting payload with that key is rejected. |
| GET /api/v1/workouts; GET /api/v1/progress | Read owned history and derive progress from completed sessions. |
| POST /api/v1/coach/routine-drafts | Optional, returns a validated suggestion without changing any saved routine. |

## 4. Repository and delivery

Planned layout: apps/web (static UI), apps/api (PHP public entry point and domain/storage adapters), services/coach (FastAPI), docs (API and deployment runbooks), and .github/workflows (CI). Only synthetic exercise fixtures and test data belong in Git; runtime JSON and secrets do not.

Deploy the exported frontend and same-origin PHP API on HTTPS. Prefer a dedicated staging subdomain; if deployed under a path, configure the Next.js basePath and PHP routes together and smoke-test direct links and asset URLs. Keep the coach off until its separate Python runtime is available. Keep private API responses out of browser/proxy caches.

| Milestone | Exit criteria |
| --- | --- |
| M0 — Foundation | Static shell and navigation, PHP health endpoint, private storage configuration, CI with a web build and PHP tests. Verify the staging host can route static pages and the API without a Node server. |
| M1 — Workout loop | Invite sign-in, starter routine, active workout, rest timer, reload recovery, idempotent finish, and progress history. End-to-end smoke tests on iOS Safari and Android Chrome. |
| M2 — Invite pilot | Test unauthorized access, concurrent saves, a lost completion response, AI-disabled operation, and backup restoration. Verify no runtime data is web-accessible or bundled into the deployment. |
| M3 — Optional coach | Add constrained draft generation, explicit approval, and provider-failure tests. Keep it disabled by default until validated. |

**Release boundary:** No public signup or horizontal scaling on the JSON adapter. Before a public launch, choose the durable database, rehearse migration and rollback, and review privacy, retention, and account recovery. Keep openGym code and separately licensed media out of OJAS unless explicitly reviewed and cleared for the intended use.
