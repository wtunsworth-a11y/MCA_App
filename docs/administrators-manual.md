# MCA Steward App — Administrator's Manual

**For the project coordinator · Version 3 · October 2026**

This manual covers how a coordinator runs the app: approving what gets
monitored, assigning clan ownership, and managing zones, topics and training.
For first-time setup see the [Installation Guide](installation-guide.md); for
steward tasks see the [Field Guide](field-guide.md).

---

## 1. System overview

The MCA Steward App is an offline-first Progressive Web App (PWA) that runs on
steward phones. Records are held locally in IndexedDB and uploaded to a Google
Apps Script backend (which writes JSON files to Google Drive) whenever there is
signal.

- **Local database:** `MCA_StewardData`, IndexedDB **version 9**, 24 stores.
- **Backend:** Apps Script web app. The ping endpoint returns
  `{"status":"ready", ...}`. After any backend change, deploy a **new version**
  (*Deploy → Manage deployments → Edit → New version*); the URL does not change.
- **Shared registries on Drive** (new in Version 3):
  `_water_sources.json`, `_facilities.json`, `_met_stations.json`,
  `_pheno_plots.json`, plus the existing `_zones.json`, `_topics.json`,
  `_authorisations.json`.

---

## 2. Coordinator access

Coordinator functions live behind the **enrollment** screen's coordinator
unlock:

1. Open the app's enrollment screen.
2. Enter the **coordinator passcode** (held by the coordinator).
3. Enter the **coordinator server key** (set once via `setCoordinatorSecret()`
   — see the Installation Guide). It is held in memory for the session only.

Once verified you get the coordinator actions:

- ➕ Enrol New Person
- ⚙ Manage Zones
- 📋 Manage Training Topics
- ✏ Update Existing Profile
- 🎓 Grant Training Authorisation
- 💧 Approve Water Sources
- 🏫 Approve Facilities
- 🌧 Approve Met Stations
- 🌳 Approve Trees

---

## 3. The registry & clan-ownership model (new in Version 3)

Everything that gets monitored in the field — **water sources, government
facilities, met instruments, and phenology trees** — now follows the same
lifecycle:

```
Steward registers it  →  Pending Approval  →  Coordinator approves &
assigns the owning clan  →  it becomes a monthly monitoring task for that
clan only.
```

### Why this exists

Multiple clans used to claim the same facility (e.g. three clans all saying a
school is theirs), with six stewards all expecting to be paid to monitor it.
The ownership model fixes this:

- **One owning clan.** At approval, the coordinator assigns exactly one owning
  clan. **Only stewards of that clan** see the item as a task and can collect
  data on it. No one from another clan can wander in and do extra work
  uninvited.
- **Reject duplicates.** When the same thing is registered by two clans, the
  coordinator approves one and **rejects** the other.
- **Controlled split (optional).** When a shared facility genuinely justifies
  two independent readings, assign a **second clan**. Then the facility accepts
  **two readings per month — one per clan** (so you get two independent data
  points with a clear justification), and no more.
- **One reading per clan per month.** Once a clan records against an item for
  the month, it shows **"Done this month"** and cannot be recorded again by
  that clan until next month.

### The initial data-collection round

Before monitoring begins, stewards do a round of **registration**: they walk to
each water source / facility / instrument / tree, record its type, GPS and a
reference photo, and submit it. The coordinator then reviews each one, resolves
duplicates, and assigns the owning clan. Only approved items enter the
monitoring rotation.

---

## 4. Approval screens

Each **Approve …** screen lists every item currently **Pending Approval**
across all clans, with its reference photo, GPS, who proposed it and from which
clan. For each item you:

1. Set the **Owner clan** (defaults to the proposing clan).
2. Optionally set a **Second clan — controlled split** when a shared reading is
   justified; otherwise leave it as *None*.
3. Tap **✓ Approve**, or **Reject** to discard a duplicate or invalid entry.

Approvals are saved locally and (when online, with the coordinator key set)
pushed to the shared registry on Drive, so they sync to the other coordinator
and to steward phones.

| Screen | Approves | Types |
|---|---|---|
| Approve Water Sources | water points | River, Creek, Spring; Reservoir & pipes, Ram pump, Solar pump, Well/borehole |
| Approve Facilities | government services | School, Health Centre, Aid Post |
| Approve Met Stations | met instruments | Rain gauge, Weather station, Water level meter |
| Approve Trees | phenology plants | the five monitored crops (vanilla, cocoa, coffee, okari, massoy) |

### Natural vs engineered water

Water sources split into **natural** (river/creek/spring — assessed with
water-condition checks; rivers add a Secchi disc, creeks add pond skaters and
shading) and **engineered/manmade** (reservoir & pipes, ram pump, solar pump,
well/borehole). Engineered sources are checked at **two points**: the
**source** (flowing/present, clean & clear, contamination signs) and the
**delivery end** (water at the tap/outlet, leaks, damage, repair notes).

---

## 5. Zones, topics and training

### Manage Zones
Edit the zone list used at enrollment and in reports. Saved to `_zones.json`.

### Manage Training Topics
The topics field officers can be authorised to deliver. Tick **Cert** on a
topic to allow trainers to be certified in it. Saved to `_topics.json`.

### Grant Training Authorisation / Certify Trainer
Authorise a specific steward or field officer to deliver a specific topic
(certificate details required). Authorisations sync to the person's phone on
next login and unlock the Training tile. Trainer **certifications** (completing
a qualifying course so a person can deliver training, not just attend) appear
as 🎓 badges on the person's Profile.

> A coordinator-proposed topic submitted as free text is stored as **pending**
> until you add it as a proper topic in Manage Training Topics.

---

## 6. Where data lives on Drive

```
My Drive → MCA_Stewards/
  _zones.json              zone list
  _topics.json             training topics
  _water_sources.json      water registry (status + owning clan)
  _facilities.json         facility registry
  _met_stations.json       met instrument registry
  _pheno_plots.json        tree registry
  _authorisations.json     training authorisations (keyed by steward ID)
  [ZoneID_ZoneName]/
    [StewardID_Name]/
      MCA_[ID]_[Date].json  individual uploaded records
```

Registry files are keyed by a `uid` on each item; the coordinator's approval
overwrites the item's status and owning clan, and phones merge by `uid` on
their next sync.

---

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| Approval shows *"Coordinator key required"* | The server key isn't set. Run `setCoordinatorSecret()` once (Installation Guide §2). |
| Approvals don't appear on the other coordinator's phone | Both must be online; the approving phone needs the coordinator key set. Open the relevant Manage/Approve screen to pull the latest registry. |
| A steward can't see a facility they expect | Check the owning clan on the Approve screen matches their clan, and that the item is **approved**, not pending/rejected. |
| Duplicate of the same real-world thing | Approve one, **Reject** the other on the Approve screen. |
| Steward profile shows the wrong clan | Clan is set at enrollment and drives ownership visibility. Use **Update Existing Profile** to correct it. |
| Registry photo missing in an approval | The item was registered without a photo on an older build, or the photo didn't upload. Ask the steward to re-register. |

> **Pilot scope.** This build is sized for a 2-coordinator pilot. The ownership
> and approval controls are in place; wider rollout only needs the backend
> redeployed and the coordinator key distributed.

---

## 8. Roles, oversight & access (current)

**Roles** (set at enrolment): **Clan Steward** (own clan only — the paid
fieldwork), **Zone Staff** (oversight within/across zones; briefings), **Field
Officer** (own clan + can deliver training), **Project / MCF Staff** (project
oversight — not tied to a clan/zone; you, Mellie, Matilda, Josh). Enrol project
staff as **Project / MCF Staff**.

- **Oversight** (Project/MCF Staff, Zone Staff, or any coordinator-unlocked
  session) **sees every clan's items** so staff can supervise and test. Clan
  stewards see only their own clan.
- **Coordinator powers are gated by the server key, not the role.** The role
  decides what you *see*; the key decides what you can *change*. A project-staff
  member without the key can view but not approve.

**Reaching coordinator tools after enrolment.** Once you're enrolled, open
**Profile → Coordinator Tools** (visible to oversight roles) → enter the
**passcode + server key** → you get Enrol New Person, the **Approve** screens,
**Manage Zones**, Manage Topics, Grant Authorisation. **Profile → MCF Summary /
Reports** opens the all-zones report. (Previously these were only on the
first-run screen.)

## 9. Zones

The real list is **11 zones: 1–6, 7A, 7B, 8, 9, 10**. Edit it in **Manage
Zones** — your saved list (`_zones.json`) **overrides the built-in default** and
syncs to every phone **and** the reports. If a report still shows an old list,
the Apps Script backend needs the **current code redeployed** (its built-in
default is only used when no `_zones.json` exists).

## 10. Disturbance triage & training

- **Disturbance triage:** satellite-detected fires/clearances auto-route to the
  owning clan by boundary; anything with **no boundary match lands in your triage
  queue** (Disturbance Alerts) — assign the clan with one tap. Needs clan
  boundaries loaded to auto-route (triage-only until then).
- **Training delivery** is allowed for Field Officers, oversight (Project/MCF &
  Zone staff), and clan stewards **authorised for a topic** via Grant
  Authorisation. Zone staff default to *Awareness* sessions unless authorised.

## 11. Redeploying the backend

Re-paste `prototype/apps-script-upload.js` → **Save** → **Deploy → Manage
deployments → ✏️ → New version → Deploy** (URL stays the same). **Do not run
`setCoordinatorSecret()`** — the key is already in Script Properties and running
it would overwrite it. Redeploying **never** requires re-setting the key.
