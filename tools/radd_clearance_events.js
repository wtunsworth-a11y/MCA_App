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
var GEOGRAPHY     = 'asia';                        // RADD tile for PNG (SE Asia & Pacific).
                                                  // Valid values: 'asia', 'africa', 'sa'.

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
/* RADD v1 is an ImageCollection with a 'geography' property ('asia'/'africa'/
 * 'sa') AND a 'layer' property ('alert' or 'forest_baseline'). You MUST filter
 * to BOTH the right geography and the ALERT layer, or the collection is empty
 * and .select() throws "Image with no bands". */
var raddAlerts = ee.ImageCollection('projects/radar-wur/raddalert/v1')
                   .filterMetadata('geography', 'equals', GEOGRAPHY)
                   .filterMetadata('layer', 'contains', 'alert');
print('RADD alert images for "' + GEOGRAPHY + '":', raddAlerts.size());  // must be > 0
var img  = raddAlerts.sort('system:time_end', false).mosaic();
print('Band names (expect Alert + Date):', img.bandNames());
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
/* Vectorise at a COARSER scale (30 m) than the native 10 m. reduceToVectors at
 * 10 m over the whole MCA exceeds EE's memory limit ("User memory limit
 * exceeded"); 30 m keeps >2 ha patches intact while cutting the vertex count
 * ~9x, and bestEffort lets EE coarsen further if a run is still too heavy. The
 * >2 ha test itself already happened on the 10 m mask (bigPatches), so accuracy
 * of the threshold is unaffected — only the polygon outline is a little coarser. */
var events = bigPatches.reduceToVectors({
  geometry: AOI,
  scale: 30,
  eightConnected: true,
  geometryType: 'polygon',
  labelProperty: 'patch',
  maxPixels: 1e10,
  bestEffort: true
});

/* Attach each event's own area (ha). We deliberately do NOT do a per-patch
 * reduceRegion for the alert date here — that was the main memory hog and the
 * backend doesn't require a per-event date. */
events = events.map(function (f) {
  var a = f.geometry().area(30);                    // m², 30 m error margin (cheaper)
  return f.set({ area_ha: a.divide(10000), area_m2: a });
});

/* Belt-and-braces: drop anything the vector area puts under the threshold. */
events = events.filter(ee.Filter.gte('area_ha', MIN_HA));

/* Do NOT print events.size() or add the events layer interactively: vectorising
 * at 10 m over the whole AOI exceeds the Code Editor's small interactive memory
 * limit ("User memory limit exceeded"). The EXPORT task below runs on batch
 * infrastructure with far higher limits and handles it fine — just run it
 * (Tasks → Run). The light RADD-alert mask is added hidden, for a quick peek. */
Map.centerObject(AOI, 11);
Map.addLayer(mask, {palette: ['ffcc00']}, 'RADD alerts (masked)', false);

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
