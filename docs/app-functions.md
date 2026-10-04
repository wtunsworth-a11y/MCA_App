# MCA Steward App — Functions

**Capability list · Version 3 · October 2026**

A companion to [monitoring-parameters.md](monitoring-parameters.md): that
document lists *what the app captures*; this one lists *what the app does*,
grouped by who uses it.

---

## 1. Steward / field-officer functions

**Access & navigation**
- Log in with **fingerprint / face** (biometric, works offline — no password).
- Dashboard of module tiles; role-based visibility (e.g. Training shows only
  for authorised people).

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
- **Garden mapping** (GPS boundary polygons), **Tree mapping** (species, DBH).
- **Training records** (participants, outcomes, materials, photo).
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
- **Send Data** — upload all new records when online, or share a backup file
  (WhatsApp / USB) when there is no signal.
- **Storage Health** check (confirms data is protected from auto-deletion).

**Governance & self-service**
- **Meetings** — agenda, motions, and voting workflow.
- View own **Profile**, **Timesheet**, **Performance**, and cached **Reports**.

---

## 2. Coordinator functions

Reached behind the coordinator unlock (passcode + server key).

- **Enrol a new person** — set name, Steward ID, **clan**, zone, role, and
  register their fingerprints on their phone.
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
  `_pheno_plots`, `_calendar`, `_disturbances`, `_zones`, `_topics`,
  `_authorisations`) sync approvals and ownership between coordinators and down
  to steward phones.
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
- **Help registry** — `_help.json` holds coordinator-edited per-field help,
  overlaying the app's baseline; synced down to all phones.
- **Coordinator-key protection** — privileged approval actions require a server
  key held only in Apps Script properties.
- **De-duplication** — each record carries a unique steward-prefixed ID.
- **Reporting** — scheduled **weekly / monthly email** activity reports, plus
  live report endpoints (zone and MCF).
- **Map & export** — in-app zone map with activity layers; **KML / GPX export**
  of mapped points and tracks.

---

## 4. Not yet built

- **Findings reporting** — the monitoring *values* (water quality, service
  delivery, infrastructure faults, instrument function, phenophase, etc.) are
  captured and stored but not yet aggregated, trended, or presented. Current
  reports cover activity/compliance only. (See
  [monitoring-parameters.md §5](monitoring-parameters.md).)
- Clan-ownership gating for the pre-existing modules (MaFIA, QABB, conservation,
  gardens, trees) — currently only water, facilities, met and phenology are
  gated.
