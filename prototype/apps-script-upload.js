/**
 * MCA Steward App — Google Apps Script upload + reporting endpoint
 *
 * SETUP (takes ~5 minutes):
 *  1. Go to https://script.google.com → click "New Project"
 *  2. Delete the default code and paste this entire file
 *  3. In Project Settings (gear icon) set Time Zone: Asia/Port_Moresby (UTC+10)
 *  4. Click Deploy → New Deployment → type: Web App
 *     - Execute as: Me (your Google account)
 *     - Who has access: Anyone
 *  5. Click Deploy → copy the web app URL
 *  6. In prototype/index.html, set:
 *       var UPLOAD_ENDPOINT = 'PASTE_URL_HERE';
 *  7. Done. Steward phones now upload directly to your Drive.
 *
 * SECURITY:
 *  The app sends a shared secret header (X-Upload-Secret).
 *  Change UPLOAD_SECRET below to match the value in index.html.
 *
 * TRIGGERS (set up in Triggers UI — clock icon):
 *  - weeklyReport()  → Time-driven → Week timer → Monday → 7am–8am PNG time
 *  - monthlyReport() → Time-driven → Month timer → Day 1  → 7am–8am PNG time
 *
 * DATA LOCATION:
 *  My Drive → MCA_Steward_Data/
 *    _zones.json              ← zone config (managed from app coordinator screen)
 *    [ZoneID_ZoneName]/
 *      [StewardID_Name]/
 *        MCA_[ID]_[Date].json
 *
 * REPORTS:
 *  GET ?action=zones               → zone list
 *  GET ?action=zone_report&zone=Z07&period=weekly|monthly  → zone report
 *  GET ?action=mcf_report&period=weekly|monthly            → MCF all-zones summary
 */

/* ─── Configuration ────────────────────────────────────────────────── */
var DRIVE_FOLDER_ID   = '1FQRI9SEKHLk6T83D_iEw2GagMDbKIWx8';
var DRIVE_FOLDER_NAME = 'MCA_Stewards';
var UPLOAD_SECRET     = 'MCA_STEWARD_UPLOAD_2026';
var REPORT_EMAILS     = ['w.unsworth@landscapealliance.org'];

/*
 * COORDINATOR SERVER KEY — stored in Script Properties, NOT in this source.
 *
 * One-time setup:
 *   1. In the Apps Script editor, run setCoordinatorSecret() once.
 *   2. Edit the function body below to set your own secret before running.
 *   3. After running, remove or blank the value in the function body
 *      (it is now stored in Script Properties and this code is no longer needed).
 *
 * The key protects: update_zones, update_topics, grant_authorisation,
 * certify_trainer, update_water_sources, update_facilities, update_met_stations,
 * update_pheno_plots, update_calendar, update_disturbances.
 * It is NEVER stored in the phone app — only held in memory during a session.
 */
function setCoordinatorSecret() {
  /* CHANGE THIS VALUE, run once, then blank it out */
  var secret = 'REPLACE_WITH_YOUR_COORDINATOR_KEY';
  PropertiesService.getScriptProperties().setProperty('COORDINATOR_SECRET', secret);
  Logger.log('Coordinator secret set successfully.');
}

/* Internal helper — fetches coordinator secret from Script Properties */
function getCoordinatorSecret() {
  return PropertiesService.getScriptProperties().getProperty('COORDINATOR_SECRET') || '';
}

var DEFAULT_ZONES = [
  {id:'Z01', name:'Zone 1'},  {id:'Z02', name:'Zone 2'},  {id:'Z03', name:'Zone 3'},
  {id:'Z04', name:'Zone 4'},  {id:'Z05', name:'Zone 5'},  {id:'Z06', name:'Zone 6'},
  {id:'Z07', name:'Zone 7'},  {id:'Z08', name:'Zone 8'},  {id:'Z09', name:'Zone 9'},
  {id:'Z10', name:'Zone 10'}, {id:'Z11', name:'Zone 11'}
];

/* ─── Drive folder helper ───────────────────────────────────────────── */
function getDataFolder() {
  try { return DriveApp.getFolderById(DRIVE_FOLDER_ID); }
  catch(e) { return getOrCreateFolder(DRIVE_FOLDER_NAME); }
}

function getOrCreateFolder(name, parent) {
  var root     = parent || DriveApp.getRootFolder();
  var existing = root.getFoldersByName(name);
  if (existing.hasNext()) return existing.next();
  return root.createFolder(name);
}

/* ─── Zone configuration ────────────────────────────────────────────── */
function getZoneList() {
  try {
    var folder = getDataFolder();
    var files  = folder.getFilesByName('_zones.json');
    if (files.hasNext()) {
      var zones = JSON.parse(files.next().getBlob().getDataAsString());
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok', zones: zones }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  } catch(e) { /* fall through to defaults */ }
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', zones: DEFAULT_ZONES }))
    .setMimeType(ContentService.MimeType.JSON);
}

function saveZoneConfig(zones) {
  var folder = getDataFolder();
  var files  = folder.getFilesByName('_zones.json');
  var json   = JSON.stringify(zones, null, 2);
  if (files.hasNext()) { files.next().setContent(json); }
  else { folder.createFile('_zones.json', json, MimeType.PLAIN_TEXT); }
}

/* ─── Training topic configuration ─────────────────────────────────── */
var DEFAULT_TOPICS = [
  {id:'T00', name:'Awareness'},
  {id:'T01', name:'Coffee — Agriculture'}, {id:'T02', name:'Coffee — Processing'}, {id:'T03', name:'Coffee — Sales'},
  {id:'T04', name:'Cocoa — Agriculture'},  {id:'T05', name:'Cocoa — Processing'},  {id:'T06', name:'Cocoa — Sales'},
  {id:'T07', name:'Vanilla — Agriculture'},{id:'T08', name:'Vanilla — Processing'},{id:'T09', name:'Vanilla — Sales'},
  {id:'T10', name:'Okari — Agriculture'},  {id:'T11', name:'Okari — Processing'},  {id:'T12', name:'Okari — Sales'},
  {id:'T13', name:'Agroforestry'}, {id:'T14', name:'Composting & Soil Health'},
  {id:'T15', name:'Pest & Disease Management'}, {id:'T16', name:'Crop Rotation & Mixed Cropping'},
  {id:'T17', name:'Water Management & Irrigation'}, {id:'T18', name:'Forest Monitoring Techniques'},
  {id:'T19', name:'Beekeeping'}, {id:'T20', name:'Fish Farming (Aquaculture)'},
  {id:'T21', name:'Nursery & Seedling Management'}, {id:'T22', name:'Livestock Health & Husbandry'},
  {id:'T23', name:'Household Food Security'},
  /* Specialist field topics */
  {id:'T24', name:'Clan Boundary Mapping'}, {id:'T25', name:'Bilas Kit'}
];

function getTopicList() {
  try {
    var folder = getDataFolder();
    var files  = folder.getFilesByName('_topics.json');
    if (files.hasNext()) {
      var topics = JSON.parse(files.next().getBlob().getDataAsString());
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok', topics: topics }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  } catch(e) { /* fall through */ }
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', topics: DEFAULT_TOPICS }))
    .setMimeType(ContentService.MimeType.JSON);
}

function saveTopicConfig(topics) {
  var folder = getDataFolder();
  var files  = folder.getFilesByName('_topics.json');
  var json   = JSON.stringify(topics, null, 2);
  if (files.hasNext()) { files.next().setContent(json); }
  else { folder.createFile('_topics.json', json, MimeType.PLAIN_TEXT); }
}

/* ─── Water source registry ────────────────────────────────────────────
 * _water_sources.json in Drive: the authoritative list of monitorable water
 * sources, keyed by a client-generated uid. Stewards append pending entries
 * (register_water_source — upload secret only). The coordinator sets status
 * and owning clan(s) (update_water_sources — coordinator key required).
 * All phones GET ?action=water_sources to pull the list and filter by clan. */
function loadWaterSourcesList() {
  try {
    var folder = getDataFolder();
    var files  = folder.getFilesByName('_water_sources.json');
    if (files.hasNext()) {
      return JSON.parse(files.next().getBlob().getDataAsString()) || [];
    }
  } catch(e) { /* fall through */ }
  return [];
}

function saveWaterSourcesList(list) {
  var folder = getDataFolder();
  var files  = folder.getFilesByName('_water_sources.json');
  var json   = JSON.stringify(list || [], null, 2);
  if (files.hasNext()) { files.next().setContent(json); }
  else { folder.createFile('_water_sources.json', json, MimeType.PLAIN_TEXT); }
}

function getWaterSources() {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', water_sources: loadWaterSourcesList() }))
    .setMimeType(ContentService.MimeType.JSON);
}

/* Steward appends/updates a pending registration (identified by uid). */
function registerWaterSource(record) {
  if (!record || !record.uid) {
    return { status: 'error', message: 'Missing water source uid' };
  }
  var list = loadWaterSourcesList();
  var idx = -1;
  for (var i = 0; i < list.length; i++) { if (list[i].uid === record.uid) { idx = i; break; } }
  if (idx === -1) { list.push(record); }
  else if (list[idx].status === 'pending') { list[idx] = record; } /* allow edits only while pending */
  saveWaterSourcesList(list);
  return { status: 'ok', uid: record.uid, count: list.length };
}

/* Coordinator overwrites the registry (approvals, ownership, rejections). */
function updateWaterSources(list) {
  saveWaterSourcesList(list || []);
  return { status: 'ok', message: 'Water source registry saved', count: (list || []).length };
}

/* ─── Facility registry (schools, health facilities) ───────────────────
 * _facilities.json in Drive, same model as the water source registry. */
function loadFacilitiesList() {
  try {
    var folder = getDataFolder();
    var files  = folder.getFilesByName('_facilities.json');
    if (files.hasNext()) { return JSON.parse(files.next().getBlob().getDataAsString()) || []; }
  } catch(e) { /* fall through */ }
  return [];
}
function saveFacilitiesList(list) {
  var folder = getDataFolder();
  var files  = folder.getFilesByName('_facilities.json');
  var json   = JSON.stringify(list || [], null, 2);
  if (files.hasNext()) { files.next().setContent(json); }
  else { folder.createFile('_facilities.json', json, MimeType.PLAIN_TEXT); }
}
function getFacilities() {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', facilities: loadFacilitiesList() }))
    .setMimeType(ContentService.MimeType.JSON);
}
function registerFacility(record) {
  if (!record || !record.uid) { return { status: 'error', message: 'Missing facility uid' }; }
  var list = loadFacilitiesList();
  var idx = -1;
  for (var i = 0; i < list.length; i++) { if (list[i].uid === record.uid) { idx = i; break; } }
  if (idx === -1) { list.push(record); }
  else if (list[idx].status === 'pending') { list[idx] = record; }
  saveFacilitiesList(list);
  return { status: 'ok', uid: record.uid, count: list.length };
}
function updateFacilities(list) {
  saveFacilitiesList(list || []);
  return { status: 'ok', message: 'Facility registry saved', count: (list || []).length };
}

/* ─── Met station registry (rain gauge, weather station, water level) ───
 * _met_stations.json in Drive, same model as the facility registry. */
function loadMetStationsList() {
  try {
    var folder = getDataFolder();
    var files  = folder.getFilesByName('_met_stations.json');
    if (files.hasNext()) { return JSON.parse(files.next().getBlob().getDataAsString()) || []; }
  } catch(e) { /* fall through */ }
  return [];
}
function saveMetStationsList(list) {
  var folder = getDataFolder();
  var files  = folder.getFilesByName('_met_stations.json');
  var json   = JSON.stringify(list || [], null, 2);
  if (files.hasNext()) { files.next().setContent(json); }
  else { folder.createFile('_met_stations.json', json, MimeType.PLAIN_TEXT); }
}
function getMetStations() {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', met_stations: loadMetStationsList() }))
    .setMimeType(ContentService.MimeType.JSON);
}
function registerMetStation(record) {
  if (!record || !record.uid) { return { status: 'error', message: 'Missing met station uid' }; }
  var list = loadMetStationsList();
  var idx = -1;
  for (var i = 0; i < list.length; i++) { if (list[i].uid === record.uid) { idx = i; break; } }
  if (idx === -1) { list.push(record); }
  else if (list[idx].status === 'pending') { list[idx] = record; }
  saveMetStationsList(list);
  return { status: 'ok', uid: record.uid, count: list.length };
}
function updateMetStations(list) {
  saveMetStationsList(list || []);
  return { status: 'ok', message: 'Met station registry saved', count: (list || []).length };
}

/* ─── Phenology tree registry ──────────────────────────────────────────
 * _pheno_plots.json in Drive: shared ownership/status for monitored trees. */
function loadPhenoPlotsList() {
  try {
    var folder = getDataFolder();
    var files  = folder.getFilesByName('_pheno_plots.json');
    if (files.hasNext()) { return JSON.parse(files.next().getBlob().getDataAsString()) || []; }
  } catch(e) { /* fall through */ }
  return [];
}
function savePhenoPlotsList(list) {
  var folder = getDataFolder();
  var files  = folder.getFilesByName('_pheno_plots.json');
  var json   = JSON.stringify(list || [], null, 2);
  if (files.hasNext()) { files.next().setContent(json); }
  else { folder.createFile('_pheno_plots.json', json, MimeType.PLAIN_TEXT); }
}
function getPhenoPlots() {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', pheno_plots: loadPhenoPlotsList() }))
    .setMimeType(ContentService.MimeType.JSON);
}
function registerPhenoPlot(record) {
  if (!record || !record.uid) { return { status: 'error', message: 'Missing pheno plot uid' }; }
  var list = loadPhenoPlotsList();
  var idx = -1;
  for (var i = 0; i < list.length; i++) { if (list[i].uid === record.uid) { idx = i; break; } }
  if (idx === -1) { list.push(record); }
  else if (list[idx].status === 'pending') { list[idx] = record; }
  savePhenoPlotsList(list);
  return { status: 'ok', uid: record.uid, count: list.length };
}
function updatePhenoPlots(list) {
  savePhenoPlotsList(list || []);
  return { status: 'ok', message: 'Pheno plot registry saved', count: (list || []).length };
}

/* ─── Activity calendar ────────────────────────────────────────────────
 * _calendar.json in Drive: scheduled activities/meetings, keyed by uid. */
function loadCalendarList() {
  try {
    var folder = getDataFolder();
    var files  = folder.getFilesByName('_calendar.json');
    if (files.hasNext()) { return JSON.parse(files.next().getBlob().getDataAsString()) || []; }
  } catch(e) { /* fall through */ }
  return [];
}
function saveCalendarList(list) {
  var folder = getDataFolder();
  var files  = folder.getFilesByName('_calendar.json');
  var json   = JSON.stringify(list || [], null, 2);
  if (files.hasNext()) { files.next().setContent(json); }
  else { folder.createFile('_calendar.json', json, MimeType.PLAIN_TEXT); }
}
function getCalendar() {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', calendar: loadCalendarList() }))
    .setMimeType(ContentService.MimeType.JSON);
}
function registerCalendarEvent(record) {
  if (!record || !record.uid) { return { status: 'error', message: 'Missing calendar uid' }; }
  var list = loadCalendarList();
  var idx = -1;
  for (var i = 0; i < list.length; i++) { if (list[i].uid === record.uid) { idx = i; break; } }
  if (idx === -1) { list.push(record); } else { list[idx] = record; }
  saveCalendarList(list);
  return { status: 'ok', uid: record.uid, count: list.length };
}
function updateCalendar(list) {
  saveCalendarList(list || []);
  return { status: 'ok', message: 'Calendar saved', count: (list || []).length };
}

/* ─── Disturbance registry (satellite-detected + manual) ───────────────
 * _disturbances.json in Drive. Alerts are created by the satellite feed
 * (fetchDisturbanceFeed, below) or by a coordinator, and routed to the
 * owning clan. Stewards return a field verification keyed by uid
 * (verify_disturbance — upload secret only); coordinators overwrite the
 * registry for triage/assignment (update_disturbances — coordinator key).
 * All phones GET ?action=disturbances and filter by clan. */
function loadDisturbancesList() {
  try {
    var folder = getDataFolder();
    var files  = folder.getFilesByName('_disturbances.json');
    if (files.hasNext()) { return JSON.parse(files.next().getBlob().getDataAsString()) || []; }
  } catch(e) { /* fall through */ }
  return [];
}
function saveDisturbancesList(list) {
  var folder = getDataFolder();
  var files  = folder.getFilesByName('_disturbances.json');
  var json   = JSON.stringify(list || [], null, 2);
  if (files.hasNext()) { files.next().setContent(json); }
  else { folder.createFile('_disturbances.json', json, MimeType.PLAIN_TEXT); }
}
function getDisturbances() {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', disturbances: loadDisturbancesList() }))
    .setMimeType(ContentService.MimeType.JSON);
}
/* A steward's verification (upload secret only). Only the verify block,
 * status and area are accepted — the alert facts/routing are server-owned
 * and cannot be overwritten from the field. A verified alert is locked. */
function verifyDisturbance(record) {
  if (!record || !record.uid) { return { status: 'error', message: 'Missing disturbance uid' }; }
  var list = loadDisturbancesList();
  var idx = -1;
  for (var i = 0; i < list.length; i++) { if (list[i].uid === record.uid) { idx = i; break; } }
  if (idx === -1) {
    /* Manual/ad-hoc disturbance raised in the field — accept as a new record. */
    record.status = record.status || 'verified';
    list.push(record);
  } else {
    if (list[idx].status === 'verified' || list[idx].status === 'closed') {
      return { status: 'ok', uid: record.uid, note: 'already resolved — ignored' };
    }
    list[idx].verify = record.verify || list[idx].verify;
    list[idx].status = 'verified';
    if (record.verify && record.verify.area_measured_ha != null) list[idx].area_measured_ha = record.verify.area_measured_ha;
  }
  saveDisturbancesList(list);
  return { status: 'ok', uid: record.uid, count: list.length };
}
/* Coordinator overwrite (triage/assignment/rejection). */
function updateDisturbances(list) {
  saveDisturbancesList(list || []);
  return { status: 'ok', message: 'Disturbance registry saved', count: (list || []).length };
}

/* ─── Help registry (per-field help text, coordinator-editable) ─────────
 * _help.json in Drive: { fields:{ key:{title,html} }, updated_at }. The app
 * ships a baseline; this registry overlays it so coordinators can refine
 * field help without a new app release. GET ?action=help; coordinator
 * overwrite via update_help. */
function loadHelpFile() {
  try {
    var folder = getDataFolder();
    var files  = folder.getFilesByName('_help.json');
    if (files.hasNext()) { return JSON.parse(files.next().getBlob().getDataAsString()) || { fields:{} }; }
  } catch(e) { /* fall through */ }
  return { fields:{} };
}
function saveHelpFile(data) {
  var folder = getDataFolder();
  var files  = folder.getFilesByName('_help.json');
  var json   = JSON.stringify(data || { fields:{} }, null, 2);
  if (files.hasNext()) { files.next().setContent(json); }
  else { folder.createFile('_help.json', json, MimeType.PLAIN_TEXT); }
}
function getHelp() {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', help: loadHelpFile() }))
    .setMimeType(ContentService.MimeType.JSON);
}
function updateHelp(help) {
  saveHelpFile(help || { fields:{} });
  var n = (help && help.fields) ? Object.keys(help.fields).length : 0;
  return { status: 'ok', message: 'Help registry saved', count: n };
}

/* ══════════════════════════════════════════════════════════════════════
 * DISTURBANCE FEED — automated satellite detection
 * ----------------------------------------------------------------------
 * Runs server-side (Google's network can reach NASA / GFW; the phones and
 * the offline app cannot). Install a daily time-driven trigger with
 *   installDisturbanceFeedTrigger()
 * once, after setting these Script Properties:
 *   FIRMS_MAP_KEY        free key from https://firms.modaps.eosdis.nasa.gov/api/
 *   MCA_BBOX             "minLon,minLat,maxLon,maxLat"  (defaults to Managalas)
 *   FIRMS_DAYRANGE       1–10, days of history per run (default 2)
 *   FIRE_MIN_DETECTIONS  min detections in a ~1 km cell to task it (default 3)
 *   FIRE_MIN_FRP         OR min fire power in MW to task it (default 15)
 *   CLEARANCE_MIN_HA     min single clearing to raise, in ha (default 2)
 * Forest clearance comes from the monthly Earth Engine run
 * (tools/radd_clearance_events.js), which turns RADD alerts into single-event
 * polygons > CLEARANCE_MIN_HA (area-per-pixel × contiguous pixels) and exports
 * _clearance_events.geojson into the data folder. One run covers the whole MCA
 * — there is no per-clan querying.
 * The size/area thresholds are applied before any task is created (in Earth
 * Engine for clearance, in the fetcher for fire), so a steward never decides
 * whether something "counts". An event overlapping two or more clan boundaries
 * raises one independent task per clan.
 * Clan routing reads an optional polygon file _clan_boundaries.json in the
 * data folder (GeoJSON FeatureCollection; each feature's properties.clan /
 * properties.zone name the owner). With no polygons, alerts route to the
 * coordinator triage queue (owner_clan = null). The app writes this file as
 * stewards map clan boundaries through the Field Mapping module. */
function _prop(k, dflt) {
  var v = PropertiesService.getScriptProperties().getProperty(k);
  return (v === null || v === '') ? dflt : v;
}
function _mcaBbox() {
  var s = _prop('MCA_BBOX', '148.20,-9.35,148.62,-9.00'); /* lon,lat,lon,lat */
  var p = s.split(',').map(parseFloat);
  return { minLon:p[0], minLat:p[1], maxLon:p[2], maxLat:p[3] };
}
function _inBbox(lat, lon, b) { return lon>=b.minLon && lon<=b.maxLon && lat>=b.minLat && lat<=b.maxLat; }

function loadClanBoundaries() {
  try {
    var folder = getDataFolder();
    var files  = folder.getFilesByName('_clan_boundaries.json');
    if (!files.hasNext()) return [];
    var gj = JSON.parse(files.next().getBlob().getDataAsString());
    var feats = (gj && gj.features) ? gj.features : [];
    var polys = [];
    feats.forEach(function(f){
      var props = f.properties || {};
      var clan = props.clan || props.CLAN || props.name || '';
      var zone = props.zone || props.ZONE || '';
      if (!clan || !f.geometry) return;
      var g = f.geometry;
      var rings = (g.type === 'Polygon') ? [g.coordinates] : (g.type === 'MultiPolygon') ? g.coordinates : [];
      rings.forEach(function(poly){ if (poly && poly[0]) polys.push({ clan:clan, zone:zone, ring:poly[0] }); });
    });
    return polys;
  } catch(e) { return []; }
}
function _pointInRing(lat, lon, ring) {
  var inside = false, n = ring.length;
  for (var i = 0, j = n - 1; i < n; j = i++) {
    var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; /* GeoJSON [lon,lat] */
    var hit = ((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / ((yj - yi) || 1e-12) + xi);
    if (hit) inside = !inside;
  }
  return inside;
}
/* Which clans own a disturbance. A point returns every polygon that
 * contains it (usually one). An AREA event (a footprint ring, e.g. from
 * GFW) returns every clan whose boundary the footprint overlaps — so a
 * clearance straddling two clans tasks BOTH, independently. */
function _slug(s){ return (s||'').toString().replace(/[^A-Za-z0-9]/g,'').toUpperCase().slice(0,12); }
function _ringsOverlap(a, b){
  for (var i=0;i<a.length;i++){ if (_pointInRing(a[i][1], a[i][0], b)) return true; }
  for (var j=0;j<b.length;j++){ if (_pointInRing(b[j][1], b[j][0], a)) return true; }
  return false;
}
function routeEventToClans(ev, polys){
  var out = [];
  if (ev.footprint && ev.footprint.length >= 3){
    for (var i=0;i<polys.length;i++){ if (_ringsOverlap(ev.footprint, polys[i].ring)) out.push({ owner_clan:polys[i].clan, zone:polys[i].zone, routed_by:'boundary' }); }
  } else {
    var lat=parseFloat(ev.lat), lon=parseFloat(ev.lng);
    for (var k=0;k<polys.length;k++){ if (_pointInRing(lat, lon, polys[k].ring)) out.push({ owner_clan:polys[k].clan, zone:polys[k].zone, routed_by:'boundary' }); }
  }
  return out; /* empty => triage */
}

/* NASA FIRMS active-fire detections (CSV area API).
 * Detections are clustered onto a ~1 km grid and ONLY cells big enough to
 * matter are emitted as fire events — a steward is tasked only for the big
 * ones, never a single faint pixel. "Big" = enough detections in the cell
 * (FIRE_MIN_DETECTIONS) OR enough fire power (FIRE_MIN_FRP, MW). This gate
 * runs here, before any alert is created, so the field has no say in it. */
function fetchFirmsFires(bbox) {
  var key = _prop('FIRMS_MAP_KEY', '');
  if (!key) return [];
  var dayRange = Math.max(1, Math.min(10, parseInt(_prop('FIRMS_DAYRANGE', '2'), 10) || 2));
  var minDet   = Math.max(1, parseInt(_prop('FIRE_MIN_DETECTIONS', '3'), 10) || 3);
  var minFrp   = parseFloat(_prop('FIRE_MIN_FRP', '15')) || 15; /* MW */
  var GRID     = 0.009; /* ~1 km */
  var area = bbox.minLon + ',' + bbox.minLat + ',' + bbox.maxLon + ',' + bbox.maxLat;
  var cells = {};
  ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'MODIS_NRT'].forEach(function(src){
    var url = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv/' + key + '/' + src + '/' + area + '/' + dayRange;
    try {
      var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (resp.getResponseCode() !== 200) return;
      var rows = Utilities.parseCsv(resp.getContentText());
      if (!rows || rows.length < 2) return;
      var head = rows[0];
      var cLat = head.indexOf('latitude'), cLon = head.indexOf('longitude'),
          cDate = head.indexOf('acq_date'), cConf = head.indexOf('confidence'),
          cFrp  = head.indexOf('frp');
      for (var r = 1; r < rows.length; r++) {
        var row = rows[r]; if (!row || row.length < head.length) continue;
        var lat = parseFloat(row[cLat]), lon = parseFloat(row[cLon]);
        if (isNaN(lat) || isNaN(lon) || !_inBbox(lat, lon, bbox)) continue;
        var frp = (cFrp>=0) ? (parseFloat(row[cFrp])||0) : 0;
        var gl = Math.round(lat/GRID), gn = Math.round(lon/GRID), kkey = gl+'_'+gn;
        var c = cells[kkey] || (cells[kkey] = { n:0, sumLat:0, sumLon:0, maxFrp:0, date:'', gl:gl, gn:gn, src:src });
        c.n++; c.sumLat+=lat; c.sumLon+=lon; if(frp>c.maxFrp) c.maxFrp=frp;
        var d = row[cDate]||''; if (d>c.date) c.date=d;
      }
    } catch(e) { /* skip this source */ }
  });
  var out = [];
  Object.keys(cells).forEach(function(k){
    var c = cells[k];
    if (c.n < minDet && c.maxFrp < minFrp) return; /* not a big fire — not tasked */
    var lat = c.sumLat/c.n, lon = c.sumLon/c.n;
    out.push({
      source:'FIRMS/'+c.src.split('_')[0], kind:'fire',
      lat:lat.toFixed(5), lng:lon.toFixed(5),
      detected_date:c.date, confidence:(c.maxFrp?('FRP '+Math.round(c.maxFrp)+' MW'):(c.n+' px')),
      priority:(c.maxFrp>=minFrp*2 || c.n>=minDet*2) ? 'high' : 'normal',
      detail:'Active fire — '+c.n+' detection'+(c.n>1?'s':'')+(c.maxFrp?(', peak '+Math.round(c.maxFrp)+' MW'):'')+' in ~1 km',
      uid:'FIRMS-'+c.gl+'-'+c.gn /* stable per cell — a persistent fire isn’t re-raised */
    });
  });
  return out;
}

/* Mean of a [lon,lat] ring (rough centroid, good enough for a cell uid). */
function _ringCentroid(ring) {
  var sx=0, sy=0, n=0;
  for (var i=0;i<ring.length;i++){ sx+=ring[i][0]; sy+=ring[i][1]; n++; }
  return n ? [sx/n, sy/n] : [0,0];
}

/* Forest-clearance EVENTS from RADD — single patches larger than the
 * threshold, produced by the monthly Earth Engine run (tools/radd_clearance_
 * events.js) and exported to _clearance_events.geojson in the data folder.
 * Each GeoJSON feature is already ONE clearing > CLEARANCE_MIN_HA (the size
 * test — area-per-pixel × contiguous pixels — is done in Earth Engine, before
 * any task exists). Here we only read them in; routeEventToClans() then does
 * the split: one independent task per clan whose boundary the patch overlaps. */
function fetchGfwClearance(bbox) {
  var minHa = parseFloat(_prop('CLEARANCE_MIN_HA', '2')) || 2;
  var gj;
  try {
    var folder = getDataFolder();
    var files  = folder.getFilesByName('_clearance_events.geojson');
    if (!files.hasNext()) return [];
    gj = JSON.parse(files.next().getBlob().getDataAsString());
  } catch(e) { return []; }
  var feats = (gj && gj.features) ? gj.features : [];
  var out = [];
  feats.forEach(function(f){
    var g = f.geometry || {}, pr = f.properties || {};
    var areaHa = parseFloat(pr.area_ha);
    if (isNaN(areaHa) || areaHa < minHa) return;      /* backstop — never below the bar */
    var polys = (g.type === 'Polygon') ? [g.coordinates]
              : (g.type === 'MultiPolygon') ? g.coordinates : [];
    polys.forEach(function(poly){
      var ring = poly && poly[0];
      if (!ring || ring.length < 3) return;
      var c = _ringCentroid(ring);
      var gl = Math.round(c[1]/0.009), gn = Math.round(c[0]/0.009); /* ~1 km cell */
      out.push({
        source:'GFW/RADD', kind:'clearance',
        lat:c[1].toFixed(5), lng:c[0].toFixed(5),
        area_ha: Math.round(areaHa*10)/10,
        detected_date: pr.detected_date || pr.date || '',
        confidence: 'RADD',
        detail: 'Forest clearance — single patch ~' + (Math.round(areaHa*10)/10) + ' ha',
        footprint: ring,                 /* [lon,lat] ring → drives the clan split */
        uid: 'GFW-' + gl + '-' + gn
      });
    });
  });
  return out;
}

/* Daily entry point — fetch, apply the size/area gate, route to every
 * owning clan, de-duplicate per clan, and raise one independent task each. */
function fetchDisturbanceFeed() {
  var bbox  = _mcaBbox();
  var polys = loadClanBoundaries();
  var minHa = parseFloat(_prop('CLEARANCE_MIN_HA', '2')) || 2;
  var found = fetchFirmsFires(bbox).concat(fetchGfwClearance(bbox));

  var list = loadDisturbancesList();
  var byUid = {}; list.forEach(function(d){ if (d.uid) byUid[d.uid] = d; });
  var added = 0;
  found.forEach(function(ev){
    /* Size/area threshold is enforced BEFORE a task exists. Fires are
       pre-gated in the fetcher; clearances are gated here as a backstop. */
    if (ev.kind === 'clearance' && ev.area_ha != null && ev.area_ha < minHa) return;

    var routes = routeEventToClans(ev, polys);
    if (routes.length === 0) routes = [{ owner_clan:null, zone:'', routed_by:'triage' }];

    /* One independent task per owning clan — a multi-clan event tasks each. */
    routes.forEach(function(rt){
      var uid = ev.uid + (rt.owner_clan ? ('-' + _slug(rt.owner_clan)) : '-TRIAGE');
      if (byUid[uid]) return; /* already raised for this clan — never twice */
      var rec = {};
      for (var p in ev) { if (ev.hasOwnProperty(p)) rec[p] = ev[p]; }
      rec.uid = uid; rec.owner_clan = rt.owner_clan; rec.zone = rt.zone; rec.routed_by = rt.routed_by;
      rec.status = 'open'; rec.verify = null;
      rec.created_date = new Date().toISOString().slice(0,10); rec.created_by = 'feed';
      if (routes.length > 1) rec.multi_clan = true; /* flag a shared event */
      list.push(rec); byUid[uid] = rec; added++;
    });
  });
  if (added > 0) saveDisturbancesList(list);
  Logger.log('Disturbance feed: ' + found.length + ' events, ' + added + ' new clan tasks raised.');
  return { status: 'ok', events: found.length, added: added };
}
/* One-time: install the daily trigger (safe to re-run — clears duplicates first). */
function installDisturbanceFeedTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === 'fetchDisturbanceFeed') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('fetchDisturbanceFeed').timeBased().everyDays(1).atHour(5).create();
  return 'Disturbance feed trigger installed (daily ~05:00).';
}

/* ─── Training authorisation records ───────────────────────────────── */
/*
 * _authorisations.json in Drive: { "MCA-007": [ {topic_id, topic_name, cert_date, ...}, ... ] }
 * One file, keyed by stewardId. Coordinator appends records; app reads on login.
 */
function loadAuthorisationsFile() {
  var folder = getDataFolder();
  var files  = folder.getFilesByName('_authorisations.json');
  if (files.hasNext()) {
    try { return JSON.parse(files.next().getBlob().getDataAsString()); } catch(e) { return {}; }
  }
  return {};
}

function saveAuthorisationsFile(data) {
  var folder = getDataFolder();
  var files  = folder.getFilesByName('_authorisations.json');
  var json   = JSON.stringify(data, null, 2);
  if (files.hasNext()) { files.next().setContent(json); }
  else { folder.createFile('_authorisations.json', json, MimeType.PLAIN_TEXT); }
}

function grantAuthorisation(record) {
  if (!record || !record.stewardId || !record.topic_id) {
    return { status: 'error', message: 'Missing stewardId or topic_id' };
  }
  try {
    var data  = loadAuthorisationsFile();
    var sid   = record.stewardId;
    if (!data[sid]) data[sid] = [];
    /* Avoid duplicate entries for the same topic */
    var alreadyGranted = data[sid].some(function(r) { return r.topic_id === record.topic_id; });
    if (!alreadyGranted) { data[sid].push(record); }
    saveAuthorisationsFile(data);
    return { status: 'ok', message: 'Authorisation recorded', stewardId: sid,
             topic: record.topic_name, duplicate: alreadyGranted };
  } catch(err) {
    return { status: 'error', message: err.toString() };
  }
}

function getAuthorisations(stewardId) {
  if (!stewardId) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: 'Missing stewardId' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  try {
    var data = loadAuthorisationsFile();
    var recs = data[stewardId] || [];
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok', stewardId: stewardId, authorisations: recs }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/* ─── Trainer Certification ─────────────────────────────────────────── */
/*
 * Trainer certs are stored in a single JSON file _trainer_certs.json in the
 * data folder. Structure: { "<stewardId>": [ {cert record}, ... ], ... }
 *
 * If a cert_photo_b64 is provided, the image is saved as a JPEG in the
 * steward's sub-folder so there is a permanent record on Drive.
 */
function loadTrainerCertsFile() {
  var folder = getDataFolder();
  var files  = folder.getFilesByName('_trainer_certs.json');
  if (files.hasNext()) {
    try { return JSON.parse(files.next().getBlob().getDataAsString()); } catch(e) { return {}; }
  }
  return {};
}

function saveTrainerCertsFile(data) {
  var folder = getDataFolder();
  var files  = folder.getFilesByName('_trainer_certs.json');
  var json   = JSON.stringify(data, null, 2);
  if (files.hasNext()) { files.next().setContent(json); }
  else { folder.createFile('_trainer_certs.json', json, MimeType.PLAIN_TEXT); }
}

function certifyTrainer(body) {
  if (!body || !body.stewardId || !body.records || body.records.length === 0) {
    return { status: 'error', message: 'Missing stewardId or records' };
  }
  try {
    var data  = loadTrainerCertsFile();
    var sid   = body.stewardId;
    if (!data[sid]) data[sid] = [];

    var added = 0;
    body.records.forEach(function(cert) {
      var duplicate = data[sid].some(function(r) {
        return r.topic_id === cert.topic_id && r.cert_date === cert.cert_date;
      });
      if (!duplicate) { data[sid].push(cert); added++; }
    });

    saveTrainerCertsFile(data);

    /* Optionally save certificate photo */
    if (body.cert_photo_b64) {
      try {
        var folder  = getDataFolder();
        var imgName = sid + '_cert_' + new Date().toISOString().slice(0,10) + '.jpg';
        var blob    = Utilities.newBlob(Utilities.base64Decode(body.cert_photo_b64), 'image/jpeg', imgName);
        folder.createFile(blob);
      } catch(imgErr) {
        Logger.log('Photo save failed (non-fatal): ' + imgErr);
      }
    }

    return { status: 'ok', stewardId: sid, added: added, total: data[sid].length };
  } catch(err) {
    return { status: 'error', message: err.toString() };
  }
}

function getTrainerCerts(stewardId) {
  if (!stewardId) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: 'Missing stewardId' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  try {
    var data  = loadTrainerCertsFile();
    var certs = data[stewardId] || [];
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok', stewardId: stewardId, certs: certs }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/* ─── Date helpers ──────────────────────────────────────────────────── */
function cutoffDate(days) {
  var d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

/* First day of the previous calendar month (for monthly email trigger) */
function prevMonthStart() {
  var d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
}

/* Last day of the previous calendar month */
function prevMonthEnd() {
  var d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 0, 23, 59, 59);
}

/* First day of the current calendar month (for in-app monthly view) */
function currentMonthStart() {
  var d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function isoDate(d) { return d.toISOString().slice(0, 10); }

/* ─── Walk all steward data files within a cutoff ─────────────────── */
/*
 * Returns an array of {stewardId, name, zone, clan, village, role,
 *                       modules, record_count, upload_time, zone_id} objects
 * one per uploaded file that falls within the cutoff window.
 */
function collectFiles(cutoff, zoneIdFilter) {
  var dataFolder = getDataFolder();
  var results    = [];

  /* Walk zone sub-folders first (new structure: ZoneID_ZoneName/StewardID_Name/) */
  var zoneFolders = dataFolder.getFolders();
  while (zoneFolders.hasNext()) {
    var zoneFolder = zoneFolders.next();
    var zoneFolderName = zoneFolder.getName();
    if (zoneFolderName.startsWith('_')) continue;  /* skip config files */

    /* Extract zone id from folder name (format: Z07_Zone_7 or legacy SID_Name) */
    var folderZoneId = '';
    var zMatch = zoneFolderName.match(/^(Z\d{2})/);
    if (zMatch) { folderZoneId = zMatch[1]; }

    /* If filtering by zone, skip non-matching folders */
    if (zoneIdFilter && folderZoneId && folderZoneId !== zoneIdFilter) continue;

    /* Walk steward sub-folders within this zone folder */
    var stewardFolders = zoneFolder.getFolders();
    while (stewardFolders.hasNext()) {
      var sub   = stewardFolders.next();
      var files = sub.getFilesByType(MimeType.PLAIN_TEXT);
      while (files.hasNext()) {
        var file = files.next();
        if (file.getDateCreated() < cutoff) continue;
        try {
          var body = JSON.parse(file.getBlob().getDataAsString());
          results.push({
            stewardId:    (body.steward && body.steward.stewardId)  || 'UNKNOWN',
            name:         (body.steward && body.steward.name)        || 'Unknown',
            zone:         (body.steward && body.steward.zone)        || '',
            zone_id:      (body.steward && body.steward.zone_id)     || folderZoneId || '',
            clan:         (body.steward && body.steward.clan)        || '',
            village:      (body.steward && body.steward.village)     || '',
            role:         (body.steward && body.steward.role)        || 'clan_steward',
            modules:      body.modules   || {},
            record_count: body.record_count || 0,
            upload_time:  file.getDateCreated().toISOString()
          });
        } catch(e) { /* skip malformed files */ }
      }
    }

    /* Also check direct files inside the zone folder (legacy: flat structure) */
    var directFiles = zoneFolder.getFilesByType(MimeType.PLAIN_TEXT);
    while (directFiles.hasNext()) {
      var file = directFiles.next();
      if (file.getDateCreated() < cutoff) continue;
      try {
        var body = JSON.parse(file.getBlob().getDataAsString());
        results.push({
          stewardId:    (body.steward && body.steward.stewardId)  || 'UNKNOWN',
          name:         (body.steward && body.steward.name)        || 'Unknown',
          zone:         (body.steward && body.steward.zone)        || '',
          zone_id:      (body.steward && body.steward.zone_id)     || folderZoneId || '',
          clan:         (body.steward && body.steward.clan)        || '',
          village:      (body.steward && body.steward.village)     || '',
          role:         (body.steward && body.steward.role)        || 'clan_steward',
          modules:      body.modules   || {},
          record_count: body.record_count || 0,
          upload_time:  file.getDateCreated().toISOString()
        });
      } catch(e) { /* skip */ }
    }
  }

  /* Legacy flat structure: steward folders directly under data folder */
  var legacyFolders = dataFolder.getFolders();
  while (legacyFolders.hasNext()) {
    var sub  = legacyFolders.next();
    var sName = sub.getName();
    /* Skip zone folders (already processed) and config */
    if (sName.match(/^Z\d{2}/) || sName.startsWith('_')) continue;
    var files = sub.getFilesByType(MimeType.PLAIN_TEXT);
    while (files.hasNext()) {
      var file = files.next();
      if (file.getDateCreated() < cutoff) continue;
      try {
        var body = JSON.parse(file.getBlob().getDataAsString());
        var fileZoneId = (body.steward && body.steward.zone_id) || '';
        if (zoneIdFilter && fileZoneId && fileZoneId !== zoneIdFilter) continue;
        results.push({
          stewardId:    (body.steward && body.steward.stewardId)  || 'UNKNOWN',
          name:         (body.steward && body.steward.name)        || 'Unknown',
          zone:         (body.steward && body.steward.zone)        || '',
          zone_id:      fileZoneId,
          clan:         (body.steward && body.steward.clan)        || '',
          village:      (body.steward && body.steward.village)     || '',
          role:         (body.steward && body.steward.role)        || 'clan_steward',
          modules:      body.modules   || {},
          record_count: body.record_count || 0,
          upload_time:  file.getDateCreated().toISOString()
        });
      } catch(e) { /* skip */ }
    }
  }
  return results;
}

/* ─── Zone report generator ─────────────────────────────────────────── */
/*
 * period values:
 *   'weekly'   → last 7 rolling days
 *   'monthly'  → current calendar month 1st to today (in-app view)
 *   'prevmonth'→ full previous calendar month (used by monthly email trigger)
 */
function buildZoneReport(zoneId, period) {
  var cutoff, periodEnd;
  if (period === 'prevmonth') {
    cutoff    = prevMonthStart();
    periodEnd = prevMonthEnd();
  } else if (period === 'monthly') {
    cutoff    = currentMonthStart();
    periodEnd = new Date();
  } else {
    cutoff    = cutoffDate(7);
    periodEnd = new Date();
  }
  var files  = collectFiles(cutoff, zoneId || null);
  /* Filter: for prevmonth, also drop files created after end of that month */
  if (period === 'prevmonth') {
    var endMs = periodEnd.getTime();
    files = files.filter(function(f) { return new Date(f.upload_time).getTime() <= endMs; });
  }

  /* Aggregate by steward */
  var stewardMap = {};
  files.forEach(function(f) {
    /* Only include clan stewards (not zone staff / MCF staff) */
    if (f.role && f.role !== 'clan_steward') return;
    var key = f.stewardId;
    if (!stewardMap[key]) {
      stewardMap[key] = {
        stewardId:    f.stewardId,
        name:         f.name,
        clan:         f.clan,
        village:      f.village,
        zone:         f.zone,
        zone_id:      f.zone_id,
        upload_count: 0,
        record_count: 0,
        modules:      {},
        active_days:  {},
        last_upload:  ''
      };
    }
    var s = stewardMap[key];
    s.upload_count++;
    s.record_count += f.record_count;
    s.active_days[f.upload_time.slice(0,10)] = true;
    if (!s.last_upload || f.upload_time > s.last_upload) s.last_upload = f.upload_time;
    Object.keys(f.modules).forEach(function(mod) {
      s.modules[mod] = (s.modules[mod] || 0) + (f.modules[mod] ? f.modules[mod].length || 1 : 0);
    });
  });

  var stewards = Object.values(stewardMap).map(function(s) {
    s.active_days = Object.keys(s.active_days).sort();
    return s;
  }).sort(function(a,b) { return a.name.localeCompare(b.name); });

  var totalRecords = stewards.reduce(function(n,s) { return n + s.record_count; }, 0);
  var activeStewards = stewards.filter(function(s) { return s.upload_count > 0; }).length;

  /* Find zone name from config */
  var zones = DEFAULT_ZONES;
  try {
    var folder = getDataFolder();
    var zFiles = folder.getFilesByName('_zones.json');
    if (zFiles.hasNext()) zones = JSON.parse(zFiles.next().getBlob().getDataAsString());
  } catch(e) { /* use defaults */ }
  var zoneObj  = zones.filter(function(z) { return z.id === zoneId; })[0] || {id: zoneId, name: zoneId};

  return {
    zone_id:          zoneObj.id,
    zone_name:        zoneObj.name,
    period:           period,
    from:             isoDate(cutoff),
    to:               isoDate(periodEnd),
    stewards:         stewards,
    total_stewards:   stewards.length,
    active_stewards:  activeStewards,
    total_records:    totalRecords,
    generated_at:     new Date().toISOString()
  };
}

/* ─── MCF report generator (all zones) ─────────────────────────────── */
function buildMCFReport(period) {
  var cutoff, periodEnd;
  if (period === 'prevmonth') {
    cutoff    = prevMonthStart();
    periodEnd = prevMonthEnd();
  } else if (period === 'monthly') {
    cutoff    = currentMonthStart();
    periodEnd = new Date();
  } else {
    cutoff    = cutoffDate(7);
    periodEnd = new Date();
  }
  var files  = collectFiles(cutoff, null);
  if (period === 'prevmonth') {
    var endMs = periodEnd.getTime();
    files = files.filter(function(f) { return new Date(f.upload_time).getTime() <= endMs; });
  }

  /* Load zone list */
  var zones = DEFAULT_ZONES;
  try {
    var folder = getDataFolder();
    var zFiles = folder.getFilesByName('_zones.json');
    if (zFiles.hasNext()) zones = JSON.parse(zFiles.next().getBlob().getDataAsString());
  } catch(e) { /* use defaults */ }

  /* Aggregate by zone */
  var zoneMap = {};
  zones.forEach(function(z) {
    zoneMap[z.id] = { zone_id: z.id, zone_name: z.name, steward_ids: {}, upload_count: 0, record_count: 0, modules: {}, active_days: {}, last_upload: '' };
  });

  files.forEach(function(f) {
    if (f.role && f.role !== 'clan_steward') return;
    var zid = f.zone_id || 'UNKNOWN';
    if (!zoneMap[zid]) {
      zoneMap[zid] = { zone_id: zid, zone_name: f.zone || zid, steward_ids: {}, upload_count: 0, record_count: 0, modules: {}, active_days: {}, last_upload: '' };
    }
    var z = zoneMap[zid];
    z.steward_ids[f.stewardId] = true;
    z.upload_count++;
    z.record_count += f.record_count;
    z.active_days[f.upload_time.slice(0,10)] = true;
    if (!z.last_upload || f.upload_time > z.last_upload) z.last_upload = f.upload_time;
    Object.keys(f.modules).forEach(function(mod) {
      z.modules[mod] = (z.modules[mod] || 0) + (f.modules[mod] ? f.modules[mod].length || 1 : 0);
    });
  });

  var zoneRows = Object.values(zoneMap).map(function(z) {
    return {
      zone_id:         z.zone_id,
      zone_name:       z.zone_name,
      steward_count:   Object.keys(z.steward_ids).length,
      upload_count:    z.upload_count,
      record_count:    z.record_count,
      active_days:     Object.keys(z.active_days).sort().length,
      modules:         z.modules,
      last_upload:     z.last_upload
    };
  }).sort(function(a,b) { return a.zone_id.localeCompare(b.zone_id); });

  var totalRecords  = zoneRows.reduce(function(n,z) { return n + z.record_count; }, 0);
  var activeZones   = zoneRows.filter(function(z) { return z.upload_count > 0; }).length;
  var totalStewards = zoneRows.reduce(function(n,z) { return n + z.steward_count; }, 0);

  return {
    period:          period,
    from:            isoDate(cutoff),
    to:              isoDate(periodEnd),
    zones:           zoneRows,
    total_zones:     zones.length,
    active_zones:    activeZones,
    total_stewards:  totalStewards,
    total_records:   totalRecords,
    generated_at:    new Date().toISOString()
  };
}

/* ─── Receive upload from steward phone ─────────────────────────────── */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    /* Secret check — reject anything without the correct shared secret */
    if (!body || body._secret !== UPLOAD_SECRET) {
      Logger.log('Rejected upload: wrong or missing secret from ' + (e.postData ? e.postData.length : 0) + ' byte payload');
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'error', message: 'Unauthorised' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    /* Coordinator write actions require a second server-side key in addition to the upload secret.
     * The key is stored in Script Properties (never in the distributed app source). */
    var COORDINATOR_ACTIONS = ['update_zones', 'update_topics', 'grant_authorisation', 'certify_trainer', 'update_water_sources', 'update_facilities', 'update_met_stations', 'update_pheno_plots', 'update_calendar', 'update_disturbances', 'update_help'];
    if (COORDINATOR_ACTIONS.indexOf(body._action) !== -1) {
      var coordSecret = getCoordinatorSecret();
      if (!coordSecret || body._coordinator_secret !== coordSecret) {
        Logger.log('Rejected coordinator action "' + body._action + '": wrong or missing coordinator key');
        return ContentService
          .createTextOutput(JSON.stringify({ status: 'error', message: 'Coordinator key required' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    /* Handle coordinator config updates */
    if (body._action === 'update_zones') {
      saveZoneConfig(body.zones);
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok', message: 'Zone config saved', count: body.zones.length }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (body._action === 'update_topics') {
      saveTopicConfig(body.topics);
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok', message: 'Topic config saved', count: body.topics.length }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (body._action === 'grant_authorisation') {
      var result = grantAuthorisation(body.record);
      return ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (body._action === 'certify_trainer') {
      var result = certifyTrainer(body);
      return ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    /* Water source registry — steward registration (upload secret only) */
    if (body._action === 'register_water_source') {
      var regResult = registerWaterSource(body.record);
      return ContentService
        .createTextOutput(JSON.stringify(regResult))
        .setMimeType(ContentService.MimeType.JSON);
    }

    /* Water source registry — coordinator approval/ownership (coordinator key required) */
    if (body._action === 'update_water_sources') {
      var upResult = updateWaterSources(body.water_sources);
      return ContentService
        .createTextOutput(JSON.stringify(upResult))
        .setMimeType(ContentService.MimeType.JSON);
    }

    /* Facility registry — steward registration (upload secret only) */
    if (body._action === 'register_facility') {
      var facRegResult = registerFacility(body.record);
      return ContentService
        .createTextOutput(JSON.stringify(facRegResult))
        .setMimeType(ContentService.MimeType.JSON);
    }

    /* Facility registry — coordinator approval/ownership (coordinator key required) */
    if (body._action === 'update_facilities') {
      var facUpResult = updateFacilities(body.facilities);
      return ContentService
        .createTextOutput(JSON.stringify(facUpResult))
        .setMimeType(ContentService.MimeType.JSON);
    }

    /* Met station registry — steward registration (upload secret only) */
    if (body._action === 'register_met_station') {
      var metRegResult = registerMetStation(body.record);
      return ContentService
        .createTextOutput(JSON.stringify(metRegResult))
        .setMimeType(ContentService.MimeType.JSON);
    }

    /* Met station registry — coordinator approval/ownership (coordinator key required) */
    if (body._action === 'update_met_stations') {
      var metUpResult = updateMetStations(body.met_stations);
      return ContentService
        .createTextOutput(JSON.stringify(metUpResult))
        .setMimeType(ContentService.MimeType.JSON);
    }

    /* Phenology tree registry — steward establishment (upload secret only) */
    if (body._action === 'register_pheno_plot') {
      var phnRegResult = registerPhenoPlot(body.record);
      return ContentService
        .createTextOutput(JSON.stringify(phnRegResult))
        .setMimeType(ContentService.MimeType.JSON);
    }

    /* Phenology tree registry — coordinator approval/ownership (coordinator key required) */
    if (body._action === 'update_pheno_plots') {
      var phnUpResult = updatePhenoPlots(body.pheno_plots);
      return ContentService
        .createTextOutput(JSON.stringify(phnUpResult))
        .setMimeType(ContentService.MimeType.JSON);
    }

    /* Activity calendar — schedule an event (upload secret only) */
    if (body._action === 'register_calendar_event') {
      var calRegResult = registerCalendarEvent(body.record);
      return ContentService
        .createTextOutput(JSON.stringify(calRegResult))
        .setMimeType(ContentService.MimeType.JSON);
    }

    /* Activity calendar — coordinator overwrite (coordinator key required) */
    if (body._action === 'update_calendar') {
      var calUpResult = updateCalendar(body.calendar);
      return ContentService
        .createTextOutput(JSON.stringify(calUpResult))
        .setMimeType(ContentService.MimeType.JSON);
    }

    /* Disturbance — steward field verification (upload secret only) */
    if (body._action === 'verify_disturbance') {
      var dzVerifyResult = verifyDisturbance(body.record);
      return ContentService
        .createTextOutput(JSON.stringify(dzVerifyResult))
        .setMimeType(ContentService.MimeType.JSON);
    }

    /* Disturbance registry — coordinator triage/assignment (coordinator key required) */
    if (body._action === 'update_disturbances') {
      var dzUpResult = updateDisturbances(body.disturbances);
      return ContentService
        .createTextOutput(JSON.stringify(dzUpResult))
        .setMimeType(ContentService.MimeType.JSON);
    }

    /* Help registry — coordinator-edited field help (coordinator key required) */
    if (body._action === 'update_help') {
      var helpUpResult = updateHelp(body.help);
      return ContentService
        .createTextOutput(JSON.stringify(helpUpResult))
        .setMimeType(ContentService.MimeType.JSON);
    }

    /* Normal steward data upload */
    var folder = getDataFolder();

    /* Determine zone folder name */
    var zoneId   = (body.steward && body.steward.zone_id)  || '';
    var zoneName = (body.steward && body.steward.zone)      || '';
    var zoneDir  = zoneId ? (zoneId + '_' + zoneName.replace(/\s+/g,'_')) : 'Unzoned';
    var zoneFolder = getOrCreateFolder(zoneDir, folder);

    /* Sub-folder per steward within zone */
    var sid         = (body.steward && body.steward.stewardId) || 'UNKNOWN';
    var stewardName = (body.steward && body.steward.name)      || 'Unknown';
    var subName     = sid + '_' + stewardName.replace(/\s+/g,'_');
    var subFolder   = getOrCreateFolder(subName, zoneFolder);

    /* File name: MCA-[ID]_[Date].json — deduplicated by timestamp */
    var dateStr  = new Date().toISOString().slice(0, 10);
    var fileName = 'MCA_' + sid + '_' + dateStr + '.json';
    var content  = JSON.stringify(body, null, 2);

    /* If a file for today exists, add time suffix */
    var existing = subFolder.getFilesByName(fileName);
    if (existing.hasNext()) {
      var ts = new Date().toISOString().slice(0,16).replace(':','h');
      fileName = 'MCA_' + sid + '_' + ts + '.json';
    }

    subFolder.createFile(fileName, content, MimeType.PLAIN_TEXT);

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok', file: fileName, records: body.record_count }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/* ─── GET endpoint: ping, zones, reports ───────────────────────────── */
function doGet(e) {
  var action = (e.parameter && e.parameter.action) || 'ping';

  if (action === 'zones')  { return getZoneList();  }
  if (action === 'topics') { return getTopicList(); }
  if (action === 'water_sources') { return getWaterSources(); }
  if (action === 'facilities') { return getFacilities(); }
  if (action === 'met_stations') { return getMetStations(); }
  if (action === 'pheno_plots') { return getPhenoPlots(); }
  if (action === 'calendar') { return getCalendar(); }
  if (action === 'disturbances') { return getDisturbances(); }
  if (action === 'help') { return getHelp(); }

  if (action === 'authorisations') {
    var stewId = (e.parameter && e.parameter.stewardId) || '';
    return getAuthorisations(stewId);
  }

  if (action === 'trainer_certs') {
    var stewId = (e.parameter && e.parameter.stewardId) || '';
    return getTrainerCerts(stewId);
  }

  if (action === 'zone_report') {
    var zoneId = e.parameter.zone   || '';
    var period = e.parameter.period || 'weekly';
    try {
      var report = buildZoneReport(zoneId, period);
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok', report: report }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch(err) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  if (action === 'mcf_report') {
    var period = e.parameter.period || 'weekly';
    try {
      var report = buildMCFReport(period);
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok', report: report }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch(err) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  /* Ping / preflight */
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ready', app: 'MCA Steward Upload v3' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ─── Weekly summary email ──────────────────────────────────────────── */
function weeklyReport() {
  var report = buildMCFReport('weekly');
  var dataFolder = getDataFolder();

  var lines = ['MCA Steward App — Weekly Summary Report', ''];
  lines.push('Period: ' + report.from + ' to ' + report.to + ' (' + report.days + ' days)');
  lines.push('Active zones:    ' + report.active_zones + ' of ' + report.total_zones);
  lines.push('Active stewards: ' + report.total_stewards);
  lines.push('Total records:   ' + report.total_records);
  lines.push('');
  lines.push('─────────────────────────────────────────');
  lines.push('By zone:');
  report.zones.forEach(function(z) {
    var status = z.upload_count > 0 ? '✓' : '✗ NO DATA';
    lines.push('  ' + z.zone_id + ' ' + z.zone_name + ': ' + status);
    if (z.upload_count > 0) {
      lines.push('    Stewards: ' + z.steward_count + '  |  Records: ' + z.record_count + '  |  Active days: ' + z.active_days);
      lines.push('    Last upload: ' + (z.last_upload ? z.last_upload.slice(0,16).replace('T',' ') + ' UTC' : '—'));
      var mods = Object.keys(z.modules).map(function(m) { return m + ':' + z.modules[m]; }).join(', ');
      if (mods) lines.push('    Modules: ' + mods);
    }
  });
  lines.push('');
  lines.push('View data: https://drive.google.com/drive/folders/' + dataFolder.getId());
  lines.push('');
  lines.push('Zone reports (live): ' + ScriptApp.getService().getUrl() + '?action=zone_report&zone=Z01&period=weekly');

  var body = lines.join('\n');
  REPORT_EMAILS.forEach(function(email) {
    MailApp.sendEmail(email, 'MCA Weekly Data Report — ' + report.to, body);
  });
  Logger.log('Weekly report sent to: ' + REPORT_EMAILS.join(', '));
}

/* ─── Monthly summary email (previous full calendar month) ──────────── */
/* Set trigger: 1st of each month, 7am–8am PNG time (UTC+10) */
function monthlyReport() {
  var report = buildMCFReport('prevmonth');
  var dataFolder = getDataFolder();

  var lines = ['MCA Steward App — Monthly Summary Report', ''];
  lines.push('Period: ' + report.from + ' to ' + report.to + ' (previous calendar month)');
  lines.push('Active zones:    ' + report.active_zones + ' of ' + report.total_zones);
  lines.push('Active stewards: ' + report.total_stewards);
  lines.push('Total records:   ' + report.total_records);
  lines.push('');
  lines.push('─────────────────────────────────────────');
  lines.push('By zone:');
  report.zones.forEach(function(z) {
    var status = z.upload_count > 0 ? '✓' : '✗ NO DATA';
    lines.push('  ' + z.zone_id + ' ' + z.zone_name + ': ' + status);
    if (z.upload_count > 0) {
      lines.push('    Stewards: ' + z.steward_count + '  |  Records: ' + z.record_count + '  |  Active days: ' + z.active_days);
      var mods = Object.keys(z.modules).map(function(m) { return m + ':' + z.modules[m]; }).join(', ');
      if (mods) lines.push('    Modules: ' + mods);
    }
  });
  lines.push('');
  lines.push('View data: https://drive.google.com/drive/folders/' + dataFolder.getId());

  var body = lines.join('\n');
  REPORT_EMAILS.forEach(function(email) {
    MailApp.sendEmail(email, 'MCA Monthly Data Report — ' + report.to, body);
  });
  Logger.log('Monthly report sent to: ' + REPORT_EMAILS.join(', '));
}
