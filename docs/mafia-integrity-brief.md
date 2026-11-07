# MaFIA → Land Use → Integrity Score — design brief

**For: Theo · Status: starting point, expect to revise · November 2026**

A working brief to get started on turning MaFIA survey data into (1) a **land-use
classification** per sub-transect and (2) a context-aware **Integrity Score**.
It builds on the spreadsheet *"land use classification from MaFIA data.xlsx"* —
that is the right idea; this sharpens it and sets out the scoring layer on top.

The guiding principle, from the project: Managalas is **not** "forest where any
disturbance is bad." Integrity depends on **the right land use in the right
place** — productive (cash or food) where it should be, pristine where it can
be. So scoring must be **differential by land use and by location**, not a single
disturbance scale.

---

## The two phases

- **Phase 1 — Land-use classification** (start here next week). Classify each
  sub-transect from the MaFIA indicators alone. **Needs no spatial layers**, so
  it can begin the moment real data is in hand.
- **Phase 2 — Integrity Score.** Add *where it is* (spatial context) and *how
  well it's done* (management), then score differentially. Needs spatial layers
  and a signed-off scoring rubric.

---

## The data you're working with

MaFIA is a **matrix survey**: indicators are rows (Modules A–H), scored in a
**column per sub-transect (ST1–ST5)** along a 100 m transect. Each column holds
exactly what land use is read from:

- **A** topography / physical (incl. waterways A4 flowing, A5 still, A6 dry channel)
- **B** water indicators (bed type, clarity) — gated on A4/A5/A6
- **C** soil (leaf litter, bare soil, fungi, moisture…)
- **D** vegetation & forest condition (D1–D4 size-class tallies, D5 canopy cover,
  D6 composition, D7 spacing, D14 epiphytes, D15 fallen logs, D17 invasives,
  D18 kunai, …)
- **E** undergrowth & cultivation (E1 garden crops, E2 cash crops — each a
  yes/no with a **Maintained / Overgrown** sub-select that carries management)
- **F** wildlife indicators (present/absent + count)
- **G** human use (fire, cutting, stumps, old garden, tracks, activity…)
- **H** comments

The record also carries the transect GPS (`transect_start`/`transect_end`), zone
and clan — the hooks Phase 2 needs. One MaFIA upload = one transect with up to 5
sub-transect columns; the **sub-transect is the unit** of classification and
scoring.

---

## Phase 1 — Land-use classification

### What the spreadsheet does (and does well)

It picks a **discriminating subset** of indicators and gives each land-use class
a **signature** (the expected value per indicator). For a sub-transect you check
which class its data matches. Classes: **Garden · Abandoned Garden/Fallow ·
Secondary Forest · Primary Forest · Planted Forest.**

Reference signatures (from the sheet; blank = not diagnostic for that class):

| Indicator | Garden | Fallow | Secondary | Primary | Planted |
|---|---|---|---|---|---|
| C3 LeafLitter | No | No | Yes | Yes | — |
| C4 BareSoil | Yes | — | — | — | — |
| C5 Fungi | — | — | — | Yes | No |
| D2 SmallTrees (present) | No | — | — | Yes | — |
| D5 CanopyCover | Open | Partial | Closed | Closed | Closed |
| D6 Composition | — | Mixed | Mixed | Mixed | Single sp. |
| D7 TreeSpacing | — | Irregular | Irregular | Irregular | Regular |
| D14 Epiphytes | No | No | Yes | Yes | No |
| D15 FallenLogs | Yes | Yes | Yes | Yes | No |
| D17 Invasive | Yes | Yes | Yes | No | Yes |
| E1 GardenCrops | Yes | Yes | — | No | — |
| E2 CashCrops | — | No | — | — | — |

### The one issue to fix: ties

In the test data, **T1 matched both Primary *and* Secondary Forest** — their
signatures are nearly identical (both Closed / Mixed / Irregular / Epiphytes /
FallenLogs), differing mainly on **Invasive** (Secondary Yes, Primary No),
**Fungi** and **SmallTrees**. With exact all-or-nothing boolean matching and
blank cells, ties are inevitable.

**Recommended method** (robust to noisy/missing answers):

1. **Best-fit score, not all-or-nothing.** For each class, count how many of its
   *defined* indicators the sub-transect matches, divide by the number defined →
   a 0–1 fit per class. Classify to the **highest fit**, and keep the
   **runner-up + margin** as a confidence.
2. **Flag low-confidence / near-ties for expert review.** This is the project's
   "clan stewards can't classify land use" point in practice: the classifier
   does the clear cases; **Theo (the office) adjudicates the ambiguous ones.**
   The output per sub-transect: `land_use`, `confidence`, `needs_review` (bool),
   `runner_up`.
3. **Keep a transparent decision tree too**, ordered by the strongest splits
   (CanopyCover → GardenCrops → Composition/Spacing for Planted → Invasive/Fungi
   for Primary vs Secondary), so a classification can always be *explained*, not
   just scored. Use it to sanity-check the best-fit output.

### Sharpen the inputs

- **Management is already captured — use it.** MCApp's MaFIA form records
  **E1 "Garden crops present"** and **E2 "Cash crops present"** each with a
  **Maintained / Overgrown** sub-select (the saved keys are `E1_ST*_sub` /
  `E2_ST*_sub`). That IS the spreadsheet's E3/E4 "weeded-maintained" — no new
  field needed. **Managed Garden** = E1/E2 Yes + sub **Maintained**;
  **Unmanaged Garden** = Yes + sub **Overgrown**. The classifier's subset should
  pull these sub-values in.
- **Expand the class list (confirmed — classes can be added).** Target set:
  - *Primary Forest*, *Secondary Forest*, *Planted Forest*, *Fallow* (as now);
  - split *Garden* into **Managed Garden** vs **Unmanaged Garden** (via the
    E1/E2 Maintained/Overgrown sub-select — the garden split that matters for
    integrity);
  - add **Kunai / degraded grassland** (D18 kunai, repeated burning) and
    **Settlement / track corridor** (G12 roads + G13 activity).
  - **Riparian** is better treated as a **place-context flag** (Phase 2, from
    water proximity) layered onto whatever the land use is — a garden can be
    riparian — rather than its own land-use class; keep it a class only where the
    sub-transect *is* a watercourse/bank.
  Add classes freely; tune each one's signature against the real data next week.

### Phase 1 deliverable
A classifier (spreadsheet formulas, then a script/notebook) that takes a MaFIA
record and outputs, per sub-transect: `land_use`, `confidence`, `needs_review`,
plus the matched/mismatched indicators. Test it against next week's real records
and tune the signatures.

---

## Phase 2 — Integrity Score

### Step A — Place context (where it is)
Overlay each sub-transect's GPS with spatial layers to derive:
- **Remoteness** — distance to nearest village / road.
- **Riparian** — distance to a river/waterline (and a buffer, e.g. within 30 m).
- **Sensitive sites** — sacred/protected sites, protected "core".
- **Slope** — from a DEM (steep land is more erosion/landslide-prone).
- **Zone / clan** — already on the record (and clan boundaries already exist in
  the backend).

This reuses the **point-in-polygon / distance machinery the disturbance feed
already runs** against clan boundaries — the plumbing exists; it needs the
layers. **Open: which layers do we have?** (rivers, villages, roads, sensitive
sites, protected core, DEM.)

### Step B — Differential scoring rubric (right land use, right place)
A rubric mapping *(land use × place context × management/breaches)* → integrity
contribution. First cut, from the stated intent — **to be reviewed, these are
placeholders:**

| Situation | Integrity |
|---|---|
| Remote, intact Primary/Secondary forest | **High** — pristine where it can be |
| **Healthy regenerating fallow** (resting land in the rotation) | **Good** — part of a productive cycle |
| Well-managed garden, near village, off rivers, away from sensitive sites | **High** — productive where it should be |
| Planted forest, managed | Moderate–High |
| **Fallow with *recent* tree cutting** (fresh stumps in the regrowth) | **Low** — cutting where it should be left to regrow |
| Managed garden on/near a river (riparian breach) | **Low** |
| Unmanaged / overgrown garden (active use expected, not maintained) | **Low** |
| Ripe crops left unharvested (food/cash wasted) | **Low** |
| Disturbance (cutting, fire, tracks) in a *remote* area | **Low** |
| Litter / rubbish, anywhere | **Low** (hard penalty) |
| Degraded / kunai grassland from repeated burning | **Low** |

Note: **fallow is not a negative** — a healthy fallow is land resting in a
productive rotation and scores well; what pulls it down is **recent tree
cutting** in it (read from Module G: G5 trees cut and the G6–G8 stump tallies,
especially larger/fresh stumps). Likewise a garden is good when *managed* and
poor when *overgrown* — the E1/E2 Maintained/Overgrown sub-select already
carries that.

**Field-form additions for the full rubric** (schema-driven — the collector and
completeness gate pick up new rows automatically):
- **Litter / rubbish** — a new yes/no in Module G (not currently captured).
- **Ripe crops left unharvested** — in Module E, gated on crops present (E1/E2 =
  Yes): a "harvested in time vs wasted" signal. (Management — maintained vs
  overgrown — is already captured; this is the *separate* harvest-timeliness
  signal.)
Both are small, deliberate survey changes — best deployed together with a build
bump, not silently mid-pilot. Disturbance signals (fire, cutting, stumps, tracks)
already exist in Module G; remoteness comes from Phase-2 context.

### Step C — Integrity Score
Combine into a per-sub-transect score (0–100 or **High / Moderate / Low**
band), then aggregate **sub-transect → transect → plot → zone → clan**, always
carrying a **breakdown of what pulled it down** (the actionable part). Deliver it
through the same data-driven report approach used for the value-chain reports.

---

## How it plugs into MCApp

- **Classification + scoring run off-device** (back-office / Apps Script), from
  the uploaded MaFIA records — the clan steward never classifies land use or sees
  the scoring logic (consistent with "ask the question, not the consequence").
- **Place context** reuses the existing point-in-polygon / distance code.
- **Report** reuses the data-driven HTML template pattern (`docs/reports/…`),
  served live and emailed — like the value-chain training-needs report.

---

## Further signals to consider (for later refinement)

The classification works from what's already captured; these sharpen the
**integrity** reading and are worth designing in over time.

- **How recent the stumps / cutting are.** Integrity depends not just on
  *whether* trees were cut (Module G: G5 cut, G6–G8 stump tallies) but on *how
  recently*. **Fresh** stumps (pale cut face, sap, green leaves still on the
  slash, no regrowth) signal **ongoing clearing**; **old/weathered** stumps
  (grey, mossy, coppice regrowth) are historical and part of the land's past.
  This is exactly what separates a *healthy fallow* (fine) from *recent cutting
  in a fallow* (not fine). Consider a **Fresh / Old** sub-select on G5 (or a new
  recency indicator). The same "recency" logic applies to fire signs and damage.
- **Crop ripeness & harvest timeliness.** Beyond "crops present / maintained",
  the integrity signal is whether **ripe crops are harvested in time or left to
  waste**. Capture, when crops are present, *ripe-and-harvested* vs
  *ripe-and-unharvested (wasted)* — a food-security and economic signal.
  Interpret against the agricultural calendar.
- **Litter / rubbish.** A pollution signal anywhere (plastic especially); a hard
  integrity penalty. New Module G yes/no (not currently captured).
- **Seasonality / the swidden rotation.** A single visit is a snapshot of a
  cycle (clear → plant → grow → harvest → fallow → regrow). Interpret
  observations — and remote alerts — against the **season and rotation**, so
  routine garden activity isn't mis-scored as degradation.
- **Ongoing deforestation — RADD is a good remote trigger, confirmed.** RADD
  (Sentinel-1 **radar**) detects forest disturbance **through cloud**, near-real
  time (6–12-day observations, weekly alerts, ~10 m), with high- and
  low-confidence tiers — the right remote source for persistently cloudy
  Managalas, demonstrably working in New Guinea, and already the basis of
  MCApp's disturbance feed. Two caveats carry into the integrity work: (1) it
  flags *where forest was cleared, not why* — pair every alert with **ground
  verification** and the **land-use / integrity context** (routine fallow
  clearing in a garden mosaic is not new forest loss); (2) C-band radar is
  moisture-sensitive, so use the **high-confidence** alerts and watch false
  positives on wet/swamp ground. Net: a strong trigger for *where* to look; the
  ground + land-use layer says whether it *matters*.

---

## Open decisions (for Will) and first-week plan

**Decisions to confirm**
1. **Spatial layers available** for Phase 2 (rivers, villages, roads, sensitive
   sites, protected core, DEM).
2. **Class list — decided: classes can be added.** Target set is Primary /
   Secondary / Planted forest, Managed vs Unmanaged garden, Abandoned/Fallow,
   Kunai/degraded, Settlement; Riparian handled as a place-context flag.
   Signatures to be tuned on the real data.
3. **Field-form additions** to enable the full rubric (management is already
   captured via the E1/E2 Maintained/Overgrown sub-select): add **litter /
   rubbish** (Module G) and **ripe-crops-unharvested** (Module E) — confirm
   wording, then deploy together.
4. **Score shape** — 0–100 vs High/Moderate/Low banding (or both).

**Suggested first week for Theo**
1. Load the real MaFIA records; confirm the data shape (indicators × ST columns).
2. Reproduce the spreadsheet classifier, then switch it to **best-fit scoring +
   confidence + needs_review**; resolve the Primary/Secondary tie.
3. Fold in the E1/E2 Maintained/Overgrown sub-select (managed vs unmanaged) and
   the proposed extra classes; tune signatures on real data.
4. Produce a per-sub-transect classification table + a short note on accuracy and
   which cases needed expert review — the input for the Phase-2 scoring design.
