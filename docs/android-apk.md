# MCApp — Android APK (the real fix for the field phones)

**Why:** some of the field phones (e.g. **Redmi A5**) run a Chrome that never shows
"Install app / Add to Home screen" — the Google Play component that mints installed
PWAs is missing, and updating Chrome/Play services does **not** fix it. So Chrome's
install button is not a reliable way to get an icon on 100+ identical phones.

**The fix:** a small signed **APK** (a Trusted Web Activity). It is a normal Android
app with a **home-screen icon**; tapping it opens the **live app at the same web
address**, so **fingerprints and all stored data carry over** (no re-enrolment,
nothing rebuilt). It does **not** use Chrome's install button, so it works on every
phone. You build it **once** and install the same APK everywhere. Because it loads
the live site, future app changes still reach phones automatically.

---

## Build it (once, on a laptop or entirely in GitHub)

### 1. Make a signing keystore (once — keep it safe forever)
The **same** keystore must sign every future build, or phones reject the update.

```bash
keytool -genkeypair -v -keystore android.keystore -alias mcapp \
  -keyalg RSA -keysize 2048 -validity 10000
```
Answer the prompts; remember the **two passwords** you set.

### 2. Add three GitHub repository secrets
Settings → Secrets and variables → Actions → New repository secret:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | output of `base64 -w0 android.keystore` (one line) |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password from step 1 |
| `ANDROID_KEY_PASSWORD` | the key password from step 1 (often the same) |

### 3. Run the build
GitHub → **Actions** tab → **Build MCApp APK** → **Run workflow**. When it finishes,
download the **MCApp-signed-apk** artifact — that's `app-release-signed.apk`.

*(No laptop? Everything except step 1 is in the browser. Step 1 can be done once by
anyone with a laptop, or in a throwaway Codespace.)*

---

## Put it on the phones

**Per phone (no laptop):** copy `app-release-signed.apk` onto the phone (USB, SD card,
or download it once), tap it in Files, allow "install from this source" when asked →
it installs and the **MCApp icon** appears. Hand the phone over.

**Faster with a laptop (USB):**
```bash
adb install app-release-signed.apk      # one phone
```
Repeat per phone, or script it over several connected phones.

---

## Optional: remove the little address bar (full-screen)

Without this, the app still opens from the icon but shows a thin URL bar at the top.
To make it fully full-screen, publish a **Digital Asset Links** file at the **domain
root**:

1. The build log (step 3, "Print signing fingerprint") prints a **SHA256:** value.
2. Put it into `android/assetlinks.template.json` (replace the placeholder) and host
   that file at **`https://wtunsworth-a11y.github.io/.well-known/assetlinks.json`**.
   On GitHub Pages the domain root is served by a repo named
   **`wtunsworth-a11y.github.io`** — create it (if it doesn't exist) with
   `/.well-known/assetlinks.json`.
3. Reinstall the APK. The bar is gone.

This step is cosmetic — the icon and the app work without it.

---

## Capability set baked into the first APK (decided)

Adding a capability later means re‑pushing all 100 phones, so the first APK
declares everything foreseeable up front (over‑declaring is cheap; re‑touching
the fleet is not):

- **Location delegation — MUST.** The app is GPS‑everywhere; in a TWA the web
  Geolocation API only works if the APK enables location delegation
  (`locationDelegation.enabled` in `twa-manifest.json` → adds
  `ACCESS_FINE_LOCATION`). Without it, GPS silently breaks across the app.
- **Notifications — enabled now for future push.** `enableNotifications: true`
  leaves the door open for *online* server push later with no rebuild. It does
  **not** turn push on by itself, and note: **offline** today/tomorrow reminders
  do **not** use push — they're the on‑open banner in the web app. A proactive
  **offline** alarm needs the native wrapper (AlarmManager), beyond TWA.
- **Microphone (for in‑page hunter‑interview voice) — confirm at build.** Not a
  `twa-manifest.json` toggle. In a TWA, mic/camera capture is usually mediated by
  Chrome and needs **no** APK permission; if a build+test shows in‑page recording
  is blocked, add `<uses-permission android:name="android.permission.RECORD_AUDIO"/>`
  to the generated `app/src/main/AndroidManifest.xml` before building. (Or sidestep
  it entirely with the system‑recorder intent — see the hunter‑interview note in
  `TODO.md`.)

What this covers: the whole roadmap **except background GPS** (screen‑off long
mapping), which needs the native step no matter what.

## Notes

- **Package id:** `org.managalas.mcapp` (fixed — changing it makes a different app).
- **Data & biometrics carry over** because the APK loads the same origin
  (`wtunsworth-a11y.github.io`). This matches the "TWA" step in `upgrade-path.md`.
- Keep `android.keystore` and its passwords backed up safely — losing them means you
  can't ship signed updates (you'd have to uninstall + reinstall a new app on every
  phone).
