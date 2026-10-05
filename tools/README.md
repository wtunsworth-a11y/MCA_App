# MCA disturbance feed — tools

Server-side pieces that create disturbance-verification tasks. Nothing here
runs on steward phones; the app only ever reads the finished tasks.

## Forest clearance — `radd_clearance_events.js`

Turns RADD forest-disturbance alerts into **single-event polygons larger than
2 ha**, which is what gets field-verified. It is **not** a sum of scattered
clearings — one polygon = one contiguous clearing.

**The size test (as specified):**

```
RADD = Sentinel-1 @ 10 m   →  1 pixel = 100 m² = 0.01 ha
"> 2 ha single event"      →  ≥ 200 contiguous alert pixels  (2 ÷ 0.01)
```

The script masks RADD to the confidence + date window, keeps only pixels in a
connected patch of ≥ `MIN_PIXELS` (eight-connected, via `connectedPixelCount`),
vectorises each surviving patch to a polygon, filters each polygon's own area
≥ `MIN_HA`, and exports `_clearance_events.geojson`.

**One run covers the whole MCA** — there is no per-clan querying. Clan
attribution happens afterwards, locally, in the backend.

### Run it

1. Upload `prototype/vendor/mca_boundary.geojson` as an Earth Engine asset and
   set its ID in `AOI` (or use the bbox fallback in the script).
2. Paste the script into <https://code.earthengine.google.com> and run the
   export task. Output `_clearance_events.geojson` lands in the
   `MCA_Stewards` Drive folder (same folder the Apps Script backend uses).
3. **Monthly** is enough (RADD refreshes every few days; a month's window
   catches everything). To automate, run the same logic headless with the
   Earth Engine **Python API** + a service account on a scheduled job
   (cron / Cloud Scheduler) and `Export.table.toDrive(...)`.

Tunables at the top of the script: `MIN_HA` (2.0), `LOOKBACK_DAYS` (90),
`HIGH_CONF_ONLY` (true). Changing `MIN_HA` automatically changes the
contiguous-pixel count.

## The split protocol (who gets tasked)

Done in `apps-script-upload.js`, not here, so it works offline-first:

1. `fetchDisturbanceFeed()` reads `_clearance_events.geojson` (clearance) and
   the NASA FIRMS feed (fire).
2. For each event, `routeEventToClans()` overlays the event polygon on the
   clan boundaries (`_clan_boundaries.json`):
   - inside one clan  → one task for that clan;
   - **straddling two or more clans → one independent task per clan**;
   - inside none → the coordinator **triage** queue.
3. Each task is de-duplicated per clan, so a clearing is never raised twice,
   and synced down to the owning clan's stewards on their next upload.

The size/area threshold is always applied **before** a task exists (in Earth
Engine for clearance, in the fetcher for fire) — a steward never decides
whether a disturbance is big enough to count.

## Fire — in `apps-script-upload.js`

`fetchFirmsFires()` pulls NASA FIRMS (VIIRS + MODIS), clusters detections onto
a ~1 km grid, and tasks only "big" fires (`FIRE_MIN_DETECTIONS` or
`FIRE_MIN_FRP`). Needs a free `FIRMS_MAP_KEY` in Script Properties.

## Clan boundaries — `_clan_boundaries.json`

A GeoJSON FeatureCollection in the data folder; each feature's
`properties.clan` (and optional `.zone`) names the owner. Until it exists,
every event routes to triage. The app's Field Mapping module is how stewards
capture these boundaries.
