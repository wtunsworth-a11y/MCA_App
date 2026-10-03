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
