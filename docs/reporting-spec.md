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

### E. Fire report — *mostly buildable; one taxonomy gap*

- **Base:** every **fire** raised in MCA — the FIRMS satellite feed
  (`kind:'fire'`) plus any field-raised fire — **whether or not it was
  investigated**. The registry (`_disturbances.json`) already holds open
  (uninvestigated) tasks, so the base list is complete.
- **One fire, many clans — the recombine.** The project *did not create* the
  fires; it investigated them from different angles. The data already encodes
  this: a fire overlapping several clans raises **one task per clan**, each with
  uid = `<base event uid>-<clanslug>` and a `multi_clan:true` flag. The base
  event uid (`FIRMS-<cell>`) is the **recombine key**. The report therefore has
  **two levels**:
  - **Fire level (recombined):** one row per distinct fire. Columns: fire id,
    detected date, location, **clans affected** (the list), **investigated?**,
    and **summary of findings**. A fire in 3 clans is **one row here**, never 3.
  - **Clan level (the angles):** the per-clan investigation rows — the same fire
    shown once per clan, explicitly labelled as the same fire (shared base uid +
    `multi_clan`). A fire in 3 clans visited by only 1 clan shows **3 clan rows,
    1 investigated**.
- **Whether it was investigated:** per-clan `status` (`open` vs
  `verified`/`closed`) and whether a `verify` block came back. Recombined to the
  fire level as **"investigated = yes if *any* clan investigated it"** — so a
  multi-clan fire visited by a single clan counts, at the fire level, as **one
  fire, visited.**
- **Counts the report produces:**
  - distinct fires (recombined — the honest fire count);
  - distinct fires investigated (≥1 clan returned a verification);
  - per-clan task coverage = tasks investigated ÷ tasks raised (the investigation
    *workload* view — different number, both valid, label each clearly).
- **Summary of findings:** from the verification's `cause`/finding. The field-
  verify form now records a **fire-specific finding** (v72): garden burn /
  cash-crop garden burn / runaway fire from a garden / grassland (kunai) /
  land-clearing burn / hunting fire / other / unclear. Stored as `verify.cause`
  with a self-describing `verify.cause_label` so the report needs no taxonomy
  table. (Older records predating v72 carry only `natural`/`human`/`unclear`.)
- **Tiers:** Clan → Zone → MCA (fires are clan-located via boundary routing).

### F. Deforestation (forest clearance) report — *same shape as Fire*

Structurally identical to the Fire report — build them from one template.

- **Base:** every forest-clearance event (`kind:'clearance'`, GFW/RADD feed),
  base event uid `GFW-<cell>`, carrying `area_ha` (satellite) and
  `area_measured_ha` (field-measured on verification).
- **Recombine, investigated-or-not, two levels, counts, tiers:** exactly as
  Fire — group per-clan tasks by base event uid; "investigated = any clan."
- **Findings taxonomy** (implemented, clearance-flavoured): food garden /
  cash-crop garden / **cash-crop rehabilitation** / logging / road / settlement /
  landslide-erosion / flood-river change / storm damage-treefall / unclear —
  stored as `verify.cause` + `verify.cause_label`. **Plain descriptive causes
  with no natural/unnatural tag** — labelling a cause "natural" vs "human" infers
  blame. The garden options are **not** split into "new" vs "expansion" (that
  phrasing hid half the cases); they just state the land use. Satellite
  forest-loss detection (RADD/GFW) fires on **any** canopy loss, so a landslide,
  flood scour or treefall arrives as a "clearance" alert; the steward just
  records what they see.
- **Food garden vs cash-crop rehabilitation — different acts.** A food garden is
  burned fresh from forest and replanted — a **restart**, never a
  "rehabilitation". **Rehabilitation applies only to cash crops**, which stay
  under canopy, so an old block (e.g. coffee) can be cleaned up and brought back.
  That cleanup reads as forest loss on satellite but is **not new
  deforestation**. Food gardens are **not** an EUDR commodity.
- **Cash-crop rehabilitation → planting year (reason held internally).** When
  the steward picks *cash-crop rehabilitation*, the form **requires the crop's
  original planting year** (`verify.rehab_planting_year`, plus
  `verify.rehab_year_approx`). The field asks the **plain factual question only
  and never says why** — telling someone the implication of an answer gives them
  a reason to shade it. The reason is internal and off-device: **EUDR** (EU
  Deforestation Regulation) treats a commodity from forest cleared **after the
  end-2020 cut-off** as non-compliant, so a rehabilitated block is defensible
  only if the crop **predates** that date — and this bites **only if the crop is
  sold into the EU** (sold elsewhere it is moot; if the EU refuses it, it goes
  elsewhere). We collect the year regardless; the analysis happens in the
  report. The report should:
  - flag cash-crop rehabilitation records and show planting year against the
    **end-2020 cut-off** (predates / needs evidence / post-cut-off);
  - keep rehabilitation **distinct from new clearing** in the headline count.
- **Report groups causes neutrally.** For analysis the report may group
  land-use causes (garden, cash-crop, rehabilitation, logging, road, settlement)
  separately from physical/ground causes (landslide, flood, treefall) — e.g. so
  a landslide isn't counted in a land-clearing figure — but it does this with
  **neutral, descriptive labels**, never a "natural vs human" (blame) framing.
- **Tiers:** Clan → Zone → MCA.

### G. MaFIA — *large open area, spec deferred*

Substantial work still outstanding (indicator rollups, change-over-time per
indicator, transect comparability, the measure-method rework). Not spec'd here
yet — tracked in `TODO.md`.

### H. Distribution / Handover — monthly, *built (backend)*

> **Built** in `apps-script-upload.js` as `monthlyDistributionReport()`:
> dedups distributions by `record_uid`, extracts each handover's photos + video
> from the bundle into standalone files under `_media/<YYYY-MM>/`, writes a
> Google Sheet ledger (one row per handover with the media links) in `_reports/`,
> shares both with Matilda + comms, and emails them the links. **Setup (once):**
> set emails via `seedRecipients()` or the `update_recipients` coordinator
> action, then run `installMonthlyDistributionTrigger()` (1st of month, 7am PNG);
> redeploy the web app. Run `monthlyDistributionReport('monthly')` from the
> editor for the current month on demand.


- **Question:** What was handed out this month? One simple content report per
  month — a ledger of handovers.
- **Data:** the `distribution` records (module key `distributions`). Each row:
  date (PNG), steward, zone, clan, recipient + recipient type, received_by,
  items/category + quantity + unit, purpose, donor + `donor_recognised`,
  confirmed_receipt, GPS. Dedup by `record_uid` (snapshots).
- **Media — the part that needs building.** Photos/video are **base64 embedded
  in the JSON bundle**, not files. The comms team needs to *review* them, and
  the report should **link** to them. So a backend job must, per handover:
  decode `photo_handover`, `photo_receipt` and `video` into **standalone Drive
  files** (e.g. `…/_media/<YYYY-MM>/DIST_<uid>_handover.jpg`,
  `_receipt.jpg`, `_video.mp4`), share them with the comms team (or
  link-view), and put each file's **Drive link in the report row**. Once
  extracted + backed up, the bundle's base64 can be stripped server-side (this
  also fixes the 10 MB audit-reader cap).
- **Output:** a Google Sheet (one row per handover, media links in cells) or a
  Doc; refreshed monthly. Comms get read access to the `_media` folder.
- **Tiers:** a single MCA-wide monthly ledger is what's asked; it can still
  carry zone/clan columns to filter.

---

## Report delivery & routing

Who gets which report, and how it reaches them.

- **Field officers → Matilda.** All field-officer reports (distributions,
  training, maps, etc.) compile to **one recipient, Matilda** — she is the
  field-side destination, not each officer.
- **Visiting consultants → themselves.** Each consultant's report (training
  they gave + sites they visited) goes **back to that same consultant** — their
  own record, not pooled.
- **Comms team → distribution media.** Read access to the extracted `_media`
  folder + the monthly distribution ledger (for recognition/reporting use).

**Delivery — two ways, email first:**

1. **Email + links (recommended first).** A monthly Apps Script job (the weekly/
   monthly summary emails already exist) sends each recipient a message with a
   **link** to their compiled report (a Drive Sheet/Doc) and its media folder.
   Robust: works regardless of whether the phone is online, and needs no app
   release. **Contact emails** are maintained in a coordinator-editable Drive
   registry `_recipients.json` (never in source): `field_reports_to` (Matilda),
   `comms` (array), and `consultants` (`{stewardId: email}`). Edit it with the
   `update_recipients` coordinator action or `seedRecipients()` in the editor.
   (The enrolment profile still does not capture email, so consultant addresses
   are held here until it does.)
2. **In-app "My reports" (phase 2).** A screen that fetches the signed-in
   person's compiled report from the backend when online. Nicer, but needs
   connectivity and a per-person report endpoint; do after email+links works.

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
7. **Store the base event uid for fire/deforestation recombine.** Per-clan
   disturbance tasks only carry the base event uid as a *prefix* of their own
   uid (`<base>-<clanslug>`). The Fire and Deforestation reports group on the
   base event — so have the feed write an explicit **`event_uid` = `ev.uid`** on
   each per-clan record. Then "distinct fires" is a trivial group-by instead of
   stripping a clan-slug suffix (which breaks if a clan name ever contains the
   delimiter). Small backend change in `fetchDisturbanceFeed`. Until it exists,
   the report can derive the base by removing the trailing `-<clanslug>` /
   `-TRIAGE`, using `multi_clan` and `owner_clan` as corroboration.

---

## Build order (suggested)

1. **Clan Steward Task Compliance** — data exists; validates the tiered-rollup
   plumbing and the dedup/PNG-time mechanics on real uploads.
2. **Fire** and **Deforestation** — one shared template; the data model already
   supports the recombine. Only blocker to the *findings* column is the
   fire/clearance taxonomy gap (and the `event_uid` convenience field). These
   can come early — the disturbance registry is populated by the feed, not by
   waiting on stewards.
3. **Water Quality** and **Government Services Outturn** — as their upstream
   definitions (sites, facilities + establishment) are created.
4. **MaFIA reporting** — after the module's own open work settles.
