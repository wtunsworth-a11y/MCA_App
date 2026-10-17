# Installing MCApp on a Redmi A2 (no fingerprint)

The A2 has no fingerprint sensor, so it uses the **face-photo** verification path.
It's the **same app** as every other phone — only the enrolment step differs.

## What you need first

- The **MCApp APK** file (from your build).
- Put it somewhere each phone can open — easiest is a **Google Drive folder**
  with a shareable link, so every phone just opens the one link and downloads.

## On each A2 phone

1. **Connect to the internet** (Wi-Fi or mobile data) — needed for install + the
   first launch.
2. Open the phone's **browser**, go to the **APK link**, and **download** it.
3. Open the downloaded file (tap it, or **Files → Downloads → MCApp.apk**).
4. If Android warns about **"unknown sources"**, tap **Settings → allow from this
   source** (or **Install anyway**), then **Install**.
5. Tap **Open**. Keep the phone **online** for this first launch so it loads the
   latest version.
6. **Enrol the steward** (coordinator does this):
   - Enter the **coordinator passcode** → fill in **name, ID, clan, zone**.
   - At **"Register Primary Biometric"**, the fingerprint won't take — tap
     **"Use a face photo to verify instead."**
   - The **front camera** opens → take a clear face photo of the steward → it
     saves and finishes.
7. **Done.** From now on the steward **logs in and verifies by taking a photo.**

## Check the first one worked

- App → **Profile** → build should read **`mca-steward-v98`** or higher.
  (If older: fully close the app and reopen once, online.)
- After the steward collects and syncs some data, a **`_gate_selfies/<steward-id>/`**
  folder appears in the Drive data folder — that's their audit trail.

## Notes

- The **A5s** (with a fingerprint) use the **same APK** — just skip the face-photo
  button at step 6 and register the fingerprint as normal.
- Updates are automatic: the app reloads the latest version on launch when
  online. You only reinstall the APK if the app **icon/name** changes, not for
  features.
- A face photo is an **audit trail, not a live lock** — reviewable, which a shared
  PIN is not.
