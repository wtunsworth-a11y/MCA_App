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
- **E** undergrowth & cultivation (E1 garden crops, E2 cash crops; **E3/E4
  weeded-maintained — see note below**)
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

- **Add the management indicators (E3/E4).** The Template tab already defines
  **E3 GC-WeededMaintained** and **E4 CC-WeededMaintained**, but the classifier
  subset ignores them. They are what separate a **well-managed garden (good)**
  from an **unmanaged one (less good)** — essential for the integrity score.
  **App dependency:** MCApp's MaFIA form currently captures E1/E2 only; capturing
  E3/E4 is a small field-form change to make before management can be scored.
- **Expand the class list (confirmed — classes can be added).** Target set:
  - *Primary Forest*, *Secondary Forest*, *Planted Forest*, *Abandoned Garden /
    Fallow* (as now);
  - split *Garden* into **Managed Garden** vs **Unmanaged Garden** (via E3/E4 —
    this is the garden split that matters for integrity);
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
| Well-managed garden, near village, off rivers, away from sensitive sites | **High** — productive where it should be |
| Planted forest, managed | Moderate–High |
| Managed garden on/near a river (riparian breach) | **Low** |
| Unmanaged / abandoned garden (where active use was expected) | **Low** |
| Unharvested crops (food/cash left to waste) | **Low** |
| Disturbance (cutting, fire, tracks) in a *remote* area | **Low** |
| Litter / rubbish, anywhere | **Low** (hard penalty) |
| Degraded / kunai grassland from repeated burning | **Low** |

**Field-form gaps to close for the full rubric** (confirm with Will): there is
currently **no "litter / rubbish" indicator** and **no "crop harvested vs
unharvested" indicator** in MaFIA — both are named as integrity signals, so
they'd need adding to the form. Disturbance signals (fire, cutting, stumps,
tracks) already exist in Module G; remoteness comes from Phase-2 context.

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

## Open decisions (for Will) and first-week plan

**Decisions to confirm**
1. **Spatial layers available** for Phase 2 (rivers, villages, roads, sensitive
   sites, protected core, DEM).
2. **Class list — decided: classes can be added.** Target set is Primary /
   Secondary / Planted forest, Managed vs Unmanaged garden, Abandoned/Fallow,
   Kunai/degraded, Settlement; Riparian handled as a place-context flag.
   Signatures to be tuned on the real data.
3. **Field-form additions** to enable the full rubric: E3/E4 (management),
   litter/rubbish, crop-harvested — which to add now.
4. **Score shape** — 0–100 vs High/Moderate/Low banding (or both).

**Suggested first week for Theo**
1. Load the real MaFIA records; confirm the data shape (indicators × ST columns).
2. Reproduce the spreadsheet classifier, then switch it to **best-fit scoring +
   confidence + needs_review**; resolve the Primary/Secondary tie.
3. Fold in E3/E4 and the proposed extra classes; tune signatures on real data.
4. Produce a per-sub-transect classification table + a short note on accuracy and
   which cases needed expert review — the input for the Phase-2 scoring design.
