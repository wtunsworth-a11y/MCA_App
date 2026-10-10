# MCA Steward App — Pilot Status & Handover

*Last updated: 2026-10-10. This is the single source of truth for **where the
project is right now** — deployment state, what works, what's stub, the roles,
and the operational procedures worked out during pilot setup.*

---

## 1. Deployment state

- **Live app (PWA):** `https://wtunsworth-a11y.github.io/MCA_App/prototype/index.html`
  served from **GitHub Pages** (branch `main`). Pages is **on** and serving.
- **Repo:** `wtunsworth-a11y/MCA_App`. Active dev branch
  `claude/github-app-install-7irta9`; **merged to `main`** continuously, so
  `main` is current and is what Pages serves.
- **Backend:** Google Apps Script web app (one project) at the `UPLOAD_ENDPOINT`
  baked into `prototype/index.html`
  (`…/macros/s/AKfycbxqEnJ1…JZR8XRg/exec`). **Deployed and verified**
  (`{"status":"ready"}`). **Coordinator server key is set** in Script Properties.
- **Service worker cache:** `mca-steward-v32` (bumped every deploy). The app now
  **auto-applies updates** on reopen (checks on launch + focus, reloads once when
  a new worker takes over) — no more "open twice".
- **Uploads fixed (v24):** Send Data and all registry/approval syncs POST as
  `text/plain` with the secret in the body — the old `application/json` +
  `X-Upload-Secret` header forced a CORS preflight Apps Script can't answer, so
  uploads silently fell back to the share sheet ("Share failed"). No backend
  change was needed. If data still won't send after updating, it's connectivity,
  not this.
- **Local DB:** IndexedDB `MCA_StewardData`, **DB_VERSION 13**, ~28 stores
  (adds `disturbances`, `issues`).

### ⚠️ Backend needs a redeploy (zone fix + server-time + date-review/issues)
The deployed Apps Script copy predates the zone-list correction, the new
`server_time` field in the ping response (used to catch a wrong device date,
§6a), **and** the `date_review` / `issues` endpoints (§6b). **Re-paste
`prototype/apps-script-upload.js` → Save →
Deploy → Manage deployments → ✏️ → New version → Deploy.** Do **not** run
`setCoordinatorSecret()` (the key is already stored; running it would overwrite
it). After redeploy, open **MCF Summary → Refresh**. (Redeploying never requires
re-running the secret.) Until redeployed, the clock check still works offline
via the plausibility window; it just has no server anchor to correct against.

---

## 2. Roles (enrolment dropdown)

| Value | Label | Sees | Notes |
|---|---|---|---|
| `clan_steward` | Clan Steward | **own clan only** | the paid fieldwork; needs clan + zone |
| `zone_staff` | Zone Staff | **all clans** (oversight) | community briefings; training = Awareness unless authorised |
| `field_officer` | Field Officer (Agric. Extension) | own clan + can **deliver training** | agronomy/extension |
| `mcf_staff` | **Project / MCF Staff** | **all clans** (oversight) | you, Mellie, Matilda, Josh; no clan/zone; lands on MCF Summary |

- **Oversight** = `mcf_staff`, `zone_staff`, or a coordinator-unlocked session
  (`isOversight()`), and it means **see every clan's items** so staff can
  supervise/test. Clan stewards stay restricted to their own clan.
- **Coordinator powers** (approve, enrol, Manage Zones, triage) are gated by the
  **server key**, *not* the role. Role shapes what you see; the key controls what
  you can change.
- **Training delivery:** field officers, oversight (Project/MCF & Zone staff),
  and clan stewards *authorised for a topic*. MCF staff were unblocked this
  session.

## 3. Zones

**11 zones: Zone 1, 2, 3, 4, 5, 6, 7A, 7B, 8, 9, 10.** Corrected in code
(`DEFAULT_ZONES` / `DEFAULT_ZONE_LIST`). Reports now read the saved config
(`loadZoneConfig` → `_zones.json`, else default). **Authoritative fix:**
coordinator → Profile → Coordinator Tools → **Manage Zones** → set the 11 →
Save (writes `_zones.json`, overrides everything, syncs to all phones).

---

## 4. What's functional (real data → Drive)

Enrolment + fingerprint login · Water Quality (natural + engineered) · Service
Delivery (facilities) · Met instruments · **Phenology (NPN phenophases +
markers + DBH)** · **Disturbance verification** · **Field Mapping (unified)** ·
Activity Calendar + compliance ·
Training · Send Data / sync · Help centre · **Date Review** · **Field problem
reports** · Coordinator approvals / Manage Zones / Grant Authorisation / reports.

### Unified Field Mapping (Observations + Garden folded in)
One module for all ad-hoc mapping. Modes **Point / Line / Area-garden**.
Categories: road, infrastructure, clan boundary, crop pest/disease, hazard,
forest fire, non-compliance, social unrest, wildlife, hunting, cultural,
**cash-crop garden**, other. Area mode walks a closed boundary (≥3 pts) and
gives **hectares**; cash-crop garden reveals the crop picker
(vanilla/coffee/cocoa/okari/massoy). Saves to the `freemap` store (now in
`DATA_STORES`, so it uploads with Send Data), carrying `garden_type`, `crops`,
`area_ha` for EUDR. Button is **Save** only (no auto-KML; per-record Export
remains). The dashboard "Observations" and "Garden Mapping" tiles both open it.

### Disturbance verification (satellite → clan field-check)
Server-side daily feed: **NASA FIRMS** big-fire clustering (needs a free
`FIRMS_MAP_KEY`) + **RADD forest-clearance** as single-event polygons **> 2 ha**
from an **Earth Engine** job (`tools/radd_clearance_events.js`, one run over all
MCA → `_clearance_events.geojson`). Thresholds applied **server-side before any
task exists**. Each event is overlaid on clan boundaries (`_clan_boundaries.json`)
and **tasks each overlapping clan independently**; none-match → coordinator
triage. Stewards field-verify with neutral outcome, cause-separate-from-fact,
geotagged photo, on-site fingerprint. See `tools/README.md`.

### Phenology (NPN phenophases + physical markers + DBH)
Phenophases now follow the **USA-NPN / Nature's Notebook** model: each visit the
steward taps **all phases present now** (multi-select) across **Leaves**
(budburst, young, mature, colored/falling, bare), **Flowers** (buds, open) and
**Fruit** (unripe, ripe, recent drop) — so budburst/leaf fall and simultaneous
phases are captured, not a single "stage". Each plant is **physically marked**
at establishment: **okari & massoy (trees)** get a **painted trunk band** (with
project staff) **+ a DBH baseline** (re-measured annually, which updates the
registry); **vanilla/cocoa/coffee (cash crops)** get a **numbered metal tag**
(= Plant #). A **photo is required at establishment** for all five; a
**monitoring photo is optional** (only if something to report). Stored in
`phenology` as a `phenophases` array (+ legacy `phase`), with `dbh_cm` and
`photo`.

## 5. Not built / stub (show "Under Construction")

- **Patrol** and **Community Data** → shared **Under Construction** page
  (`openUnderConstruction(name)`).
- **Meetings** — create/motion/voting partly real, but **Jitsi join / agenda /
  attendees are toast mock-ups** (Jitsi is a deferred external service).
- **Performance → Download Effort Report** — toast only.
- Leftover **hardcoded "Zone 7B" demo labels** (~21) and demo GPS in the old
  **MaFIA/QABB** screens — cosmetic cleanup still pending.

## 6. Security model (unchanged, enforced)

- **Fingerprint (WebAuthn)** is real and now **hard-required in the field** —
  a device with no sensor is **blocked** from on-site readings (was fail-open).
  Login was always hard-closed.
- **Coordinator passcode** `T@nkF1y` (sha256 in app) gates enrolment — **keep it
  out of the repo**. **Server key** lives only in Script Properties — never
  committed, typed in per session.

## 6a. Date integrity (clock trust)

Records are only as trustworthy as their date, and a web app **cannot read true
GPS/GNSS time** — `navigator.geolocation`'s timestamp is the *device clock*, not
the satellite signal, so GPS can't independently verify the date offline (true
GNSS time needs the native wrapper). Defence in three layers:

1. **Plausibility window** — the date must sit in a believable range
   (`2026-01-01 … 2031-01-01`); a clock reset to 1970/2016 or set far ahead is
   caught **offline, with no anchor needed**.
2. **Trusted anchor** — the latest server-verified UTC (`server_time` from the
   ping) is stored on the phone. The clock must not run **before** it (time only
   moves forward) nor ~1 yr **after** it. Refreshed on launch, on login, and
   whenever the phone comes online.
3. **Server-corrected display/stamp** — when online, the app computes an offset
   and shows/stamps the **true** date even if the device clock has drifted.

At **login** a blocking **"Check your phone's date"** warning appears if the
clock fails, telling the steward to turn on *Settings → Date & Time →
Automatic/Network*. They can re-check after fixing, or **Continue anyway**, which
flags every record with `clock_ok:false`. **Every data record across all
modules** carries `device_time` + `clock_ok` (stamped centrally in `saveRecord`),
so any submission taken on an unverified clock — not just phenology — is caught
and routed to Date Review.

## 6b. Date review & field problem reports

**Date Review (coordinator).** A record stamped `clock_ok:false` can still be
dated at upload, because the upload happens online: the true capture instant is
bracketed by **[last verified-online time … upload time]**. If both ends fall in
the **same calendar month**, the month is **known** (all monthly monitoring
needs); if they straddle, it's flagged **month-uncertain**. At each online **Send
Data**, flagged records get this bracket (it also rides into the record on Drive)
and are posted to `_date_review.json`. Coordinator Tools → **Date Review** lists
them with the bracket and a month-known / month-uncertain badge; the coordinator
**confirms or corrects the date and accepts** (or rejects) — the data is kept,
only the date is reviewed. Decisions are keyed by record uid in the registry.

**Report a Problem (steward → coordinator).** A steward blocked by a bug (e.g.
the date warning won't clear) can **Report a Problem** from their Profile, from
the clock warning itself, and anywhere via that screen. They write what happened
and attach a **screenshot** (phone screenshot → attach); the app auto-captures
context (screen, phone date, `clock_ok`, online state, build, steward). It saves
to the `issues` store **offline** and uploads with the next Send Data (or
immediately when online) to `_issues.json`. Coordinator Tools → **Issue Reports**
shows open reports with their screenshot and context, and a **Mark resolved**
action. So an honest app failure never means lost work — the evidence still gets
in. *(Screenshots are the phone's own; the app doesn't auto-capture the screen.)*

## 7. Operational how-tos (worked out this session)

- **Install needs internet once** (download from the HTTPS URL + cache).
  Enrolment itself (passcode, profile, **fingerprint**) works **offline**;
  zones fall back to the built-in list offline. Do the first setup **with
  signal** (install → enrol → one Send Data) then it runs offline. A **hotspot**
  can serve the one-time install to many phones.
- **You can't sideload the HTML to `file://`** — fingerprint (WebAuthn) and the
  service worker both need **HTTPS**. True file-copy/offline distribution = a
  **native APK wrapper** (TWA/Capacitor), a future build.
- **PWA install gotchas:** turn **Desktop site** off; "already installed / can't
  open" = an **orphaned WebAPK** → clear the site's data (Chrome → Site settings
  → the site → Clear & reset) then reinstall (safe — MCF Hunt has no data). The
  app has a distinct manifest `id` now so it no longer collides with MCA Hunt.
- **Getting the latest build:** fully close & reopen (auto-update handles the
  rest). Reports are separately cached — tap **Refresh**.
- **Redeploy backend:** paste current `apps-script-upload.js` → Save → new
  version. Key untouched.

## 8. Still open / next

- [ ] **Populate `KNOWN_IDS`** (in `prototype/index.html`) with the existing
      Steward/Officer IDs **before enrolling the field officers** — the offline
      duplicate check at enrolment uses this shipped list to block clashes.
      Convention `MCA-<Zone>-<NN>`; field officers use an `MCA-FO-NN` block,
      issued by one person to avoid concurrent-creation clashes. (Mechanism +
      live check are built; just needs the real IDs pasted in. A synced
      people-roster is a later enhancement.) See Admin Manual §11.
- [ ] **Redeploy backend** (zone fix + `server_time` clock anchor) + Manage
      Zones save.
- [ ] **FIRMS_MAP_KEY** + daily trigger (`installDisturbanceFeedTrigger`) to turn
      the fire feed on; **GFW/RADD** Earth Engine run on a schedule.
- [ ] **Clan-boundary polygons** (`_clan_boundaries.json`, via Field Mapping
      clan-boundary captures) so disturbance auto-routing goes live (triage
      until then).
- [ ] **Per-field help content** (framework in place; content to write).
- [ ] **Offline basemap** for the mapping screens.
- [ ] Cosmetic cleanup of the **Zone 7B / demo-GPS** labels in MaFIA/QABB.
- [ ] Decide scope of **Patrol / Meetings (Jitsi) / Performance export**.
- [ ] **Findings reporting** — monitoring *values* are stored but not yet
      aggregated/presented (biggest unbuilt analytical piece).
- [ ] Future: **native wrapper** for reliable offline reminders + file-copy
      install; **hunter-interview audio capture**.

## 9. Guides in `docs/`

`installation-guide.md` (coordinator phone setup), `administrators-manual.md`
(coordinator ops), `field-guide.md` (steward tasks), `monitoring-parameters.md`
(what's captured), `app-functions.md` (what the app does), `TODO.md` (backlog),
and this file. The in-app **Help centre** mirrors the Field Guide (everyone) and
the Administrator's Manual (coordinator unlock only) — on-screen, offline, in the
app itself (no PDF needed on the phone).

**Printable handout:** `docs/field-guide.pdf` (A4, 3 pp, logo-free) is a
training-day handout generated from `docs/field-guide-print.html`. It is a
standalone file (not bundled in the app). Regenerate after editing the guide:
render `field-guide-print.html` to A4 via headless Chromium
(`page.pdf({format:'A4', printBackground:true})`).
