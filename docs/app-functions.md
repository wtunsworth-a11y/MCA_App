# MCApp — Functions

**Capability list · Version 4 · November 2026**

A companion to [monitoring-parameters.md](monitoring-parameters.md): that
document lists *what the app captures*; this one lists *what the app does*,
grouped by who uses it.

---

## 1. Steward / field-officer functions

**Access & navigation**
- Log in with **fingerprint / face** (biometric, works offline — no password).
- **Consent at enrolment** — the person reads and agrees to a short consent
  screen explaining that the app uses biometric records to verify that the
  trained and paid person is the one doing the work; the agreement is recorded.
- Dashboard of module tiles; role-based visibility (e.g. Training shows only
  for authorised people; Livelihoods only for project staff).

**Register things to be monitored** (initial data-collection round)
- Register a **water source** (natural or engineered), **facility**, **met
  instrument**, or **phenology plant** — capturing type, GPS and a reference
  photo → submitted as *Pending Approval*.

**Monthly monitoring** (clan-owned, ownership-gated)
- See only **your clan's approved** items as tasks; record **once per clan per
  month** (items already done show *Done this month*).
- **Water Quality** — natural (river/creek/spring) and engineered
  (reservoir/pump/well, with source + delivery checks).
- **Service Delivery** — schools and health facilities.
- **Met instruments** — rain gauge, weather station, water level meter
  (function + readings).
- **Phenology** — phenophase and health per plant.

**On-site integrity checks** (water & met)
- **Navigate-to-site gate**: the reading unlocks only within ~30 m of the point.
- **On-site fingerprint verification** before a reading can begin.

**Other data capture**
- **MaFIA** forest-integrity survey, **QABB** butterfly survey.
- **Conservation** activities (planting / weed removal) with auto-scheduled
  **follow-up visits**.
- **Field Mapping** (unified) — Point / Line / **Area-garden**; categories cover
  ad-hoc observations (fire, landslide, pest/disease, non-compliance, wildlife…)
  **and cash-crop gardens** (area in ha + crops). Observations & Garden Mapping
  tiles both open it. Saves + uploads with Send Data (no auto-KML). **Tree
  mapping** (species, DBH).
- **Training records** with a **digital attendance register** — each
  participant captured by name, **gender**, age band (youth / middle / older),
  **clan** (zone-tiered pick-list + "Other"), village and an **on-screen
  signature**. Reports use the **counts only** (gender + age bands); names and
  signatures are held for audit. A **live camera photo is required** (an old
  gallery photo is rejected) and **GPS is captured automatically** so events
  can be mapped. If a session was arranged but **no one attended**, it can be
  recorded as a **no-attendance event** with a plain reason — still requiring
  the live venue photo + location — which is flagged for independent
  verification (see §3).
- **Observations** and **Patrols** (present as screens).

**Disturbance verification (clan-owned)**
- See **Disturbance Alerts** routed to your clan — satellite-detected fires,
  landslides and forest clearance (>2 ha) flagged for field checking.
- **Verify on site**: navigate-to-site + on-site fingerprint, then record a
  neutral **outcome** (confirmed / not found / inconclusive / couldn't reach),
  the likely **cause** separately (natural / human / unclear), a geotagged
  **photo**, measured area and a description. Record locks once sent.

**Help**
- **Help centre** (Field Guide) available offline; a **?** in every screen
  header opens the matching section, and per-field **?** tips explain
  individual fields. On an upcoming calendar activity, a "review the guide"
  nudge (emphasised the day before) opens the relevant section.

**Capture tools**
- Capture **GPS** location and take **photos** on-device.

**Data handling**
- Everything **saves offline**; forms auto-save drafts.
- **Send Data** — uploads records as **many small files with a progress bar**,
  one per record, so a weak link can resume where it stopped and the surveyor
  can watch each item complete. Each item is **idempotent** (a retry overwrites,
  never duplicates).
- **Full-quality media** — photos are sent as their own full-resolution files
  (no compression) into the steward's `media/` folder; **large video goes
  direct to Drive** via a resumable upload, so handover videos beyond the relay
  size limit still get through. Records keep a link to their media.
- **Storage Health** check (confirms data is protected from auto-deletion);
  warns on the dashboard when free space is low, and before a Handover when
  critical — warns, never blocks.

**Governance & self-service**
- **Meetings** — agenda, motions, and voting workflow.
- View own **Profile**, **Timesheet**, **Performance**, and cached **Reports**.

---

## 2. Coordinator functions

Reached behind the coordinator unlock (passcode + server key).

- **Enrol a new person** — set name, Steward ID, **clan** (chosen from the
  zone's clan list, or typed under "Other"), zone, role, and register their
  fingerprints on their phone. A **duplicate guard** warns if the name or ID is
  already enrolled, so a lost/replaced phone doesn't create a second identity.
- **Approve Water Sources / Facilities / Met Stations / Trees** — review each
  pending registration, **assign the owning clan** (and an optional second
  clan for a controlled split), or **reject** duplicates.
- **Triage disturbance alerts** — alerts that no clan boundary matched land in
  a triage queue; assign the responsible clan with one tap. (Alerts that fall
  inside a mapped clan boundary route to that clan automatically.)
- **Edit per-field help** — open any field's **?** and edit the text; it saves
  to the Drive-synced `_help.json`, so wording improves without a new release.
  Coordinators also get the **Administrator's Manual** in the Help centre.
- **Manage Zones** — edit the zone list.
- **Manage Clans** — maintain the per-zone clan list that feeds the enrolment
  and attendance pick-lists (currently 182 clans across 11 zones).
- **Manage Training Topics** — edit topics; flag which can be certified.
- **Grant Training Authorisation / Certify Trainer** — authorise a person to
  deliver a topic; record trainer certifications.
- **Update Existing Profile** — correct a person's details (e.g. clan).
- **Reports** — view zone and all-zones (MCF) activity reports.

---

## 3. Platform / system functions

- **Offline-first PWA** — installable to the home screen; loads and runs with
  no signal (service worker, stale-while-revalidate cache).
- **Local database** — IndexedDB (`MCA_StewardData`, v9, 24 stores) with
  **storage-persistence protection** so data isn't auto-deleted.
- **Biometric security** — WebAuthn, up to two credentials per device
  (e.g. two fingers) for backup.
- **Backend sync** — Google Apps Script web app writes records to Google Drive;
  shared **registries** (`_water_sources`, `_facilities`, `_met_stations`,
  `_pheno_plots`, `_calendar`, `_disturbances`, `_zones`, `_topics`, `_clans`,
  `_authorisations`, `_recipients`, `_livelihood`, `_prices`) sync approvals,
  ownership and reference lists between coordinators and down to steward phones.
- **Full-quality media + retention** — photos and video are stored at full
  resolution in each steward's `media/` folder (large video via a resumable
  direct-to-Drive upload). Records are kept in full on the phone for **~30 days
  after they sync** as a local fallback; after that a purge runs **only after a
  confirmed Drive upload**, stripping the heavy media but keeping the record's
  metadata. Unsynced records are never touched.
- **No-attendance verification** — a training event recorded as "arranged but
  no one came" is written to a `_verification_queue` and **emails the
  field-reports lead** one alert to confirm independently with the community;
  the alert carries the live venue-photo timestamp (PNG) and a GPS map link. A
  weekly digest lists any still open.
- **Disturbance feed** — a server-side daily job pulls **NASA FIRMS** active-fire
  detections (and, once provisioned, **GFW/RADD** forest-clearance) for the MCA
  area, routes each to the owning clan by **point-in-polygon** against mapped
  clan boundaries, de-duplicates, and raises verification tasks that sync to
  stewards **when they next upload** — no satellite access needed on the phone.
  - **Size/area thresholds applied server-side, before any task exists** — only
    "big" fires (cluster size / fire power) and clearances **≥ 2 ha** are
    tasked; the steward never decides whether something counts.
  - **Multi-clan events fan out** — a disturbance overlapping two or more clan
    boundaries raises one independent task per clan.
  - **Clearance = single-event polygons > 2 ha** — a monthly Earth Engine run
    (`tools/radd_clearance_events.js`) turns RADD alerts into one polygon per
    contiguous clearing ≥ 200 pixels (10 m → 0.01 ha/px); the backend overlays
    each polygon on the clan boundaries and tasks only the clan(s) it touches.
    Not a sum of scattered small clearings.
- **Help registry** — `_help.json` holds coordinator-edited per-field help,
  overlaying the app's baseline; synced down to all phones.
- **Coordinator-key protection** — privileged approval actions require a server
  key held only in Apps Script properties.
- **De-duplication** — each record carries a unique steward-prefixed ID.
- **Reporting** — scheduled **email** reports: weekly **upload-activity** and
  **field-maps (KML/GeoJSON)** export; monthly **field-officer**, **consultant**,
  **clan-compliance** (and **annual** compliance), **water-quality**,
  **livelihood**, **distribution-ledger** and **local-prices** reports; plus a
  weekly **no-attendance** digest. Recipients are held off-device in
  `_recipients.json`. Live report endpoints (zone and MCF) remain for in-app
  viewing.
- **Map & export** — in-app zone map with activity layers; **KML / GPX export**
  of mapped points and tracks.

---

## 4. Not yet built

- **Findings reporting** — the monitoring *values* (water quality, service
  delivery, infrastructure faults, instrument function, phenophase, etc.) are
  captured and stored but not yet aggregated, trended, or presented. The
  scheduled reports now cover **activity, effort and compliance** across people,
  zones and clans; topic-based **findings** PDFs (forest integrity, disturbance,
  management, livelihood) are in design but not yet generated automatically.
  (See [monitoring-parameters.md §5](monitoring-parameters.md).)
- Clan-ownership gating for the pre-existing modules (MaFIA, QABB, conservation,
  gardens, trees) — currently only water, facilities, met and phenology are
  gated.
