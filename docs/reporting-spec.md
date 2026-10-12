# MCApp — Reporting Specification

**Status: requirements capture · October 2026 pilot**

What reports the project needs, how they tier, the exact metric each answers,
and what upstream data must exist before each can be built. Reports are a
**separate concern from capture** — most are blocked not by code but by data
definitions that don't exist yet (water sources/sites, government services).

> These are **gaps, not bugs.** The current backend report code
> (`buildZoneReport` / `buildMCFReport`, weekly + monthly emails) does activity
> counts correctly for what it covers; the reports below are the ones still to
> be built as their upstream data lands.

---

## Tiers

Reports roll up through the MCA hierarchy. Not every report has every tier.

| Tier  | Scope                                   |
|-------|-----------------------------------------|
| Clan  | One clan boundary (a clan steward's patch) |
| Zone  | All clans in a zone                     |
| MCA   | All zones                               |

---

## Mechanics every report must follow

Build rules, so each report is correct the first time:

1. **Dedup by `record_uid`.** Each sync re-uploads the steward's **full** bundle
   (a snapshot), so the same record appears in every file from that phone. A
   report must dedup by `record_uid` (keeping the latest) before counting or
   aggregating — never sum raw record counts across files.
2. **Always PNG time.** Every date/time a human sees — buckets, trend axes,
   "last reading", filenames, emails — is **Pacific/Port_Moresby (UTC+10)**.
   Bucket by PNG calendar day/month, not UTC, or readings land in the wrong
   period.
3. **Name the source + tier.** Each report states which module(s) it reads and
   how it rolls clan → zone → MCA, so a number can always be traced back.

---

## Report catalogue

### A. Clan Steward Task Compliance — *buildable now*

- **Question:** Were the regular scheduled tasks done, against target?
- **Why clan-steward-scoped:** regular scheduled monitoring is the clan
  steward's standing job; the report measures adherence to it. (This is why the
  existing report filters to `clan_steward` — correct for *this* report.)
- **Data:** Activity Calendar — scheduled events (the target) + mark-done
  (the actual). Module already exists and syncs.
- **Metric:** `done ÷ due` = % compliance for the period; plus a list of which
  tasks were done vs missed, per steward.
- **Tiers:** Clan (one steward's tasks) → Zone (all stewards in the zone) → MCA.
- **Status:** data model exists. This is the first report to stand up and
  validate against real uploads.

### B. Water Quality — *blocked: needs sources/sites defined + a time series*

- **Questions:**
  1. Is water quality **better or worse than it was**?
  2. What are the **seasonal trends**?
  3. Are water sources **drying out**?
- **Data needed:**
  - Water **sources and sites defined** (registry store exists; the *named,
    located sites* do not yet).
  - **Repeated WQ sampling events** per source over time, with comparable
    parameters (see `monitoring-parameters.md`) and a **baseline**.
  - For drying: a **flow/level** reading or a **"source dry? y/n"** observation
    captured each visit.
- **Metrics:**
  - *Better/worse*: latest reading vs previous (and vs baseline) per parameter —
    direction (improved / declined) and whether it sits inside the agreed safe
    band.
  - *Seasonal*: time series per parameter, grouped by PNG wet/dry season.
  - *Drying*: flow/level trend + count of "dry" observations over time.
- **Tiers:** Clan → Zone → MCA.
- **Prerequisites before it can be built:** sources/sites defined; **≥2 readings
  per source** (for change); ideally a full **wet+dry cycle** (for season);
  **safe-band thresholds agreed** per parameter.

### C. Government Services Outturn — *blocked: needs gov services defined*

- **Question:** **% outturn of government staff** — are they actually showing
  up? Produced as **two separate reports: Health and Education.**
- **Data needed:**
  - Facilities **defined** (facilities registry store exists; typed as health
    vs education) with an **establishment** figure — the expected number of
    staff posted to each facility.
  - **Repeated attendance observations**: how many of the establishment were
    present on each visit.
- **Metric:** `outturn % = present ÷ establishment` per visit, averaged over the
  reporting period; one rollup for health facilities, one for education.
- **Tiers:** Zone → MCA. **No clan tier** — government facilities serve zones,
  not clans.
- **Prerequisites before it can be built:** facilities defined with
  establishment numbers; an attendance-capture field; health/education typing.

### D. MaFIA — *large open area, spec deferred*

Substantial work still outstanding (indicator rollups, change-over-time per
indicator, transect comparability, the measure-method rework). Not spec'd here
yet — tracked in `TODO.md`.

---

## Data readiness snapshot

*(from the Drive upload audit, 7 app-upload files, Oct 10–12 2026)*

**What has real data today**

| Steward | ID | Clan / Zone | Role | Module(s) with content |
|---|---|---|---|---|
| MClane Namaisa | MCA-F05 | Kubi / Z05 | field_officer | distribution (EU seedlings) |
| Machara Otosi | MCA-F06 | Muaduraina / Z06 | field_officer | distribution (EU Okari seeds) |
| Taylor Mariki | MCA-F7B | Afore Station / Z07B | field_officer | training (vanilla) + freemap |
| Will Unsworth | CIFOR-ICRAF 01 | CIFOR-ICRAF / Z01 | mcf_staff (test) | freemap, mafia — mostly **test/placeholder** |

**Honest read for reporting:**

- **No production *clan_steward* uploads yet.** Everything so far is field-officer
  distributions/training or the staff test account. So the one report we can
  build now — **Clan Steward Task Compliance** — has **no real data to run
  against yet**; it can only be validated with pilot/test data until stewards
  start their regular cycles.
- **The data that *does* exist points at two reports we could stand up early:**
  a **distribution / donor ledger** (EU-reportable: recipient, clan, qty+unit,
  purpose, donor + `donor_recognised`, GPS, confirmed_receipt, date — clean rows
  from F05/F06) and a **training register** (type, topic, trainer, pax
  M/F/youth, location, outcomes — from F7B). Neither is in your four requested
  reports, but both are real, reportable, and EU-facing — worth noting.
- **MaFIA** data so far is a single no-tape **test** transect (192 indicator
  cells, all answered) — useful to prove the matrix exports, not production.

**Tooling limit hit during the audit (blocks full validation):** the Drive
reader here caps at **10 MB** per file, so **5 of 7 files (13–25 MB, media-heavy)
could only be partially read** (header + first record). Counts and full media
inventories for those are unconfirmed. The clean fix — which also helps every
future report — is a **server-side export endpoint that strips `data:` media
before download**: reports never need the photo/video blobs, only the metadata,
and a stripped bundle is a fraction of the size. (Add to the backend/ops list.)

## Data normalization rules for the report layer

Gaps the report pipeline must handle (the captured data is fine; the *pipeline*
must normalize it). Observed in real uploads:

1. **Settle one dedup key.** Freemap records carry **two disagreeing IDs** —
   `uid` (`…-MAP-…`) and `record_uid` (`…-freemap-…`). Pick `record_uid` as the
   canonical key everywhere; never use the per-record `id` (a local sequential
   integer, not unique across phones).
2. **Dedup snapshots by `record_uid`.** Confirmed in the wild: F06's
   distribution was uploaded **twice, 15 s apart** (byte-identical). Expected —
   each sync re-uploads the full bundle. Keep latest per `record_uid`.
3. **Recompute geometry from `points`.** Freemap `length_m` / `area_ha` came
   through as **0 despite 9 GPS points**. Don't trust stored geometry — derive
   length/area from `points` at report time. (Also watch category/shape
   mismatches, e.g. a road recorded as `map_type:area`.)
4. **Module key naming.** Distribution arrives under the key `distributions`
   (plural) while inner `survey_type` is `distribution` (singular). No
   `handover` key seen — handover appears to ride under distributions. Normalize
   on read.
5. **MaFIA "Present but count 0".** Real illogical cells exist (e.g. `F3_ST1=P`
   with count 0). This is exactly the state the in-app validation now blocks;
   reports should still flag any legacy records that slipped through.
6. **Time is internally coherent.** All stored stamps are UTC `Z`; the
   `record_uid` embeds PNG-local `HHMM` and matches `Z + 10h` consistently.
   Convert UTC → PNG for every human-facing value (per the mechanics above).

---

## Build order (suggested)

1. **Clan Steward Task Compliance** — data exists; validates the tiered-rollup
   plumbing and the dedup/PNG-time mechanics on real uploads.
2. **Water Quality** and **Government Services Outturn** — as their upstream
   definitions (sites, facilities + establishment) are created.
3. **MaFIA reporting** — after the module's own open work settles.
