# openGym parity scope

Source: DuarteSantos8/openGym README feature list and license. OJAS implements its own code and uses no upstream exercise assets. This is a work register, not a claim of parity.

| Area | Still required after the initial training PR |
|---|---|
| Planning | Licensed exercise library and media, search and equipment filters, muscle maps, custom uploads, one-off weekly rescheduling and configurable week start, editable starter templates including 5×5, deloads |
| Training | Per-set rest, supersets, warm-up/drop/rest-pause/pyramid sets, timed and cardio exercises, RPE/RIR, per-side reps, bodyweight and added load, gym equipment profiles and plate math, substitute exercises, wake lock/alerts, swipe actions and configurable views |
| Progress | Manual entries, adding/removing sets in completed workouts, progression engines and deload logic, estimated 1RM, activity heatmap, structural balance and muscle recovery views, bodyweight and photos |
| Accounts and data | Passkeys and pairing, service worker/cold offline start, conflict-aware sync, import/export, plan sharing/printing, admin/audit, localization and RTL |
| Coach and integrations | Model-backed FastAPI coach with explicit approvals, MCP, signed webhooks |
| Native | iOS, iPadOS, Android, Apple Watch, Apple Health and Health Connect, notifications, geofenced reminders, widgets, Live Activities and supported heart-rate devices |

First training PR: active set edit/copy/remove/undo, workout-level rest selection and skip, weight-record detection, live external-load volume, and additional routine exercise lists. Also supports completed-workout date, load and rep corrections with revision checks; existing workouts start at revision zero. No storage migration is needed.

Acceptance: keep the Cloudways web build deployable without a Node runtime. Test offline draft changes and pending completion retries before deployment. Do not ship multi-device writes on the staging JSON adapter as if it had a sync protocol; design revisions and migration first. Native parity requires separate clients and platform validation, not just a browser build.

## Integrated release gate

This draft adds exercise-level sets, reps and rests, a recurring weekly schedule with rest days, and rolling rotations. Rotation progress advances in the same atomic save as the workout. Retries and stale rotation references do not advance it twice. It is not a deployment candidate. Before marking parity complete, every category above must have tested implementation evidence, separate clearance for exercise assets, and platform validation for the native clients. Existing pilot releases remain independently deployable.
