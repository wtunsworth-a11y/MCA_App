# MCA Steward App — Installation Guide

**For coordinators setting up phones · Version 3 · October 2026**

This guide covers getting the app onto a steward's phone and connecting the
Google Drive backend. For day-to-day coordinator operations see the
[Administrator's Manual](administrators-manual.md); for steward tasks see the
[Field Guide](field-guide.md).

---

## 1. What you need before you start

- An **Android phone** with a recent version of **Chrome** (the app is a
  Progressive Web App / PWA).
- The **app URL**: `https://wtunsworth-a11y.github.io/MCA_App/prototype/index.html`
- A **Google account** that owns the Drive folder where data will be stored
  (needed once, to deploy the backend).
- The **coordinator passcode** (held by the project coordinator — not written
  down in this repo).

> Fingerprint login, the camera, and GPS all require a real phone. They do not
> work in a desktop browser.

---

## 2. Deploy the Google Apps Script backend (once)

The phones upload records to a Google Apps Script web app that writes JSON
files to Drive. You only do this once (and again whenever the backend code
changes).

1. Go to [script.google.com](https://script.google.com) → **New Project**.
2. Delete the default code and paste the entire contents of
   [`prototype/apps-script-upload.js`](../prototype/apps-script-upload.js).
3. In **Project Settings** (gear icon) set the time zone to
   **Asia/Port_Moresby (UTC+10)**.
4. **Deploy → New deployment → Web App**
   - *Execute as:* **Me**
   - *Who has access:* **Anyone**
5. Copy the **web app URL**.
6. In [`prototype/index.html`](../prototype/index.html) set
   `var UPLOAD_ENDPOINT = 'PASTE_URL_HERE';` and commit/push so the deployed
   app picks it up.

**When you change the backend later**, deploy a **new version**
(*Deploy → Manage deployments → Edit → New version*). The URL stays the same.

### Coordinator server key (required — one-time, 2 minutes)

The privileged "approve / assign owning clan" actions
(`update_water_sources`, `update_facilities`, `update_met_stations`,
`update_pheno_plots`, `update_zones`, `update_topics`,
`grant_authorisation`, `certify_trainer`) are protected by a second key stored
in Apps Script **Script Properties**, never in the distributed app. Until it
is set, those actions are rejected with *"Coordinator key required"* and
approvals stay on one phone instead of syncing between coordinators.

Set it up once:

1. In the Apps Script editor, open the `setCoordinatorSecret()` function.
2. Replace `REPLACE_WITH_YOUR_COORDINATOR_KEY` with your chosen key (any
   strong string — the project coordinator holds it).
3. From the function dropdown choose **setCoordinatorSecret** and click
   **Run** once. You should see *"Coordinator secret set successfully."* in
   the log.
4. Blank the value back out (`'REPLACE_WITH_YOUR_COORDINATOR_KEY'`) so the key
   is never saved in source. It now lives only in Script Properties.

The two pilot coordinators then type this same key into the **Server Key**
field on the coordinator unlock screen. It is held in memory for that session
only and never written to the phone.

> **Keep the key out of this repository.** The whole point of Script
> Properties is that the key is not in the published app. Do not commit it.

---

## 3. Install the app on a steward phone

1. Open the **app URL** in Chrome on the steward's phone.
2. Tap the three-dot menu (⋮) in Chrome's top-right corner.
3. Tap **Add to Home screen** (or **Install app**), then **Add** to confirm.
4. Open the app **from the new home-screen icon** — not from a browser tab.

> **Why this matters — storage protection.** Installing as a PWA (Add to Home
> Screen) tells Android to protect the app's local data from being deleted
> when the phone runs low on space. A plain browser tab does **not** get this
> protection, so unsynced records could be lost.

---

## 4. Enrol the steward (coordinator present)

Each person's login must be created by coordinator staff on the steward's own
phone, so the fingerprints belong to the right person.

1. On first launch the app shows the **enrollment** screen.
2. Enter the **coordinator passcode** (and the server key, if you use one).
3. Fill in the steward's profile: **name, Steward ID, clan, zone, role**.
   - The **clan** is important — it determines which registered sources,
     facilities, instruments and trees that person will later be able to
     monitor (see the ownership model in the Administrator's Manual).
4. Register the steward's **fingerprint** (and optionally a second
   finger/face as a backup).
5. Hand the phone to the steward.

---

## 5. Verification checklist

On each newly set-up phone, confirm:

- [ ] The app opens from the **home-screen icon** and the Chrome address bar
      is hidden (confirms it is installed as a PWA).
- [ ] **Send Data → Storage Health** shows *"Data is protected"*.
- [ ] Fingerprint login works for the enrolled steward.
- [ ] The dashboard loads with **no internet** (turn off WiFi and mobile
      data, close and reopen — it should still open from cache).
- [ ] If online, **Send Data → Send All New Records** reports success (or
      "nothing to send").

### If storage shows "NOT protected"

The app was opened from a browser tab, not the home-screen icon. Close it,
reopen from the icon, confirm the address bar is hidden, repeat the *Add to
Home Screen* steps, then re-check Storage Health.

### If Send Data always fails

Check that `UPLOAD_ENDPOINT` is set in the app and the Apps Script is deployed
as the current version. Test the endpoint URL directly in a browser — it
should return `{"status":"ready", ...}`.

---

## 6. Removing and reinstalling the app (full reset)

Sometimes you need a clean reinstall — a stuck old version, a phone being
reassigned to a different steward, or enrolment to redo.

> ⚠️ **Send Data first.** Removing the app (or clearing its site data) deletes
> the phone's **local database** — any records not yet uploaded are lost, and
> the enrolled **fingerprint is removed**, so the steward must be re-enrolled.
> Open the app → **Send Data → Send All New Records** before you start.

### Android (Chrome)

1. **Send Data** (see the warning above).
2. **Remove the app icon** — long-press the MCA app icon on the home screen →
   **Uninstall** (or drag it to *Uninstall*). Alternatively: *Settings → Apps →
   MCA Steward App → Uninstall*.
3. **Clear the site's data** (this is the step that forces a truly clean
   reinstall — it clears the cached app, the local database and the stored
   fingerprint record):
   *Chrome → ⋮ menu → Settings → Site settings → All sites* (or *On-device site
   data*) → find **wtunsworth-a11y.github.io** → tap it → **Clear & reset**.
4. **Reinstall** — open the app URL in Chrome → **Add to Home screen / Install**
   → open it from the new icon.
5. **Re-enrol** the steward (coordinator passcode + fingerprint, §4).

### iPhone (Safari)

1. **Send Data** first.
2. Long-press the app icon → **Remove App → Delete App**.
3. *Settings → Safari → Advanced → Website Data* → find the site → swipe to
   **Delete** (or *Settings → Safari → Clear History and Website Data*).
4. Reopen the URL in Safari → **Share → Add to Home Screen** → re-enrol.

### Note — fingerprint is now required in the field

On-site readings (water, met, disturbance, and the other verify-gated forms)
**require a working fingerprint sensor**. A phone with no sensor, or where the
steward's finger isn't enrolled, can no longer record those readings — the
reading stays locked rather than being saved "unverified." Make sure each
steward is enrolled on a phone that has a fingerprint (or face) sensor.

---

## 7. Connectivity, updates & install troubleshooting

### What needs internet
- **Only the one-time install** (downloading the app from the HTTPS URL and
  caching it). After that it runs offline.
- **Enrolment** (passcode, profile, **fingerprint**) works **offline**; the zone
  list falls back to the built-in default with no signal.
- **Do the first setup with signal:** install → enrol → one **Send Data** — so
  the app fully caches, pulls the latest zones/registries, and you confirm the
  backend works. A **phone hotspot** can serve the one-time install to several
  phones.
- **You cannot copy the HTML to the phone and run it from `file://`** —
  fingerprint (WebAuthn) and the offline cache both require **HTTPS**. True
  file-copy/offline distribution would need a **native APK wrapper** (a future
  build).

### Getting the latest build
The app now **auto-updates**: it checks for a new version on launch and when you
return to it, and reloads once when the update is ready. If you're stuck on an
old build, **fully close the app** (swipe it from recent apps) and reopen. The
**reports** are cached separately — tap **Refresh** on the report screen.

### Install troubleshooting (Android/Chrome)
- **Only "Create shortcut", no "Install"?** Turn **Desktop site** off in the ⋮
  menu, reload, try again. (On recent Chrome the entry is "Install and create
  shortcut" — that IS the install.)
- **"This app is already installed / can't open it"** — an orphaned install
  record. Fix: Chrome → **Settings → Site settings → All sites →
  `wtunsworth-a11y.github.io` → Clear & reset**, then reinstall. (Safe — nothing
  else is stored at that site.) Reboot the phone if it persists.

### Backend redeploy (when the Apps Script code changes)
Re-paste `prototype/apps-script-upload.js` → **Save** → **Deploy → Manage
deployments → ✏️ → New version → Deploy**. The URL stays the same. **Do not run
`setCoordinatorSecret()`** — the key already lives in Script Properties and
redeploying never clears it; running that function would overwrite it.
