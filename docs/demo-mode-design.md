# MCApp — Demo mode (for supporters & donors)

**Status: BUILT (app v134) · November 2026**

**How to open the Demo:** take the normal app URL and either append `?demo=1`
or use the `demo.html` launcher next to it (e.g. `…/prototype/demo.html`). It
opens straight to a demo dashboard — no enrolment, no fingerprint — with a
**DEMO** badge top-right. Nothing it does is ever uploaded.

A parallel **Demo** version of MCApp for showing the project to off-site
supporters and donors. Same look and feel as the real app, but with access
gating removed and **no real data ever written**. Primary focus stays the real
app; the Demo follows it.

## Why same repo, one codebase

The Demo is **not** a separate repo or a new role — it is the *same*
`index.html` with a single `DEMO` flag, deployed to a second URL. That is a
deliberate choice:

- **Identical visuals, for free** — same file, so colours, icons and layout
  match the real app by construction.
- **Updates follow automatically** — a change to the real app is inherited by
  the Demo; only the small demo-only branches need thought.
- A **role** can't do this: roles are assigned through coordinator enrolment
  (passcode + fingerprint), live inside one app instance, and wouldn't let you
  hold two installs or keep data apart. A **separate URL** gives dual-install,
  no enrolment friction, and a clean place to switch off gating.

The only separation that matters is at **runtime/deploy** (URL, storage,
uploads) — not in source control.

## How it works

- **One flag:** `DEMO` (true in the demo deployment). Every demo-only
  difference is a small guarded branch (`if (!DEMO) {…gating…}` /
  `if (DEMO) {…}`) co-located with the real code, so the real path is never
  weakened and the demo deltas are visible in context.
- **Second URL:** the same file served at `…/demo/` with the flag flipped.
- **Not a full PWA:** the Demo does **not** register the service worker and
  skips install/offline/fingerprint/GPS. Supporters just open a link in a
  browser. (A demo copy can still be kept on your own phone alongside the real
  app.)

## Locked decisions

1. **No backend writes — ever.** The Demo never uploads. The "upload" is a
   **dummy screen**: an upload animation + spinner, then a clear confirmation
   that **this is illustrative only and no data left the phone**. There is no
   demo endpoint and no demo Drive folder — nothing to leak.

2. **Read-only real layers shown on the map** (locations only, pulled from the
   real backend's GET registries — never raw survey records, photos or steward
   identities):
   - Government facilities
   - Water sources
   - Clan-steward collection points
   - Phenology trees *(when available)*
   - Livelihood projects
   - QABB transects *(when available)*
   - Weather / met stations *(when available)*

   Layers that aren't populated yet show an empty/"coming soon" state rather
   than an error.

3. **Storage: same-origin, namespaced.** Demo uses its own IndexedDB database
   and cache names (`MCA_DemoData`, `mcapp-demo-*`) so real and demo data never
   co-mingle on a phone that has both. (Hard origin isolation — a separate
   subdomain — is a later option if ever needed; not required now.)

## Demo-only screens

- **Dummy upload screen** — animation + spinner + "Illustrative only — no data
  left this phone."
- **MaFIA transect interstitial** — "Generating a random transect within your
  clan land" with a circling icon, showing a 100 m transect with 20 m
  sub-transects for ~3 s, then the data-entry screen.

## What's switched off in Demo

- **Location (GPS) gating** on data-entry screens.
- **Fingerprint / WebAuthn gating** for access.

Both are wrapped so the **real app's gating is untouched** — the demo only
*skips* them, it does not remove the code.

## Privacy & safety

- Nothing is uploaded, so no demo data can ever reach the real dataset.
- Shared real layers are **locations and registry metadata only** — no personal
  identities, no photos, no household/survey detail. The exact set of exposed
  fields is curated per layer before release.
- Partner-logo attribution rules still apply (per-piece, ask first).

## Maintenance model

- Real app is primary. Demo-only logic is minimal and co-located behind the
  `DEMO` flag, so "tracking both versions" is a light tax, not a fork.
- Build as its own branch off the real app; deploy to the `/demo/` path.

## Open / next steps

- Curate the exact fields each read-only layer exposes.
- Decide the Demo URL path and how your own phone holds both installs.
- Build after the current real-app priorities (e.g. the Wednesday bundle).
