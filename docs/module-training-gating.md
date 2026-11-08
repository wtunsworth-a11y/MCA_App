# Clan-steward module gating — how it works

**For: Theo (overview) · November 2026**

Each trainable **data module** opens for a **clan steward** only after the
coordinator has marked them trained on it. Other roles (field officers,
oversight) are never gated by this. Built on the same authorisation pattern as
training-topic and value-chain-auditor gating.

## Mechanism

- **Per-steward unlock list** — `profile.trained_modules` (array of module keys),
  synced from the backend on login (`syncModuleTraining`), exactly like
  `authorised_topics` / `authorised_commodities`.
- **Tile gate** — on the dashboard, a clan steward only sees a module tile whose
  `data-tmod` key is in `trained_modules`.
- **Nav gate** — `nav()` calls `moduleLocked(screenId)`; a clan steward tapping
  a locked module is blocked with a toast ("…opens once you've been trained…").
  Belt-and-suspenders in case a tile is reached another way.
- **Gated modules** (`TRAINED_MODULES` in index.html): `mafia`, `qabb`, `water`,
  `met`, `phenology`, `conservation`, `disturbance`, `freemap`, `sdm`. Add a
  module by adding one `{key,label,screen}` entry and a `data-tmod="key"` on its
  tile.

## Granting (coordinator)

- Coordinator unlock → **"Unlock Clan-Steward Modules"** → pick the steward
  (name/ID search) → tick the modules they've completed training for → submit.
- Posts `grant_module_training` (coordinator-key protected) →
  `_module_training.json`:
  `{ "<stewardId>": [ {module, authorised_by, authorised_at, status} ] }`.
- The steward's phone pulls `?action=module_training&stewardId=...` on next
  online login and the tiles open.

## Weekly oversight

The weekly upload-activity email now carries a **"New approvals this window"**
section: trainer certifications, value-chain auditor authorisations and
clan-steward module unlocks granted in the last 7 days, resolved to names.

## Decisions & next steps

- **Coordinator-granted** is the current model (reliable, explicit). A later
  **training-record-driven** phase could auto-unlock from the attendance
  register once it links attendees to enrolled Steward IDs (today it captures
  names + signatures, not IDs).
- **Rollout:** turning this on locks the gated modules for clan stewards until
  they're marked trained — so bulk-mark current active stewards (or phase in
  module by module) to avoid locking anyone out mid-pilot.
- **Module ↔ training topic:** each module should map to a training topic in
  `_topics.json`; the coordinator ticks the module, but the intent is "trained
  on the topic that covers this module." Worth formalising the map with Theo.
