# MCApp — Upgrade Path (PWA → next stage)

**Planning note for when the team moves beyond the pilot · October 2026**

This records what carries over, what needs a planned migration, and how to
sequence the move from the current **PWA** to a native/app‑store build — written
so nobody has to rediscover it later.

---

## 1. The durable core (survives any next stage)

These are deliberately decoupled from the client shell and will outlive **any**
future app:

- **Data model** — JSON records with a steward‑prefixed `record_uid` for
  dedup, and the sync‑bundle format the app uploads.
- **Backend** — the Google Apps Script web app + Google Drive (registries,
  triage, date‑review, issues). The client talks to it over a plain POST.
- **Sync + retention** — upload‑then‑dedup, the 1‑month on‑phone retention, and
  **Drive as the source of truth**.

The "brains" of the system do **not** move. Only the shell around them changes.

---

## 2. The upgrade ladder (lightest → heaviest)

### Step A — TWA (Trusted Web Activity): wrap the current PWA as an Android app
The lowest‑friction step, and the one that **keeps everything you value**.

- Runs the **same web app at the same origin** (linked by Digital Asset Links to
  the GitHub Pages domain).
- **WebAuthn fingerprints + offline enrolment work identically** — same origin,
  so enrolled credentials and the whole registration flow carry over untouched.
- **IndexedDB data carries over** — same origin, same storage.
- Gains: Play Store / APK distribution, stronger install + storage protection.
- **Rework: essentially none.**
- **Does NOT fix:** background GPS (field mapping with the screen off) — a TWA is
  still web content, so the OS still suspends it when the screen is off.

### Step B — Capacitor (WebView + native plugins) or full native
Only needed when you want **background GPS, native camera/video, or push**. This
is where the real migration cost lands — and it is exactly two things:

1. **Biometrics change.** Leaving the Pages origin **breaks WebAuthn
   credentials** (they are origin‑bound), and a native shell uses the **native
   fingerprint prompt** anyway. Practically: a **one‑time, coordinator‑supervised
   re‑enrolment** of each steward. Because phones are **one‑per‑worker**, the
   native "device owner's fingerprint" ≈ the current "this steward's
   fingerprint", so the *experience* is unchanged — it's a re‑enrol, not a
   redesign.
2. **Local data doesn't cross the origin change.** IndexedDB is tied to the web
   origin, so a native/Capacitor app starts with empty local storage. Clean
   path: **sync everyone to Drive → migrate → pull back down.** The retention /
   sync model already supports this; the only risk is *unsynced* records, which
   the "send before you hand the phone over" habit covers.

### Step C — full native rewrite (Kotlin/Swift, React Native, Flutter)
Most work, cleanest native capabilities. The **data model and backend still
carry over**; the client UI/logic is rebuilt. Biometrics + storage become
native (simpler, more robust). Choose this only if the UI needs to grow well
beyond what a WebView comfortably holds.

---

## 3. The two worries, answered

- **Will offline registration get harder?** On a **TWA — no**, it is identical.
  On **native — it is re‑created and arguably simpler** (native biometric +
  native secure storage beats WebAuthn for fiddliness), at the cost of one
  supervised re‑enrol per steward. Either way, offline enrolment is **kept**.
- **Anything that would clash with an upgrade?** Only two things, both tied to
  **leaving the web origin**:
  - **WebAuthn credentials** (origin‑bound → re‑enrol on a native move).
  - **IndexedDB local data** (origin‑bound → sync‑before‑migrate).
  Everything else — schema, backend, sync, registries, coordinator‑key model —
  is portable.

---

## 4. What to keep doing now to protect the upgrade

- **Iterate in the PWA during the pilot.** Changes are instant (merge → Pages →
  phones auto‑update); a native app needs rebuild + redistribute. Lock the
  *behaviour* here while feedback is fast.
- **Keep Drive as the real source of truth** — never let anything that must
  survive live *only* in local storage (it won't cross an origin change).
- **Keep identity tied to the Steward ID in the profile**, with the fingerprint
  as the *gate* — this maps straight onto native biometric. (It already mostly
  is.)
- **Don't add features that depend on the specific Pages origin.**

---

## 5. Suggested sequencing

1. **Pilot + tweak as a PWA** — fast feedback; settle the feature set.
2. **Ship a TWA** for distribution + robustness — a free lunch, nothing breaks.
3. **Go native/Capacitor only when background GPS becomes essential**, with a
   planned **"sync‑all + re‑enrol"** cutover.

---

*The single biggest driver toward Step B/C is background GPS for long field
mapping — see the Field Mapping notes. Until that is essential, the PWA (and
then a TWA) covers the need with the lowest cost and no loss of offline
registration.*
