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

Each cell is a dropdown rating, a tally count, or a yes/no, plus free-text
comments. (Full indicator list: see `technical_specification.md`.)

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
