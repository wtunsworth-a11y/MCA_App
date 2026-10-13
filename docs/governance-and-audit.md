# MCApp — Zones & Clans governance and audit (spec — not yet built)

How structural changes to zones and clans are made, recorded, attributed and
reviewed. Captured so it's precise when built. **Not implemented yet** — in
particular, coordinator changes are **not currently attributed to an
individual** (see the gap below), which must be closed before coordinators make
live structural changes.

---

## Governing principle — forward‑only, history never rewritten

- **Registry changes are forward‑only.** When a zone or clan structure changes,
  **past records are never edited** — they are the true record of what was so at
  the time, keeping their **as‑recorded clan and zone**.
- **Retrospective re‑classification stays possible without rewriting anything.**
  Because every record also stores its **GPS coordinates** (and the as‑recorded
  clan/zone), any future re‑zoning or clan split/merge can be re‑analysed by
  **re‑running the spatial join on the stored coordinates** — from the originals,
  never by altering them. So forward‑only is both safe and reversible in
  analysis.
- Expected frequency: **rare**. Zone changes especially are not anticipated.

## What a coordinator can change (the module to build)

A coordinator **"Zones & Clans"** admin area:

- **Create / edit a zone** (zone editing exists today via Zone Config).
- **Create a clan** — adds it to a zone's list in `_clans.json`.
- **Re‑allocate a clan to another zone** (e.g. a new zone takes some clans).
- **Merge two clans** — one absorbs the other, **forward‑only**.

The app **records** the change; the **community authorises** it. A change is
**not accepted without the supporting evidence** (below).

## Every change is an auditable, attributed event

Each change writes an **append‑only** entry (the registry holds current state;
this log is the permanent history behind it):

```
{
  change_id,
  type,                 // create_zone | edit_zone | create_clan | reallocate_clan | merge_clan
  before, after,        // the exact diff (e.g. clan X: Z07B -> Z07C)
  coordinator_id,       // the ENROLLED coordinator who made it
  coordinator_name,
  fingerprint_verified, // biometric confirmation at the moment of change
  timestamp,            // PNG local time
  community_reference,  // short note: the community decision being recorded
  evidence_photos[]     // scanned/photographed community authorisation (>=1 required)
}
```

- **Attributed to a person, not "a coordinator."** Stamped with the signed‑in
  coordinator's **enrolled ID + name** and a **fingerprint confirmation** at the
  moment of change — same rigour as the field gates, so it is non‑repudiable.
- **Community evidence is mandatory** — one or more scans/photos of the written
  authorisation (multi‑page = multiple photos). These are governance records and
  are **retained** (Drive copy persists even after the on‑phone media purge).
- **PNG time**, like everything else shown to a human.

## Review & search

- **Annual report** carries a **"Zone/Clan change register"** section listing
  every structural change for the year.
- The full log is **queryable** — by zone, clan, coordinator or date — so a
  contested change can be interrogated precisely: who changed what, when, and on
  what community authority.

## The gap to close first (current state)

Today, coordinator actions (`update_zones`, `update_clans`, `update_roster`, …)
are gated by a **single shared coordinator key** and **overwrite** the registry
file — there is **no record of who changed what, when, or why**. Before
coordinators make live structural changes, this must become: **enrolled‑identity
+ fingerprint attribution** on every change, and an **append‑only audit log** as
specified above.

## Build order (when scheduled)

1. Audit log store + the attribution (coordinator ID + fingerprint) on every
   existing coordinator action.
2. The Zones & Clans admin UI (create / reallocate / merge) writing through that
   log, with mandatory evidence capture.
3. The annual "change register" section + the search/query view.
