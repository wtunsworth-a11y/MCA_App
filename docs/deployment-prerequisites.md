# MCApp — Deployment prerequisites (must‑haves for the functions to work)

What must exist for the app's logic to work correctly. The dangerous ones are in
**A** — if they're wrong or missing, assignments, compliance and reports
**silently misfire** rather than error.

Status key: **✅ have it** · **🔧 mechanism built, needs data** · **⬜ to create**

---

## A. Reference data that drives assignment & attribution

| # | Item | Lives in | Who provides | Status |
|---|------|----------|--------------|--------|
| 1 | **Clan list per zone** — enrolment clan pick‑list (zone → clan), so a clan steward's clan name is always exact | `_clans.json` (`update_clans` / `seedClans`) | Community / coordinator | 🔧 needs the names |
| 2 | **Clan boundaries per clan** — routes fire/deforestation alerts to the owning clan; without it every alert falls to coordinator triage and clan stewards get none | `_clan_boundaries.json` (GeoJSON; `properties.clan` / `zone`) | Captured via Field Mapping boundary category, or supplied | 🔧 router exists, **needs polygons (biggest gap)** |
| 3 | **Zone list** — enrolment + all zone rollups | `_zones.json` (defaults shipped) | — | ✅ confirmed correct (11 zones incl. 7A/7B; names cosmetic) |
| 4 | **Expected clan‑steward roster** — compliance denominator (not‑reporting = fail; retire with `active:false`) | `_roster.json` (`update_roster` / `seedRoster`) | Coordinator | 🔧 needs the list |

> Only **clan stewards** carry a clan. Zone staff & field officers are
> zone‑level, MCF staff MCA‑wide, consultants external — nothing keys off their
> clan, so a misspelt non‑steward clan is harmless.

## B. Reporting delivery

| # | Item | Lives in | Status |
|---|------|----------|--------|
| 5 | **Recipient emails** — Matilda (field reports), comms (distribution media), consultants (own reports) | `_recipients.json` (`update_recipients` / `seedRecipients`) | 🔧 needs addresses |

## C. Hard infrastructure (nothing runs without)

| # | Item | Status |
|---|------|--------|
| 6 | Apps Script **deployed**; `UPLOAD_ENDPOINT` set in the app; `UPLOAD_SECRET` matches | ⬜ confirm live |
| 7 | **Coordinator passcode** (in the app hash) + **coordinator server key** (Script Properties) | ⬜ confirm set |
| 8 | Drive data folder reachable | ✅ |

## D. Defaulted / optional (work without, better with)

| # | Item | Status |
|---|------|--------|
| 9 | **Phenology targets per clan** (`_pheno_targets.json`) — defaults to 5; name clans needing more | 🔧 optional |
| 10 | **Training topics** (`_topics.json`) — only if using per‑topic authorisation for field officers | 🔧 optional |
| 11 | **KNOWN_IDS** in the app — offline duplicate‑ID guard at enrolment | ⬜ keep current |

## E. Field‑populated (emerge in use; required before *those reports* mean anything)

| # | Item | Note |
|---|------|------|
| 12 | **Water sources / facilities / met stations** registries | Registered + approved in the field. Gov‑services outturn also needs an **establishment number** (expected staff) per facility. |
| 13 | **Phenology trees** per clan | Registered + approved; drives the phenology compliance denominator. |

## F. Ops

| # | Item | Note |
|---|------|------|
| 14 | **Monthly off‑Drive backup** | Drive is the single copy after the 1‑month on‑phone media purge. Backend/ops task. |

---

### The critical "before real clan stewards enrol" shortlist
**#1 clan list per zone**, **#2 clan boundaries**, **#4 roster** — these are the
ones that silently break assignments. **#2 is the biggest outstanding gap**: the
whole disturbance‑routing + fire/deforestation reporting chain depends on it.
