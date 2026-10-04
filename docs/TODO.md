# MCA App — To-Do List

Outstanding work and planned additions. Items that require action from outside
this repo (assets, decisions, accounts, field protocols) are grouped at the end.

*Last updated: 2026-10-04*

---

## Current priorities (pilot)

- [ ] **Findings reporting** — the monitoring *values* are captured and stored
      but nothing aggregates/trends/presents them. Current reports are
      activity/compliance only. Design + build. See
      [monitoring-parameters.md §5](monitoring-parameters.md).
- [ ] **Coordinator key — one-time setup** — run `setCoordinatorSecret()` once
      in the Apps Script editor, then redeploy the backend as a new version, so
      approvals sync between the two pilot coordinators (option 2). See
      [installation-guide.md §2](installation-guide.md).
- [ ] **Real-device testing** — camera, GPS, fingerprint (WebAuthn) and PWA
      install can't be tested headlessly; run through the flows on an Android
      phone before/with the pilot.
- [ ] **Open the pull request** for `claude/github-app-install-7irta9` when
      ready for review/merge.

---

## Planned monitoring modules / surveys (requested 2026-10-04)

- [ ] **QABB transect — "Christine method plus"** — extend the existing QABB
      butterfly survey to the Christine-method protocol plus the additional
      fields/steps. (Protocol detail to be specified.)

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

> These are survey/interview modules. Where they concern a specific
> thing (a garden, a plot), consider putting them through the same
> **register → coordinator-approve → clan-ownership → monitor** pattern already
> used for water sources, facilities, met instruments and trees, so ownership
> and anti-duplication carry over.

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

- [ ] **Unified activity calendar** — a single internal schedule of when each
      activity is due (monthly, annual, seasonal) per clan/zone. Consolidates
      the existing SDM monitoring days, conservation follow-ups, and the
      monthly/annual cadence of the monitoring modules.
- [ ] **In-app status page (home)** — the first thing a steward sees:
      a **traffic-light summary — on target (green) / required soon (amber) /
      overdue (red)** — with the list of what's due and the preparation
      checklist (charge phone, get equipment, advise clan elder, arrange the
      informant/household). Fully offline. Can start by rolling up the
      "done this month" status we already compute per owned item, then grow as
      the calendar is built.
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
- **Roles:** zone staff do the human advance-warning layer (community
  briefings); the app's reminders back this up, they don't replace it.

---

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
