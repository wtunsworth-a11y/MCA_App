# MCA Steward App — Monitoring Parameters

**Reference catalogue · Version 3 · October 2026**

This document lists **what the app captures** in each monitoring module — the
parameters, their options/units, and how each module is scoped. It is intended
as the reference for designing findings reporting.

Two kinds of data are captured:

- **Registry (catalogue) data** — recorded **once** when a thing is registered,
  then fixed (what it is, where it is, who owns it).
- **Reading (findings) data** — recorded **each monitoring visit** (the actual
  observations).

---

## 1. Registry (catalogue) parameters

Every registered thing — water source, facility, met instrument, tree — shares
the same catalogue fields, plus a type-specific set.

**Common registry fields**

| Parameter | Type / options |
|---|---|
| Name / location | text |
| Type | see per-registry below |
| GPS | latitude, longitude, accuracy (m) |
| Reference photo | image (required) |
| Description | text (local name, access, who runs it) |
| Status | Pending · Approved · Rejected |
| Proposing clan | the clan that registered it |
| Owning clan | assigned by coordinator at approval |
| Second owning clan | optional — controlled split (2 readings/month) |

**Per-registry type lists**

| Registry | Store | Types |
|---|---|---|
| Water sources | `water_sources` | **Natural:** River, Creek, Spring · **Engineered:** Reservoir & pipes, Ram pump, Solar pump, Well/borehole |
| Facilities | `facilities` | School, Health Centre, Aid Post |
| Met instruments | `met_stations` | Rain gauge, Weather station, Water level meter |
| Phenology plants | `pheno_plots` | Crop (vanilla, cocoa, coffee, okari, massoy) + plant number (1–5) · **marker_type** (trees → painted band; cash crops → numbered metal tag) · **DBH baseline (cm)** for okari/massoy, captured at establishment, re-measured annually |

---

## 2. Reading (findings) parameters

### 2.1 Water Quality — natural sources
Store `water`. Common: date, time, weather (cloudy/sunny), **photo**.

| Parameter | Options / units | Applies to |
|---|---|---|
| Water colour | Clear · Green · Brown · Milky/White · Dark | all natural |
| Odour | None · Earthy · Chemical · Rotten | all natural |
| Flow (is it flowing?) | Still/Not flowing · Slow · Moderate · Fast/Flood | all natural |
| Visible pollution or debris? | Yes · No | all natural |
| Notes | text | all natural |
| **Secchi disc depth** | centimetres | **River** only |
| **Pond skaters / surface insects** | Many · Few · None | **Creek** only |
| **Shading over water** | Open/No shade · Partial · Shaded | **Creek** only |

### 2.2 Water Quality — engineered / manmade sources
Store `water`. Two-part inspection. Common: date, time, weather, **photo**.

**Source condition**

| Parameter | Options |
|---|---|
| Water present / flowing at source | Good flow · Low/reduced · None (dry) |
| Water clean & clear | Clean & clear · Slightly turbid · Dirty/discoloured |
| Signs of contamination | None · Possible · Yes |

**Delivery & infrastructure**

| Parameter | Options |
|---|---|
| Water at delivery point (tap/outlet) | Good flow · Low/reduced · No water |
| Leaks | None · Minor · Major |
| Damage (pipes/tank/pump/fittings) | None · Minor · Major |
| Repair needed / notes | text |

### 2.3 Service Delivery — facilities
Store `facility_visits`. Common: date, **photo**, operating status.

| Parameter | Options / units | Applies to |
|---|---|---|
| Facility open / operating? | Open · Partial · Closed | all |
| Staff present | number | all |
| Notes | text | all |
| **Students present** | number | **School** only |
| **Essential medicines in stock** | Yes · Some · No | **Health Centre / Aid Post** |

### 2.4 Met instruments — readings
Store `met_readings`. Centred on equipment function. Common: date, **photo**, notes.

| Parameter | Options / units | Applies to |
|---|---|---|
| Instrument working? | Working · Faulty · Not working | all |
| Damage | None · Minor · Major | all |
| **Rainfall since last reading** | millimetres | Rain gauge, Weather station |
| **Gauge emptied after reading?** | yes/no | Rain gauge, Weather station |
| **Water level at marker** | centimetres | Water level meter, Weather station |
| **Flow condition** | Dry/No flow · Normal · High · Flood | Water level meter, Weather station |

### 2.5 Phenology — observations
Store `phenology`. Per approved plant of each crop, each month. Phenophases
follow the **USA-NPN (Nature's Notebook) model**: each is scored
**present/absent** and **several can be true at once** (e.g. young leaves + open
flowers + unripe fruit), so budburst and leaf fall are captured, not just a
single "stage".

| Parameter | Options |
|---|---|
| Phenophases present now (multi-select) | **Leaves:** Budburst · Young leaves · Mature leaves · Colored/falling · Bare (leafless) · **Flowers:** Flower buds · Open flowers · **Fruit:** Unripe fruit · Ripe fruit · Recent fruit/seed drop |
| Overall health | Good · Fair · Poor |
| **DBH re-measure** | cm — **trees only (okari/massoy)**, entered once a year; updates the tree's registry baseline |
| Photo | optional — only if there is something to report |
| Notes | text |

*Stored as `phenophases` (array of the keys above) plus a legacy `phase` (first
selected) for back-compatibility.*

### 2.6 Disturbance verification — field check
Store `disturbances`. One verification per routed alert (clan-owned). The alert
itself (type, location, area, source, confidence) is created by the satellite
feed or a coordinator; the steward records the on-site result.

| Parameter | Options |
|---|---|
| Outcome (neutral) | Confirmed present · Not found on ground · Inconclusive · Could not reach safely |
| Likely cause (recorded separately) | Natural (fire/landslide/flood) · Human (garden/logging/road) · Unclear |
| Photo | geotagged, required |
| Area measured/estimated | ha (optional) |
| Description | text |
| Evidence attached automatically | GPS fix, timestamp, on-site fingerprint, steward ID |

*Clearances are flagged for compulsory verification at ≥ 2 ha. Cause is reported
as what the steward sees and is never pre-judged, so the record is defensible to
outside scrutiny.*

---

## 3. Other monitoring modules (pre-existing)

These were in the app before the registry/ownership work and are **not** yet
clan-ownership gated.

### 3.1 MaFIA — Forest Integrity Assessment
Store `mafia`. A **matrix survey**: indicators (rows) scored per steward
plot/column, across modules:

- **Module A** — Topography & Physical Setting
- **Module B/C** — (soil / canopy structure)
- **Module D** — Vegetation & Species Count
- **Module E** — Undergrowth & Cultivation
- **Module F** — Wildlife Indicators
- **Module G** — Human Use

The matrix is the **full spec set** (`technical_specification.md §8.10`): Module
A (A1–A6 topography), B (B1–B6 water), C (C1–C6 soil), D (D1–D23 vegetation),
E (E1–E2 undergrowth + maintained/overgrown), F (F1–F15 wildlife present/absent
+ count), G (G1–G13 use), H comments, plus transect weather (cloud/rain/wind).
Rendered from a schema across ST1–ST5. **Conditional cells are gated per
sub-transect column** — e.g. the water module (B) is blocked (N/A) in any ST
column whose A4/A5/A6 is not Yes, and collapses entirely when no column has a
waterway; likewise D9–D13 need D8=Yes and G6–G8 need G5=Yes, each per column —
so a sub-transect can't record a riverbed where it reported no waterway. Cells
are a dropdown, tally, yes/no, or present/absent+count.

**Guided transect (training mode).** Without clan boundaries yet, the app
generates a random **100 m transect** near the surveyor: a **start point ≤100 m**
away on a random bearing, extended **100 m** along a random bearing to the end.
The app navigates the surveyor to the start with a **live compass** — the phone's
**magnetometer** (`DeviceOrientation`) when available, falling back to the GPS
course — showing direction + distance. Per `technical_specification.md §8.10`
the data-entry gate is **locked until the surveyor is within 30 m** of the start
(GPS-verified) and **cannot be bypassed**; the one allowance (per §6) is when the
GPS fix itself is coarser than 30 m, when a confirm is allowed but the record is
**`location_flagged`** for Zone-Staff review (the surveyor is not blocked). A
**fingerprint** then starts the survey and a **timer**. The
surveyor is then guided through the tape workflow: walk to the end (lay the
tape), survey back to the start, re-walk to the end to check, roll the tape back,
and close at the start. A **no-tape variant** guides the same walk by GPS
distance.

**End-point & close GPS gates.** Each step that requires physical arrival is
GPS-gated the same way the start is: the confirm button stays locked until the
phone is within 30 m of that step's target (coarse GPS is let through but
flagged). This closes the "I'm at the end" loophole — the button won't unlock
20 m from the start. The fix captured when the END is confirmed gives
`end_fix`/`end_dist_m` and **`end_gate_flagged`**; the fix on returning to the
START gives `close_fix`/`close_dist_m` and **`close_gate_flagged`**.

**Re-fingerprint at close.** Finishing the survey re-runs the WebAuthn
fingerprint check — the same enrolled surveyor must confirm the close.
`reverified_at_close` records that it passed; a save cannot complete without it.

**Review before finish.** The final step re-opens the filled matrix in a
read-back **review mode** (yellow banner, "Finish & save survey") so the surveyor
sees every answer — buttons and pills exactly as they left them — and can correct
anything before committing. The banner asks the surveyor to note unusual sites
(e.g. burned grassland read in one look, nothing to record) in **Comments (H)**,
so a legitimately fast/low-movement survey carries its explanation for the
coordinator. Finishing re-collects from the form (review edits kept) and requires
the re-fingerprint above.

**Breadcrumb / anti-gaming flags.** From arrival to close the app logs a throttled
**GPS breadcrumb trail** (points ≥ 4 m apart, coarse fixes dropped). At close it
derives, for **Zone-Staff review only** (never shown to the surveyor, never
blocking): `track_points`, `track_distance_m` (total walked),
`max_from_start_m` (farthest reached from the start), `min_to_end_m`,
`reached_end` (came within 30 m of the generated end). It raises
**`movement_flagged`** when the trail never reached the end, ranged less than half
the transect (< 50 m) from the start, or has too few points to judge — the signature
of someone who drifts a short way and stops. A **`time_fast_flagged`** marks a
survey closed in **under 12 min** (`MAFIA_MIN_MIN`) — implausibly fast for a real
100 m walk-and-record. A single **`review_flagged`** rolls up location / fast /
slow / movement for the coordinator's queue.

The saved record adds: `transect_start`/`transect_end` (lat/lon),
`transect_bearing`, `transect_length_m` (100), `had_tape`, `arrive_fix`,
`arrive_dist_m`, **`location_flagged`**, `end_fix`, `end_dist_m`,
**`end_gate_flagged`**, `close_fix`, `close_dist_m`, **`close_gate_flagged`**,
**`reverified_at_close`**, `duration_min`,
**`duration_excessive`** (true if > 60 min — too slow; ~30 min is normal),
**`time_fast_flagged`** (< 12 min — too fast), the breadcrumb fields above with
**`movement_flagged`**, **`review_flagged`**, and `compass_source`.

### 3.2 QABB — Butterfly Survey
Store `qabb`. Transect-based matrix: date, start/end time, and per-species
counts/entries across the transect stations, plus habitat/threat notes.

### 3.3 Conservation activities
Store `conservation`. Activity type: **Tree/Vine Planting** or **Invasive Weed
Removal**.

| Parameter | Options / units | Applies to |
|---|---|---|
| Date, time, site | — | all |
| Number of people | number | all |
| Photos | count | all |
| Notes | text | all |
| Species planted | list | planting |
| Number planted | number | planting |
| Seedling source | text | planting |
| Area planted | value + unit | planting |
| Weed species | list | weeding |
| Area cleared | value + unit | weeding |
| Method | text | weeding |
| Density before | text | weeding |

Planting activities auto-schedule **follow-up visits** (store `followups`).

### 3.4 Garden mapping — now part of Field Mapping
Cash-crop gardens are mapped in the unified **Field Mapping** module (store
`freemap`, `map_type:'area'`, `category:'cashcrop_garden'`): walk the boundary
(GPS polygon ≥3 points → **area_ha** computed), pick crops (vanilla / coffee /
cocoa / okari / massoy + other → `crops`), title, description, photo. EUDR
cash-crop reporting filters the map records by category. *(The legacy `gardens`
store holds any records made on the old standalone screen.)*

**Structured categories (store `freemap`).** Two Field Mapping categories carry
a structured sub-form in addition to the common title / description / photo /
GPS:

- **Plant problem** (`category:'plant_problem'`) → `plant_problem{ crop, problems[], severity, extent }`.
  `problems` is a multi-select of: Pest damage · Disease · Dried out / wilting ·
  Poorly pruned · Unharvested / overripe · Weed-choked · Nutrient deficiency ·
  Physical / storm damage · Poor spacing / crowding · Other. `severity` =
  Low / Medium / Severe; `extent` = A few plants / Many plants / Most / whole
  block. (Crop list includes food crops: taro, banana, sweet potato, cassava,
  yam, greens… + the cash crops + Other.)
- **Processing / sale prep** (`category:'postharvest'`) →
  `processing{ crop, stage, issues[], severity, quantity, unit }`. `stage` =
  Harvesting / Drying / Fermenting / Sorting-cleaning / Packing / Storage / At
  market; `issues` multi-select: Dirty / soil · Mixed with stones / debris ·
  Fungal / mould · Smoke contamination · Under-dried · Over-dried · Poorly
  packed · Insect-damaged · Discoloured · Off-smell · Other.

Both make crop-health and post-harvest-quality reports **countable** (vs. the
old free-text). Title auto-fills from crop + first problem if left blank.

**Track / path** (`category:'road'`, line mode) carries a required
**`track_type`**: Vehicle road — accessible · Vehicle road — rundown · Main
foot track · Garden track · Hunting track.

**Area records** store `area_ha` (4 dp) **and `area_m2`** (most mapped areas are
tiny, so the UI shows **m² under 0.1 ha**, hectares to 0.1 above), plus
**`close_gap_m`** — the distance from the last recorded point back to the first
(the area auto-closes; a large gap flags that the walker didn't return to the
start). A **live preview** draws the path as it's walked with a closure hint, and
saved line/area records have an in-app **View**.

### 3.5 Tree mapping
Store `trees`. Species (e.g. okari, massoy), latitude, longitude,
**DBH (diameter at breast height, cm)**, notes.

### 3.6 Weather Station (legacy single-station form)
Store `meteo`. The older combined form: rainfall (mm), gauge emptied, water
level (cm), flow condition, wind, recent rain, notes. (Superseded by the
per-instrument met registry in §2.4, which is kept alongside it.)

### 3.7 Training records
Store `training`. Type, topic, date, duration, trainer name & org, location,
participants (**female / male / youth** counts), materials, topics covered,
outcomes, follow-up, challenges, notes, **photo**, session mode.

### 3.8 Handover & Distribution
Store `distributions`. Logged by **field officers / Project / Zone staff** when
items are handed out. Uploads in the normal bundle (so it carries the standard
clock-trust stamp and is eligible for Date Review).

| Parameter | Options / type |
|---|---|
| Officer | name, steward ID, role (captured from profile) |
| Recipient | name/group · **type** (individual, clan group, women's/youth/church group, sports team, school, cooperative, other) · **received_by** (who physically took them, e.g. a group's representative) · clan · contact/village · **confirmed receipt** (yes/no) |
| Purpose | **category** (conservation planting, agroforestry, livelihood, training support, relief, other) + free-text description |
| Donor | **donor / funder** (European Union by default; list extensible, with free-text *Other*) · **donor_recognised** — the donor was named &amp; thanked to the recipients at the handover (yes/no) |
| Items (repeating) | **category** (Seeds, Seedlings, Tools, Equipment, Materials, PPE, Food/relief, Documents, Other) · description · **quantity** · **unit** |
| GPS | latitude, longitude, accuracy (m) |
| **Handover photo** | image (required) |
| **Receipt photo** | image (required) |
| **Video** | short clip of handover & receipt (required) + size |
| Fingerprint | officer's on-device verification (required to submit) |
| Notes | text |
| Date / clock | `date`, `device_time`, `clock_ok` (standard stamp) |

*Photos and the video are stored inline in the record and upload with Send Data.
Keep clips short (10–20 s) so they upload on slow signal; a very large bundle
falls back to the Android share sheet.*

---

## 4. Metadata on every new-module record

The water / facility / met / phenology readings also carry:

| Field | Meaning |
|---|---|
| `clan` | the recording steward's clan (drives one-reading-per-clan-per-month) |
| link to its registry item | `water_source_id` / `facility_id` / `met_station_id` / plant id |
| `photo` | the visit photo |
| `record_uid` | unique steward-prefixed ID (dedup on Drive) |
| `timestamp`, `synced` | when captured; whether uploaded |
| `device_time` | the raw device-clock time at capture (ISO) |
| `clock_ok` | **true** only if the device clock passed the sanity check at capture (in a plausible window **and** not behind the last server-verified time, with no "continue anyway" override). A **false** here means the date on that record may be wrong — the phone's clock was unverified. **Stamped on every data record across all modules** (`saveRecord`), so any submission taken on a bad clock is flagged for Date Review. |

> **Date integrity.** All dates come from the **device clock** (a web app cannot
> read true GPS/GNSS time — the Geolocation API's timestamp is itself the device
> clock). The app anchors to the server's UTC on every online contact, shows and
> stamps the **server-corrected** date when it can, warns at login if the clock
> looks wrong, and flags any record captured on an unverified clock via
> `clock_ok`.

---

## 5. What is reported today vs. not

- **Reported today:** activity/compliance only — per-steward upload counts,
  record counts, active days, module tallies, last upload (zone and MCF email
  reports).
- **Not reported today:** the **findings** in §2–§3 above. The values are
  captured and stored but nothing aggregates, trends, or presents them.

This catalogue is the input for deciding which of these parameters should flow
into findings reports, and at what granularity (per item over time vs. area
roll-up).
