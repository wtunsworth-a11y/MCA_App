# Backend go-live checklist (Apps Script)

One-time steps to switch on the backend features that are already built in
`prototype/apps-script-upload.js`. Do these in the **Apps Script project** behind
the app's Web App URL. Nothing here changes the phones — it's all server side.

> **Golden rule:** after pasting new code, you must **redeploy a new version**
> of the Web App (Step 1C) or the phones keep talking to the old code.
>
> **No secrets in this file.** The coordinator passcode and server key are never
> committed — they live in the app and in Script Properties. This checklist only
> refers to them.

---

## 1. Always do this first — paste + redeploy

**A. Paste the latest code.** Copy the full contents of
`prototype/apps-script-upload.js` (from `main`) over the existing script in the
Apps Script editor. **Save.**

**B. (First time only) coordinator key.** Already done (2026‑10‑10). Only re-run
`setCoordinatorSecret()` if the key was lost/rotated — paste the key in that
function, run it once, then blank it out again and save.

**C. Redeploy the Web App.**
`Deploy → Manage deployments →` your existing **Web app** deployment `→` pencil
(edit) `→ Version: New version → Deploy`.

> This one redeploy is what makes fire reports, livelihood, and the enrolment
> roster start working. Do it after any code paste.

**How to run a function:** in the editor, pick the function name from the
dropdown at the top, press **Run**, and authorise if prompted (first run only).
Check **Executions / Logs** for the result.

---

## 2. Fire reports (NASA FIRMS satellite feed)

The app is already set up to show these; nothing appears until the feed runs.

1. Get a **free** key at <https://firms.modaps.eosdis.nasa.gov/api/map_key/>.
2. `Project Settings → Script Properties → Add script property`:
   - **`FIRMS_MAP_KEY`** = your key.
   - *(optional)* `FIRMS_DAYRANGE` (1–10, default 2), `FIRE_MIN_DETECTIONS`
     (default 3), `FIRE_MIN_FRP` (default 15), `CLEARANCE_MIN_HA` (default 2).
3. Run **`installDisturbanceFeedTrigger()`** once — installs a daily ~05:00 check.
4. Run **`fetchDisturbanceFeed()`** once now, so you don't wait until tomorrow.

With no clan boundaries loaded yet, detections land in your **Triage** queue —
you (as oversight) see them under **Alerts**.

---

## 3. Livelihood projects

1. Run **`seedLivelihood()`** once — writes `_livelihood.json` (the project types
   + sites). Edit the site list inside that function first if you want to adjust
   it (e.g. add the ~80 fish ponds once confirmed), or push changes later from
   the app.
2. Run **`installLivelihoodReportsTrigger()`** once — monthly per‑type PDF on the
   1st at 8am PNG.

After the redeploy (Step 1C), the **Livelihood Updates** screen's site picker
populates for Project Staff.

---

## 4. Enrolment roster ("Enrolled People")

**No installer needed** — just the redeploy in Step 1C. Once redeployed:

- Phones on **v92+** send a ping on enrol / login / profile change, and every
  data upload back‑fills the roster.
- `_enrolments.json` is created on the first ping.
- View it in-app: enrol screen → coordinator passcode → **Enrolled People**.

---

## 5. Registries worth seeding (optional but recommended)

Run each once; edit the values inside the function first where noted.

| Function | Writes | Notes |
|---|---|---|
| `seedHolidays()` | `_holidays.json` | PNG national holidays (already in the app as a fallback; seed so it's editable server-side). |
| `seedClans()` | `_clans.json` | Fill each zone's clan names **inside the function** first, then run. Drives clan pick‑lists + ownership. |
| `seedRoster()` | `_roster.json` | Expected clan-steward list for compliance denominators. Edit first. |
| `seedRecipients()` | `_recipients.json` | Report email recipients. Edit first. |
| `seedPhenoTargets()` | `_pheno_targets.json` | Per-clan phenology tree targets. Edit first. |

---

## 6. Monthly report triggers (optional — install when you want them emailing)

Each installs a time-based trigger. Install only the ones you want running now.

| Function | What it emails |
|---|---|
| `installMonthlyDistributionTrigger()` | Handover/distribution ledger + **per‑handover PDFs** (photo + media links). |
| `installLivelihoodReportsTrigger()` | One PDF per livelihood project type (see §3). |
| `installConsultantReportsTrigger()` | Per-consultant monthly summary. |
| `installFieldOfficerReportsTrigger()` | Field-officer monthly summary (to Matilda). |
| `installClanComplianceTrigger()` | Clan compliance rollup. |
| `installAnnualComplianceTrigger()` | Annual compliance (fire/deforestation dimension). |
| `installWaterQualityTrigger()` | Water quality trend report. |
| `installUploadActivityTrigger()` | **Weekly** "what has been uploaded" digest — per steward, record counts by activity type, latest upload. **No photos/video.** Mondays ~7am PNG. Run `uploadActivityReport()` from the editor any time for an on-demand copy (`'weekly'` default, or `'monthly'`/`'all'`). |

---

## 7. Market prices (world indicator for growers)

A world-market reference (coffee, cocoa, gold) with a vanilla **indicative**
figure you set. Keyless source — **no API key needed**.

1. Run **`seedPrices()`** once — sets a starter vanilla indicative figure and
   pulls the live markets into `_prices.json`. (Edit the vanilla number inside
   the function first if you like.)
2. Run **`installPricesTrigger()`** once — daily ~06:00 refresh.
3. Update the vanilla figure any time from the app: enrol screen → passcode →
   **Set Vanilla Price**.

After the redeploy (Step 1C), the **Market Prices** tile shows for everyone
(growers included). If a market shows no trend, run `pricesUpdate()` once by
hand and check the log — it keeps the last good data if a fetch fails.

---

## 8. Selfie verification for no-fingerprint phones (A2s)

**No installer needed** — just the redeploy in Step 1C. After that:

- Enrol an A2: on the biometric step, tap **"Use a face photo to verify
  instead."** It stores a reference photo and marks that phone selfie-verified.
- On selfie phones, login and every field gate capture a **face photo** instead
  of a fingerprint. Fingerprint phones are unchanged (strict biometric gate).
- Captures are queued offline and, on the next sync, written to
  **`_gate_selfies/<stewardId>/`** in Drive for your review (reference photo +
  each gate/login photo, tagged with the screen and time).
- It's an **audit trail, not real-time prevention** — reviewable, which a shared
  PIN is not.

---

## 9. Verify it worked

- **Fire reports:** open `…/exec?action=disturbances` in a browser → should be
  JSON with a `disturbances` array (may be empty until the feed finds something).
- **Livelihood:** `…/exec?action=livelihood` → JSON with `types` + `sites`.
- **Roster:** `…/exec?action=enrolments` → JSON `enrolments` array (fills as
  people on v92+ open the app online).
- **Market prices:** `…/exec?action=prices` → JSON with a `commodities` object
  (coffee/cocoa/gold/vanilla).
- **Selfies:** after an A2 enrolled with a face photo syncs, a
  `_gate_selfies/<stewardId>/` folder appears in the data folder.

If any of these returns an error or old data, you missed the **redeploy**
(Step 1C) — do it and re-check.

---

## 10. Rollout order (so it all lines up)

1. **Redeploy the backend** (Step 1) — switches on fire reports, livelihood, the
   roster, market prices and selfie audit together. Seed/install the extras you
   want (§2–§8).
2. Get phones onto the **latest build** (open online, close, reopen). Check the
   build number on the Profile screen (should read `mca-steward-v95`+).
3. Set **Will + Russell → Project Staff** (enrol screen → passcode → Update
   Profile → Role → Save). They then see **Livelihood Updates**.
4. On each **A2**: enrol → on the biometric step tap **"Use a face photo to
   verify instead."**
