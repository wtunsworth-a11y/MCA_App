# MCA App — To-Do List

Outstanding work and planned additions. Items that require action from outside
this repo (assets, decisions, accounts, field protocols) are grouped at the end.

*Last updated: 2026-10-12*

---

## Open threads (next up — Oct 2026 pilot)

These are the live threads from the current working session, recorded here so
they survive. Build state is on branch `claude/github-app-install-7irta9`, all
merged to `main` (Pages) through **SW v71 / `mca-steward-v71`**.

- [ ] **MaFIA no-tape / measure-method rework.** Replace the binary tape/no-tape
  toggle with a **measure method**: `knotted cord` · `tape` · `paced` · `none`,
  plus a **precision tag** on the record. Recommended standard kit is a **100 m
  knotted cord** (keeps the clean 5×20 m). When the method is `paced`/`none`,
  **collapse the five sub-transects** to coarser sections rather than fake 20 m
  bins (no fake spatial precision — mirrors the no-default-on-skip rule applied
  to *space*). Agreed with the user; not yet built.
- [ ] **Data & reports audit** (just raised): does everything uploaded so far
  work / parse / read, and can the Drive JSON files be turned into useful
  reports? Likely belongs in the parallel "data & reports" chat. Uploads land in
  Drive as `MCA_<stewardId>_<date>.json` per steward (zone/steward folders);
  records carry `record_uid` for dedup. Known good samples already reviewed:
  a MaFIA survey, a freemap `087`, and a handover (MCA-F06).
- [ ] **Receiving-end monthly off-Drive backup** (ops): phones drop media after
  1 month, so Drive is the single copy — duplicate to a second secure location
  monthly. See CLAUDE.md "Storage & retention". Backend/ops, not the app.
- [ ] Field mapping with screen **fully off** needs the **native wrapper** (see
  `upgrade-path.md`); the PWA keeps the screen awake but can't record locked.
- [ ] **Hunter interview module — DEFERRED (later).** Already specced below
  ("Monthly key-informant hunter interview"), noted with Rhett. Key point:
  **involves voice recording** — a new capability (the app does photos, not
  audio yet: needs audio capture + storage/upload). The Activity Calendar
  already has the `hunter_interview` event type, but no capture screen exists.
  When built, add it as a clan-steward compliance dimension in
  `reporting-spec.md` report A. Not now.
- [ ] **Zones & Clans governance module (to build).** Coordinator create /
  reallocate / merge zones+clans, forward‑only, with mandatory scanned community
  evidence and an append‑only audit log (coordinator ID + fingerprint + PNG time
  + community reference), surfaced in the annual report + searchable. **Gap to
  close first:** coordinator actions are currently gated by a *shared* key with
  no who/what/when log — needs enrolled‑identity + fingerprint attribution. Full
  spec in `governance-and-audit.md`.
- [ ] **Reference data to load before real clan stewards enrol** (see
  `deployment-prerequisites.md`): clan list per zone (`_clans.json`), clan
  boundaries per clan (`_clan_boundaries.json` — biggest gap), clan‑steward
  roster (`_roster.json`), recipient emails (`_recipients.json`).
- [ ] **Reports backend — go live.** The monthly/annual report jobs are built in
  `apps-script-upload.js` (reports A, H, I, J). To activate: set `_recipients.json`
  (`seedRecipients`) and `_roster.json` (`seedRoster`), run the trigger installers
  (`installClanComplianceTrigger`, `installAnnualComplianceTrigger`,
  `installMonthlyDistributionTrigger`, `installConsultantReportsTrigger`,
  `installFieldOfficerReportsTrigger`, `installWaterQualityTrigger`), and
  **redeploy the web app**.

---

## Current priorities (pilot)

- [ ] **Findings reporting** — the monitoring *values* are captured and stored
      but nothing aggregates/trends/presents them. Current reports are
      activity/compliance only. Design + build. See
      [monitoring-parameters.md §5](monitoring-parameters.md).
- [x] **Coordinator key — one-time setup** *(done 2026-10-10)* — current
      backend pasted into the Apps Script project, `setCoordinatorSecret()` run
      (key stored in Script Properties, blanked from source), redeployed as a
      new version of the existing Web App. Endpoint verified live
      (`{"status":"ready"}`) and matching the app's `UPLOAD_ENDPOINT`. Both
      coordinators enter the same key in the **Server Key** field to sync
      approvals. *(Live approve-and-sync test still to run on a phone.)*
- [ ] **Real-device testing** — camera, GPS, fingerprint (WebAuthn) and PWA
      install can't be tested headlessly; run through the flows on an Android
      phone before/with the pilot. *In progress — enrolling Matilda & Mellie.*

---

## Planned monitoring modules / surveys (requested 2026-10-04)

- [ ] **QABB (Queen Alexandra's Birdwing) survey — detail out.** Cadence:
      **once a year, in July.** Method: a **500 m transect** (here "transect"
      is right — it's a straight-line count) counting **adult QABB butterflies,
      caterpillars, eggs, and food plants** (the Aristolochia host vine).
      - **Mostly built already:** `screen-qabb-setup` (navigate-to-start +
        fingerprint gate) → `screen-qabb-matrix` records land-use, Aristolochia
        vine count and QABB sightings (adults / eggs / caterpillars) across
        **10 × 50 m sub-transects = 500 m**.
      - **Gap to close:** lock the cadence to **annual / July** (not monthly) in
        compliance + the calendar; use a **fixed transect location** re-walked
        each year (repeatability); confirm the four counts (butterflies,
        caterpillars, eggs, food plants) are all present and labelled clearly.
      - **Layout:** like the **MaFIA matrix** — a grid with **counters per
        sub-transect** (tally +/- for adults / eggs / caterpillars / food-plant
        per 50 m cell), not plain text fields. Align the existing QABB matrix to
        the MaFIA counter style where it isn't already.
      - Earlier note ("Christine method plus") — fold any extra protocol
        fields/steps in once that protocol is specified.

- [ ] **Monthly key-informant hunter interview** — a new monthly survey, one
      per key-informant hunter:
  - Trip this month? (yes / no)
  - Time spent
  - Method / tools used
  - Species seen
  - Species caught
  - Use of the meat: eaten · shared · gifted whole · sold
  - **Photo** (of the interview / interviewee)
  - **Short verbal recording** (audio snippet of the interview) to verify the
    interview actually took place. *New capability — the app currently captures
    photos but not audio; needs audio recording + storage/upload.*

- [ ] **Annual clan-household garden survey** — survey each clan household on
      **new gardens**: location, size, and age of fallow.

- [ ] **Annual cash-crop (agroforestry) upkeep & activity survey** — per
      cash-crop garden/plot, whether the household **opened, weeded, harvested,
      processed, and/or sold** crops. Includes **mapping of new gardens for
      potential EUDR reporting** (EU Deforestation Regulation — deforestation-
      free traceability for cocoa/coffee etc.).

- [ ] **Annual update of new cash-crop gardens** — register/update newly
      established cash-crop (agroforestry) gardens each year.

- [x] **Cash-crop garden mapping — owner + planting (done v86).** When mapping a
      cash-crop garden, now captures the **owner's name**, **home zone → clan**
      (clan ALWAYS from the picker, tiered to the owner's home zone), **village
      of residence**, and the **crop's first planting year** (+ approximate
      flag; asked plainly, no on-screen EUDR reason). Note the record keeps
      **two clans**: `clan` = the land's clan (the mapping steward), and
      `garden_owner.clan`/`.zone` = the **owner's own** affiliation — because a
      farmer may work land in a different clan/zone from their own.
- [ ] **Pre-load existing garden data to minimise re-mapping (future).** Sync
      down already-known gardens (from prior mapping / GIS) so the steward
      **confirms/updates** a garden rather than walking it again; pairs with the
      clan-boundaries / spatial-data work.

> These are survey/interview modules. Where they concern a specific
> thing (a garden, a plot), consider putting them through the same
> **register → coordinator-approve → clan-ownership → monitor** pattern already
> used for water sources, facilities, met instruments and trees, so ownership
> and anti-duplication carry over.

### Monthly work/pay cycle (built 2026-10-04)

- [x] **Two-part status — done AND sent** — status and compliance now
      distinguish *completed* (recorded on device) from *uploaded* (sent to the
      backend). The dashboard shows "Done & sent" vs "N to send"; the compliance
      report shows done vs uploaded and a pay-ready / hold verdict.
- [x] **Cycle deadlines** — complete by the **25th**, upload by the **28th**,
      pay processed by the **5th** of the following month (constants in
      `CYCLE`). Shown on the status card and in the compliance report so pay
      isn't held up to mid-month.
  - [ ] **Make deadlines coordinator-configurable** (currently fixed) and add
        an **on-time vs late** flag (completed/uploaded before vs after the
        cutoff), not just a count.

### Reward / incentive (idea — 2026-10-04)

- [ ] **On-time reward** — a zone that completes *and uploads* all its tasks on
      time could earn the right to **host the next combined forum** (within the
      existing alternate East/West hosting framework). Drive off the compliance
      report's pay-ready/on-time status per zone.

### Roles & community preparation

- **Clan stewards** do the fieldwork (the surveys/interviews/monitoring above).
- **Zone staff** prepare the community ahead of each activity — briefings so
  households/informants expect the visit.
- These roles should be reflected in the app (who sees what, whose task a
  briefing is vs. whose task the fieldwork is).

### Activity calendar, status page & reminders

**Decided architecture (2026-10-04):** one **unified, internal** calendar —
no Google accounts for stewards, no external calendar dependency. The schedule
is coordinator-defined and syncs down like the other registries.

- [x] **Unified activity calendar — v1 built** — one internal month-view
      calendar (dashboard tile) aggregating recurring monitoring (water/
      facility/met/phenology, derived) + scheduled events + conservation
      follow-ups, showing who (clan + role) / where (zone) / when (date) and
      whether it was done. Coordinator can **schedule activities and meetings**
      (serves as the meetings scheduler) with a zone-staff briefing flag.
      Includes a **compliance report** (planned vs done, % per activity). Synced
      via `_calendar.json`.
  - [x] **Recurrence / advance scheduling** — the Schedule form repeats an
        activity Monthly or Annually for N occurrences, laying out all the dates
        in advance (one instance per period, clamped to month length). Each
        occurrence stands alone: a missed month is counted as missed and is
        **never offered twice** the next month (monitoring already enforces one
        reading per clan per month). Occurrences share a `series_uid`.
  - [ ] **Grow it further** — link meetings to the Meetings module
        (agenda/quorum), let stewards mark their own survey/interview done (or
        auto-complete from the linked record), series editing/cancel, and a
        day/agenda view.
- [x] **In-app status page (home) — v1 built** — a calm, static traffic-light
      roll-up at the top of the opening page (dashboard): per module (Water,
      Service Delivery, Met, Phenology) it shows done/total and a green/amber/
      red state (on target / due / overdue), each row tappable to its module.
      Fully offline, rolls up the "done this month" data we already compute.
      No banners or animation elsewhere in the app.
  - [ ] **Grow it** — add the preparation checklist and the itemised "due now"
        list, and plug in the annual/scheduled survey due-dates once the unified
        calendar exists (overdue currently uses a last-month heuristic).
- [ ] **Notifications — PWA approach (accepted limits):**
  - **(1) In-app alerts while open** — reliable, offline. Use fully.
  - **(2) Best-effort background nudges (Periodic Background Sync)** — use
        where available; **accept that it is unreliable** (throttled, needs the
        PWA installed and occasional connectivity).
  - Truly reliable offline, app-closed, buzz-the-phone reminders are **not**
    possible as a PWA.
- [ ] **Future — native wrapper for reliable alerts** — when wanted, wrap the
      *same* web app in a **TWA (Bubblewrap) or Capacitor** shell: one codebase
      / one system, gains Android local-alarm scheduling (WorkManager/
      AlarmManager) for reliable offline reminders, plus Play Store install.
  - [ ] **Add GNSS clock as a date-integrity check.** A web app cannot read true
        satellite time, but the native shell can: read Android **`GnssClock`**
        (`LocationManager`, raw GNSS measurements → `getTimeNanos` /
        `getFullBiasNanos`) to get a device-independent UTC fix with no network,
        and feed it into the existing clock-trust layer as a third, strongest
        anchor (above the plausibility window and the server anchor). Would also
        let the warning show the *true* date offline, not just "looks wrong".
- **Roles:** zone staff do the human advance-warning layer (community
  briefings); the app's reminders back this up, they don't replace it.

---

## Mapping — consistency & basemap

- [x] **One consistent mapping look — v1 (visual family)** — Field, Garden and
      Tree mapping now share the same mapping identity (teal accent, matching
      intro boxes, card headings, GPS-capture cards and buttons), so they read
      as the same module.
  - [ ] **Deeper unification** — route them through a shared capture component
        (mode + category + title + GPS capture + photo + save/export), add the
        photo step to Garden/Tree, and bring the embedded GPS-capture steps in
        the Water/Facility/Met registrations into the same look.
- [x] **Real map screen (v1)** — Leaflet vendored locally; a pannable/zoomable
      Map tab with zoom/locate/layers/scale controls, OpenTopoMap (topographic)
      + OSM base layers, the **MCA boundary** (from the MCA_MLA repo) overlaid,
      and all recorded sites plotted. Leaflet + boundary precached (SW v6).
- [ ] **Offline basemap tiles** — base-map tiles are cross-origin so they load
      on-device/online only. Make them work offline, two options:
  - **Allowlist + pre-cache**: allow `*.tile.opentopomap.org` / OSM for the
    environment, then add a "Download this area" button that caches the MCA
    tile pyramid into CacheStorage/IndexedDB (and/or SW tile caching).
  - **Self-rendered raster from MCA_MLA data** (no external tiles): derive a
    hillshade/contours from the FABDEM DEM and/or a land-cover raster from the
    `outputs/*/landuse_*.tif`, reproject to EPSG:4326, and ship as a tile pack
    or image overlay. NB the present DEM tiles don't cover the southern half of
    the MCA (the S10E148 tile is missing) — source it or use land-cover.
- [ ] **Richer overlays from MCA_MLA** — optionally add rivers/watersheds
      (HydroBASINS), Oro Province boundary, and land-use-year layers as
      toggleable overlays.
  - **Free data sources:**
    - **OpenStreetMap** (ODbL) — roads, rivers, trails, place names; as raster
      tiles or vector tiles (PMTiles is a single file that renders client-side).
    - **Sentinel-2** (ESA Copernicus, free, ~10 m) — recent satellite imagery;
      excellent for seeing forest, gardens and rivers in a conservation area.
    - **Landsat** (USGS/NASA, free, ~30 m) — longer time series / fallback.
    - **SRTM / Copernicus DEM** (free) — terrain shading and contour lines.
    - Any existing MCF/CIFOR GIS layers (clan boundaries, zones) imported the
      same way.
  - **Avoid** Google/Bing/Esri imagery as an offline basemap — their licences
    restrict offline caching and redistribution; the open sources above do not.
  - Suggested pipeline: QGIS / `gdal2tiles` (raster) or `tippecanoe` + `pmtiles`
    (vector) to build the tile pack → load onto the phone → MapLibre/Leaflet
    renders it beneath the GPS points/lines.

## SDM timing, holidays & dashboard (in progress, v84)

- [x] **Public holidays on the Activity Calendar** — national PNG holidays
      (`_holidays.json`; client `getHolidays`/`DEFAULT_HOLIDAYS` cached like zones;
      backend `getHolidays`/`updateHolidays`/`seedHolidays`, GET `?action=holidays`,
      coordinator `update_holidays`). Shown as a month section: everyone-off
      (Christmas/Easter) = "No fieldwork", the rest = "Govt offices closed". No
      Oro provincial days. **Ops: run `seedHolidays()` and re-confirm each year
      against the National Gazette** (King's Birthday date especially).
- [x] **Facility visit closed-reason** — when a facility is partial/closed the
      steward records why (School holiday · Public holiday · Staff absent ·
      Facility problem · Other), so a holiday closure isn't mis-read as a failed
      service. Pre-fills "Public holiday" when the visit date is a known holiday.
- [ ] **SDM random-day scheduler + SDM on-time — DEFERRED.** Two random working
      days/month (tech-spec §8.7), year-round (no school-holiday exclusion —
      closures are noted, not pre-excluded). Blocked on the **facility register**
      + **clan boundaries** (to assign facilities to clans). On-time for SDM
      waits on this; until then SDM shows count-only in Performance.
- [ ] **Performance Monitoring overhaul — role-aware "My Month".**
      - **Phase 1 (DONE v85):** clan steward "My Month" — real per-module
        done/total + done/sent/pay-ready tri-panel (25th/28th cutoffs) + this
        month's effort tally, from the device's own records; field officer
        "What you did" tally (no targets yet). Replaced the hardcoded mock;
        oversight sees a phase-2 note + MCF Summary link.
      - **Phase 2 (later):** zone-staff **rollup of their clans** — needs
        cross-clan data on-device (backend/online), so it follows phase 1.
      - **Phase 3 (later — governance cadence "meetings held on time"):** track
        required meetings against their schedule:
        - **Zone Boards** — every **6 months**
        - **MCF Board** — every **3 months**
        - **Combined Forum** — **1/year**
        - **Zone Forums** — **2/year** (one **before** the CF, one **after**)
      - On-time = cutoff model (25th/28th) now; census/random-day on-time later
        with SDM.
- [ ] **Zone-staff awareness tracking + topic channel.** Zone staff should do
      **≥1 day/month of awareness** on focused topics. Needs (a) a compliance
      line for it, and (b) a **channel to push the month's awareness topic to
      zone staff** (coordinator-set, synced down like `_help.json`). Feeds the
      zone-staff cut of Performance.
- [ ] **Field-officer calendar — TBC** (who schedules; what's on it).
- [x] **Dashboard layout — grouped headers (done v84).** Tiles grouped under
      **Calendar / Activities / Reports**, role-aware (empty headers hide).
      Community Data hidden; Patrol greyed "SOON"; Performance Monitoring at the
      bottom of Reports.
- [ ] **Patrol module — TBC.** A **FIXED walking route** per clan (~8–10 km,
      where they have enough land), walked **once a month**. Fixed route chosen
      because it's **safer for the steward** (planned, known path) and gives a
      **repeatable observation** (same route and stations each month →
      comparable sightings/sounds over time). Model = register → approve →
      monitor, with guided navigation (reuse the MaFIA navigation code).
      **Call it a "patrol route", never a "transect"** — people read transect
      as a straight line and it will confuse them.
      - **Define the route once** — map the path (Field Mapping line),
        coordinator-approved, with **fixed observation stations** along it.
        Planned at design time to **pass sacred sites** (to check for
        disturbance + refresh the **red-band tree marking**) and stay **≥100 m
        from disputed areas** — so safety is baked into the route, not computed
        live.
      - **Monthly patrol** — follow the fixed route with guided navigation,
        stopping at each **fixed station** to record **sightings & sounds**
        (stations give clean month-to-month trends).
      - Optional **live ≥100 m disputed-area warning** as a backstop (warn,
        never block). Sacred-site / disputed layers (`_sacred_sites`,
        `_disputed_areas`) are **sensitive** → role-gated; useful for route
        design + the warning, but not a hard blocker once the route is fixed.

## Mapping consolidation (done 2026-10-13, v83)

- [x] **One mapping entry point** — retired the standalone **Tree Mapping**
      screen/tile (it duplicated phenology: same Okari/Massoy + GPS + DBH + notes,
      which phenology already registers with ownership/approval/monitoring on
      top). Collapsed **Field Mapping + Observations + Social Disturbance +
      Garden Mapping** into the single **Field Mapping** tile (its category
      picker already covers all four). Front screen loses 5 mapping-ish tiles,
      keeps one; Phenology stays its own (field-officer-hidden) tile. The `trees`
      store is retained so any existing tree records still sync/export/plot.
- [ ] **Phenology "register your trees first" reminder** (requested, not yet
      built) — when a clan has **no** phenology trees registered, show a prompt
      in the Phenology module pointing to its own **register/establish** step,
      and keep a running reminder ("n of N registered") until the clan reaches
      its allocated target (`phenoTargetFor`, default 5, coordinator-editable).
      *Open question:* reminder points at Phenology's own register step
      (recommended) vs relocating tree registration into the Mapping tile.
- [ ] **Economic-tree inventory survey — MAYBE, if needed.** A possible future
      module to map *all* economic trees (Okari nut / Massoy bark) across a few
      clans for **harvest/resource planning** — distinct from monitoring a
      phenology *sample*. Would be scoped fresh (map-many workflow), not a
      revival of the retired Tree Mapping screen. Only build if a real need
      emerges; limited to a few clans.

## Extend existing work (optional)

- [ ] **Clan-ownership gating for the older modules** — MaFIA, QABB,
      conservation, gardens, trees are not yet ownership-gated (only water,
      facilities, met and phenology are).
- [ ] **Remaining emoji** — a few domain pictographs (food/garden crops,
      animals, event/observation type pickers) are still emoji; convert if a
      fully uniform icon set is wanted.

---

## Content needed (from the project team)

- [ ] **Facility list** — real schools & health facilities within MCA clan
      territories (name, type, GPS) for registration/approval.
- [ ] **Species list** — for the biodiversity/QABB and hunter-interview modules
      (once protocols are defined).
- [ ] **School-holiday calendar** — PNG annual school holidays (SDM scheduling).
- [ ] **Committee quorum requirements** — minimum members per committee (Zone
      Sub-Committees ×11, MCF Board) to gate votes in Meetings.
- [ ] **PNG public holidays 2027** — confirm King's Birthday date via National
      Gazette (currently estimated ~10 June 2027).
- [ ] **Acknowledgements — page text** — full partner text (EU, CIFOR-ICRAF,
      Oro Provincial Government, MCF) incl. any EU co-funding disclaimer.
- [ ] **Acknowledgements — logos** — add the four partner logo PNGs to
      `prototype/assets/` (`logo-eu.png`, `logo-cifor.png`, `logo-oro.png`,
      `logo-mcf.png`). *Do not place logos anywhere without confirming
      placement/attribution first.*
- [ ] **Acknowledgements — permanence & layout** — which logos are hardwired
      (e.g. EU) vs admin-addable; final layout meeting EU branding rules.

---

## External services / accounts (if/when needed)

- [ ] **NASA FIRMS API key** — VIIRS near-real-time fire alerts
      (https://firms.modaps.eosdis.nasa.gov/api/).
- [ ] **Global Forest Watch (GFW) GLAD alerts** — confirm data-access terms.
- [ ] **Jitsi server** — self-hosted Jitsi Meet for Meetings video calls
      (e.g. DigitalOcean Sydney droplet). Decide when to set up.
- [ ] **Supabase / Firebase / DigitalOcean / Google Play** — only if moving
      beyond the current Google Apps Script + GitHub Pages setup (e.g. push
      notifications, app-store distribution).

---

## Done

- [x] **Pilot hardening** (2026-10-10) — see **[PILOT-STATUS.md](PILOT-STATUS.md)**
      for the full current-state handover. Highlights this round:
  - **Upload fix** — Send Data / approvals POST as `text/plain` with the secret
    in the body (the old JSON+header POST hit an Apps Script CORS preflight and
    silently fell back to the share sheet). `freemap` added to `DATA_STORES` so
    map records actually upload.
  - **Garden Mapping folded into Field Mapping** — new Area/garden mode (walk a
    boundary → hectares), Cash-crop garden category + crop picker; Observations
    also folded in; "Save" only (no auto-KML).
  - **Navigation** — phone back button steps back in-app; pull-to-refresh no
    longer reloads; Map/MCF-Summary/Coordinator screens reachable (bottom nav +
    Profile → Coordinator Tools / MCF Summary); mobile layout fills the screen;
    **PWA auto-update** on reopen.
  - **Roles** — "Project / MCF Staff" label; oversight (MCF/Zone staff) see all
    clans; training opened to field officers + oversight.
  - **Fingerprint hard-required** in the field; **Under Construction** page for
    Patrol/Community Data; **banner** → "PILOT TESTING".
  - **Zones** corrected to 1–6/7A/7B/8–10; reports read the saved config.
- [x] **Deployed & live** (2026-10-10) — feature branch merged to `main`;
      the app is served from GitHub Pages at
      `https://wtunsworth-a11y.github.io/MCA_App/prototype/index.html` (Pages
      confirmed on). Service-worker cache bumped so devices pull the fresh
      build.
- [x] **Observations folded into Field Mapping** (2026-10-10) — the old
      non-functional Observations mock-up is retired; its "Observations" tile
      now opens the real Field Mapping module, which carries all its incident
      types as working, syncing categories (Forest fire, Non-compliance, Social
      unrest, Wildlife sighting, Hunting event, Cultural event) plus a new
      **Crop pest / disease** category. Added an on-screen guide + a full Field
      Mapping help section.
- [x] **Fingerprint hard-required in the field** (2026-10-10) — the on-site
      verify gates now **fail closed**: a phone with no fingerprint sensor can
      no longer record a reading "unverified" — it is blocked. Login was
      already hard-closed. Installation Guide §6 documents PWA removal /
      full reinstall (Android + iPhone).
- [x] **In-app help system** (built 2026-10-04) — offline Help centre with the
      **Field Guide** (everyone) and **Administrator's Manual** (coordinator
      unlock only); a **?** in every screen header deep-links the right
      section; per-field **?** tips from a baseline overlaid by a Drive-synced
      **`_help.json`** (coordinator-editable, no redeploy); day-before
      "review the guide" nudge on upcoming calendar activities.
  - [ ] *follow-on*: populate per-field help for the remaining fields (framework
        is in place — each is one registry entry; content is the work, and the
        guides need deepening to field level first).
- [x] **Disturbance feed thresholds** (built 2026-10-04) — the >2 ha clearance
      gate and a fire size/power gate are applied **server-side before any task
      is created**; big-only fires via ~1 km clustering; an event overlapping
      two or more clans fans out to one independent task per clan.
- [x] **Disturbance verification** (built 2026-10-04) — satellite-detected
      fires, landslides and **>2 ha forest clearance** raised as clan-owned
      field-verification tasks. Server-side daily feed (NASA FIRMS live;
      GFW/RADD clearance wired via Earth Engine) → point-in-polygon routing to the owning clan (triage
      queue otherwise) → tasks load to stewards **on upload** → defensible
      on-site record (neutral outcome, cause recorded separately, geotagged
      photo, on-site fingerprint, area). Replaces the old static alerts mock.
  - [x] *done 2026-10-05*: **RADD clearance as single-event polygons > 2 ha** —
        Earth Engine script (`tools/radd_clearance_events.js`) extracts one
        polygon per contiguous clearing ≥ 200 pixels (10 m → 0.01 ha/px), one
        monthly run over the whole MCA; the backend reads the exported GeoJSON
        and the **split protocol** (`routeEventToClans`) tasks each overlapping
        clan independently, triage otherwise. Fire (FIRMS) still needs the key.
  - [ ] *follow-on*: **clan-boundary polygon pipeline** — stewards map clan
        boundaries via Field Mapping; publish them to `_clan_boundaries.json`
        so auto-routing goes live (until then, everything routes to triage).
- [x] **Water source registry** — register → approve → clan-ownership → monitor;
      natural (river/creek/spring) + **engineered** (reservoir/pipes, ram pump,
      solar pump, well) with two-part source + delivery checks.
- [x] **Government services (facilities)** — schools/health/aid posts with the
      same registry + ownership model and type-aware visit form.
- [x] **Met-station registry** — rain gauge / weather station / water level
      meter, catalogued + approved + ownership-gated, function monitoring.
- [x] **Phenology trees** — clan-ownership gate + coordinator Approve Trees.
- [x] **Clan-ownership model** — one owning clan, optional controlled split,
      one reading per clan per month, duplicate rejection; central sync via
      Drive registries.
- [x] **Inline-SVG icon system** — replaced emoji-as-icons across the app.
- [x] **Guides** — Installation, Administrator's Manual, Field Guide, plus the
      Monitoring Parameters and App Functions catalogues (in `docs/`).
- [x] **Earlier build queue** (pre-June items): Meetings creation/motion/voting
      flows, Recent Activity map with layers, Performance calendar, MaFIA
      matrix — present in the app.
