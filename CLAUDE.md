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
