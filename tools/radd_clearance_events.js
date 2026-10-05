/* ──────────────────────────────────────────────────────────────────────────
 * MCA disturbance feed — forest-clearance EVENT polygons (RADD, > 2 ha)
 * Google Earth Engine script (paste into https://code.earthengine.google.com)
 * ----------------------------------------------------------------------------
 * Produces ONE polygon per discrete forest-clearance event larger than the
 * threshold — not a sum of scattered clearings. The size test is done the way
 * you specified: area-per-pixel × contiguous-pixel count.
 *
 *   RADD is Sentinel-1 at 10 m  →  1 pixel = 100 m² = 0.01 ha
 *   "> 2 ha single event"       →  >= 200 contiguous alert pixels
 *
 * So we keep only pixels that belong to a connected patch of >= MIN_PIXELS
 * (eight-connected), vectorise each surviving patch into a polygon, and export
 * the polygons as GeoJSON. Clan attribution is NOT done here — the app's
 * backend overlays these polygons on the clan boundaries locally, so this is a
 * single run over the whole MCA area, not one query per clan.
 *
 * Run it from the Code Editor (Tasks → Run the export), or on a schedule via
 * the Earth Engine Python API with a service account (see tools/README.md).
 * ────────────────────────────────────────────────────────────────────────── */

/* ── Parameters ─────────────────────────────────────────────────────────── */
var MIN_HA        = 2.0;                         // single-event threshold (ha)
var PIXEL_HA      = 0.01;                         // 10 m RADD pixel = 0.01 ha
var MIN_PIXELS    = Math.ceil(MIN_HA / PIXEL_HA); // = 200 contiguous pixels
var LOOKBACK_DAYS = 90;                           // how far back to look
var HIGH_CONF_ONLY = true;                        // true = confirmed alerts only
var DRIVE_FOLDER  = 'MCA_Stewards';               // export destination folder

/* Area of interest: the MCA boundary. Upload prototype/vendor/mca_boundary.geojson
 * as an EE asset and put its ID here, or draw/import a geometry named `AOI`. */
var AOI = ee.FeatureCollection('projects/YOUR_EE_PROJECT/assets/mca_boundary').geometry();
// For a quick test without an asset, uncomment a rough MCA bbox instead:
// var AOI = ee.Geometry.Rectangle([148.20, -9.35, 148.62, -9.00]);

/* ── RADD alerts ────────────────────────────────────────────────────────── */
/* projects/radar-wur/raddalert/v1 — per-region images with two bands:
 *   Alert : 0 (none) · 2 (unconfirmed/low) · 3 (confirmed/high)
 *   Date  : date of first detection, encoded YYDDD  (YY=year-2000, DDD=day-of-year)
 * Confirm the band names/encoding once in the Code Editor:
 *   print(ee.ImageCollection('projects/radar-wur/raddalert/v1').first()); */
var radd = ee.ImageCollection('projects/radar-wur/raddalert/v1')
             .filterMetadata('geography', 'equals', 'sea');   // SE Asia & Pacific (incl. PNG)
var img  = radd.sort('system:time_end', false).mosaic();
var alertBand = img.select('Alert');
var dateBand  = img.select('Date');

/* Date cutoff as a YYDDD code (monotonic: year dominates, so a simple >= works). */
var cutoff     = ee.Date(Date.now()).advance(-LOOKBACK_DAYS, 'day');
var cutoffCode = ee.Number.parse(cutoff.format('yy')).multiply(1000)
                   .add(cutoff.getRelative('day', 'year').add(1));

/* Qualifying-alert mask: right confidence AND within the window. */
var confMask = HIGH_CONF_ONLY ? alertBand.eq(3) : alertBand.gte(2);
var recent   = dateBand.gte(cutoffCode);
var mask     = confMask.and(recent).selfMask();     // 1 where a qualifying alert

/* ── Keep only big single events: >= MIN_PIXELS contiguous pixels ───────── */
var patchCount = mask.connectedPixelCount(1024, true);      // eight-connected
var bigPatches = patchCount.gte(MIN_PIXELS).selfMask();     // the >2 ha patches

/* ── Vectorise each surviving patch into one polygon ────────────────────── */
var events = bigPatches.reduceToVectors({
  geometry: AOI,
  scale: 10,
  eightConnected: true,
  geometryType: 'polygon',
  labelProperty: 'patch',
  maxPixels: 1e10,
  bestEffort: false
});

/* Attach each event's own area (ha) and most-recent alert date. */
events = events.map(function (f) {
  var a  = f.geometry().area(10);                   // m², 10 m error margin
  var dt = dateBand.reduceRegion({                  // latest YYDDD inside the patch
    reducer: ee.Reducer.max(), geometry: f.geometry(), scale: 10, maxPixels: 1e9
  }).get('Date');
  return f.set({ area_ha: a.divide(10000), area_m2: a, date_yyddd: dt });
});

/* Belt-and-braces: drop anything the vector area puts under the threshold. */
events = events.filter(ee.Filter.gte('area_ha', MIN_HA));

print('Clearance events > ' + MIN_HA + ' ha (>= ' + MIN_PIXELS + ' contiguous pixels):', events.size());
Map.centerObject(AOI, 11);
Map.addLayer(mask,        {palette: ['ffcc00']}, 'RADD alerts (masked)', false);
Map.addLayer(events,      {color: 'red'},        'Clearance events > ' + MIN_HA + ' ha');

/* ── Export GeoJSON for the app backend to consume ──────────────────────── */
/* The backend reads _clearance_events.geojson from the MCA_Stewards Drive
 * folder, overlays each polygon on the clan boundaries, and raises one
 * independent verification task per clan the polygon touches. */
Export.table.toDrive({
  collection: events,
  description: 'mca_clearance_events',
  fileNamePrefix: '_clearance_events',
  fileFormat: 'GeoJSON',
  folder: DRIVE_FOLDER
});
