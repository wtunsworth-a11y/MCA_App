# MCA Steward App — project rules

Working agreements for this repo. These are binding unless the user overrides them.

## Data integrity

- **No default-on-skip.** A question that the surveyor skips must stay **empty** in
  the saved record. Form fields must start in an explicit *unset* state and only
  contribute a value once the user actively chooses one. Never ship a control
  that is pre-selected to a real answer (e.g. a weather pill defaulting to
  "Cloudy", a dropdown defaulting to its first option) and then written to the
  record as if entered. If a value matters and is missing, leave it blank (and
  flag for review where appropriate) — do not invent it from a default.
  - Already applied: MaFIA transect-conditions (weather) — blank until tapped.
  - To audit across other modules before each goes to pilot.

- **Profile-derived vs entered.** `zone`, `clan`, `steward` on a survey come from
  the enrolment profile, not from a per-survey field. Don't present them as
  survey questions.

- **Neutral, descriptive findings — never a blame framing.** When a steward
  records what they observed (e.g. a disturbance cause / finding), the options
  are plain descriptions of what is on the ground. **Do not tag a cause as
  "natural" vs "unnatural/human"**, and do not phrase options so they imply fault
  or wrongdoing. Labelling a cause "unnatural" makes a steward feel they are
  accusing a person or clan, which skews what they record. A report may still
  group causes for analysis, but with neutral descriptive labels (e.g. land-use
  vs ground/physical), never a natural/human (blame) dichotomy.

## Storage & retention

- **Work phones must keep space free for the app.** It warns on the dashboard
  when free space is low/critical (`checkStorageLevel`), and before a Handover
  (which captures photos + video) when critical — warn, never block.
- **One-month local fallback, then free the media.** Records are kept in full
  (including photos/video) for **`MCA_RETAIN_DAYS` (30) days after they sync**, as
  a local fallback if anything happens to Drive. After that window, a purge runs
  **only after a confirmed Drive upload** (`purgeOldSyncedMedia` in the sync
  success path) and strips **only** the heavy `data:` media, keeping the record's
  metadata and leaving `synced:true` (so it is never re-uploaded). Unsynced
  records and ownership/registry fields are never touched.
- **Receiving end MUST back up monthly.** Because phones drop media after a
  month, Drive is the single copy. The project side must duplicate uploaded data
  to a **second secure location at least monthly** (e.g. a scheduled Apps Script
  copy to a backup Drive/folder, or an offsite archive). Until that exists,
  losing the Drive folder loses everything older than one month. **Backend/ops
  task — owned by the data & reports side, not the app.**

## Resilience — never an irrecoverable dead-end

- **A module must never fail in a way that loses the work.** This matters most
  after capturing things that cannot be repeated — photos and especially a
  **video of people** at a handover. Never let an optional step (GPS, network,
  a sensor) block or discard captured evidence.
- **Sensors degrade gracefully and are retryable.** GPS must: (1) fall back to a
  coarse network/last-known fix when high-accuracy GNSS can't resolve (indoors,
  under canopy, timeout) — see `captureGPS`; (2) offer an **in-place retry** that
  re-acquires *only* the sensor and never resets the form or wipes media (the
  surveyor may need to step outside); (3) be **optional** where a fix isn't
  essential — record without it and mark `location_missing` / `gps_source` for
  review rather than refusing to save.
- Re-entering a capture screen must not silently destroy already-captured media.
  Prefer re-acquiring the failed piece in place over re-initialising the screen.

## Time & dates

- **Always PNG local time.** Every time and date shown to a human — on screen, in
  filenames, in reports/exports, and in conversation with the user — is
  **Pacific/Port_Moresby (UTC+10, no daylight saving)**. The user never sees a
  raw UTC "Z" value. When the user is travelling and says so, use their stated
  local time instead.
- Store the underlying instant in one unambiguous internal form so sorting, the
  clock-sanity check and the month-end upload cutoff stay correct; convert to PNG
  only for display. (PNG has no DST, so the offset is a constant +10:00.)

## Deploy hygiene (existing conventions)

- Bump `sw.js` `CACHE_NAME` and the matching `APP_BUILD` in `index.html` on every
  deploy.
- Coordinator passcode and server key never committed; they live in the app hash
  / Apps Script Script Properties respectively.
- Partner logos are attributed per-piece — never auto-place them; ask first.
