# openGym parity scope

Source: DuarteSantos8/openGym README feature list and license. OJAS implements its own code and uses no upstream exercise assets. This is a work register, not a claim of parity.

| Area | Still required after the initial training PR |
|---|---|
| Planning | Full-scale exercise library and licensed media, anatomical muscle maps, custom uploads, one-off weekly rescheduling and configurable week start, editable starter templates including 5×5, deloads |
| Training | Per-set rest, supersets, warm-up/drop/rest-pause/pyramid sets, timed and cardio exercises, RPE/RIR, per-side reps, bodyweight and added load, gym equipment profiles and plate math, substitute exercises, wake lock/alerts, swipe actions and configurable views |
| Progress | Manual entries, adding/removing sets in completed workouts, progression engines and deload logic, estimated 1RM, activity heatmap, structural balance and muscle recovery views, bodyweight goals and trend chart, progress photos |
| Accounts and data | Passkeys and pairing, service worker/cold offline start, conflict-aware sync, import/export, plan sharing/printing, admin/audit, localization and RTL |
| Coach and integrations | Model-backed FastAPI coach with explicit approvals, MCP, signed webhooks |
| Native | iOS, iPadOS, Android, Apple Watch, Apple Health and Health Connect, notifications, geofenced reminders, widgets, Live Activities and supported heart-rate devices |

First training PR: active set edit/copy/remove/undo, workout-level rest selection and skip, weight-record detection, live external-load volume, and additional routine exercise lists. Also supports completed-workout date, load and rep corrections with revision checks; existing workouts start at revision zero. No storage migration is needed.

Acceptance: keep the Cloudways web build deployable without a Node runtime. Test offline draft changes and pending completion retries before deployment. Do not ship multi-device writes on the staging JSON adapter as if it had a sync protocol; design revisions and migration first. Native parity requires separate clients and platform validation, not just a browser build.

## Integrated release gate

This draft adds exercise-level sets, reps and rests, a recurring weekly schedule with rest days, and rolling rotations. Rotation progress advances in the same atomic save as the workout. Retries and stale rotation references do not advance it twice. It is not a deployment candidate. Before marking parity complete, every category above must have tested implementation evidence, separate clearance for exercise assets, and platform validation for the native clients. Existing pilot releases remain independently deployable.

## Expanded training implementation in this draft

Adds warm-up/drop tags, timed and cardio entries, RPE or RIR, per-set rest, manual superset grouping, a fixed 20 kg bar calculator, bounded Epley e1RM, and authenticated training JSON export. Manual groups do not automate superset sequencing. The plate calculation does not model a gym's inventory. Export is not import or backup restoration. These limited versions do not close the broader parity rows.

Bodyweight: dated weigh-ins, same-date corrections, recent history and JSON export are implemented in this draft. A goal line, progress photos and a rate-of-change chart remain open.

Progression in this draft: optional +2.5 kg recommendation after all prescribed working sets meet their targets at one load; no automatic plan edits. Other progression rules and deloads remain open. Bodyweight shows a change between adjacent seven-day averages when each window contains at least two weigh-ins.

Exercise discovery: a first-party 36-entry catalog supports name, equipment and muscle filters in the browser and routine editor. Existing exercise IDs are unchanged. This does not include animations or the upstream catalog.

## Remaining parity release

Keep the remaining implementation on the existing integration PR rather than opening a PR per feature. Green CI verifies the current changes, not parity. The final gate includes the remaining checklist, media rights, native validation, and an Apache/PHP deployment without a Node server.

The web progress screen now summarizes seven days of working/drop sets, external load volume and last-trained dates by primary muscle. This is not an anatomical map or a recovery prediction.

Built-in 5×5 A/B prescriptions and customizable copies are available in this integration. A workout can substitute a same-primary-muscle alternative before logging that exercise, preserving the slot targets without changing the source routine. Preassigned backups and mid-exercise substitutions are not implemented.
