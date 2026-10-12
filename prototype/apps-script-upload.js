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
  {id:'Z01', name:'Zone 1'},   {id:'Z02', name:'Zone 2'},  {id:'Z03', name:'Zone 3'},
  {id:'Z04', name:'Zone 4'},   {id:'Z05', name:'Zone 5'},  {id:'Z06', name:'Zone 6'},
  {id:'Z07A', name:'Zone 7A'}, {id:'Z07B', name:'Zone 7B'},
  {id:'Z08', name:'Zone 8'},   {id:'Z09', name:'Zone 9'},  {id:'Z10', name:'Zone 10'}
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
/* The authoritative zone list: the coordinator-saved _zones.json if present,
   otherwise the built-in default. Used by the zones endpoint AND the reports
   so they never disagree. */
function loadZoneConfig() {
  try {
    var folder = getDataFolder();
    var files  = folder.getFilesByName('_zones.json');
    if (files.hasNext()) {
      var zones = JSON.parse(files.next().getBlob().getDataAsString());
      if (zones && zones.length) return zones;
    }
  } catch(e) { /* fall through to defaults */ }
  return DEFAULT_ZONES;
}
function getZoneList() {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', zones: loadZoneConfig() }))
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

/* ─── Date review: records captured on an unverified device clock ───────
 * _date_review.json: flagged reading records with a date bracket
 * [earliest..latest] (the last verified-online time .. the upload time) for the
 * coordinator to confirm/correct and accept. Keyed by record uid. */
function loadDateReviewList() {
  try { var f=getDataFolder(); var fs=f.getFilesByName('_date_review.json'); if(fs.hasNext()) return JSON.parse(fs.next().getBlob().getDataAsString())||[]; } catch(e){}
  return [];
}
function saveDateReviewList(list) {
  var f=getDataFolder(); var fs=f.getFilesByName('_date_review.json'); var j=JSON.stringify(list||[],null,2);
  if(fs.hasNext()) fs.next().setContent(j); else f.createFile('_date_review.json', j, MimeType.PLAIN_TEXT);
}
function getDateReview() {
  return ContentService.createTextOutput(JSON.stringify({ status:'ok', date_review: loadDateReviewList() })).setMimeType(ContentService.MimeType.JSON);
}
/* Steward posts flagged records (array) at upload — merge by uid, never clobber
 * a coordinator decision already made. */
function registerDateReview(items) {
  if(!items || !items.length) return { status:'ok', count:0 };
  var list=loadDateReviewList(); var byUid={}; for(var i=0;i<list.length;i++){ if(list[i].uid) byUid[list[i].uid]=i; }
  items.forEach(function(it){ if(!it||!it.uid) return; var idx=byUid[it.uid];
    if(idx===undefined){ it.status=it.status||'pending'; list.push(it); byUid[it.uid]=list.length-1; }
    else if(list[idx].status==='pending'){ it.status='pending'; list[idx]=it; } /* refresh pending, keep decided */ });
  saveDateReviewList(list); return { status:'ok', count:list.length };
}
/* Coordinator overwrite — corrected dates / accept / reject (coordinator key). */
function updateDateReview(list) { saveDateReviewList(list||[]); return { status:'ok', message:'Date review saved', count:(list||[]).length }; }

/* ─── Issue / error reports from the field ─────────────────────────────
 * _issues.json: steward-submitted problem reports (note + context + optional
 * screenshot) so a steward blocked by a bug can still get work/evidence in. */
function loadIssuesList() {
  try { var f=getDataFolder(); var fs=f.getFilesByName('_issues.json'); if(fs.hasNext()) return JSON.parse(fs.next().getBlob().getDataAsString())||[]; } catch(e){}
  return [];
}
function saveIssuesList(list) {
  var f=getDataFolder(); var fs=f.getFilesByName('_issues.json'); var j=JSON.stringify(list||[],null,2);
  if(fs.hasNext()) fs.next().setContent(j); else f.createFile('_issues.json', j, MimeType.PLAIN_TEXT);
}
function getIssues() {
  return ContentService.createTextOutput(JSON.stringify({ status:'ok', issues: loadIssuesList() })).setMimeType(ContentService.MimeType.JSON);
}
function registerIssue(rec) {
  if(!rec || !rec.uid) return { status:'error', message:'Missing issue uid' };
  var list=loadIssuesList();
  for(var i=0;i<list.length;i++){ if(list[i].uid===rec.uid) return { status:'ok', uid:rec.uid, note:'duplicate ignored' }; }
  rec.status=rec.status||'open'; list.push(rec); saveIssuesList(list);
  return { status:'ok', uid:rec.uid, count:list.length };
}
function updateIssues(list) { saveIssuesList(list||[]); return { status:'ok', message:'Issues saved', count:(list||[]).length }; }

/* ─── Report recipients registry ───────────────────────────────────────
 * _recipients.json in the data folder, maintained by the coordinator
 * (update_recipients — coordinator key required). Defines where compiled
 * reports go. Emails live ONLY in this Drive file, never in source.
 *   { "field_reports_to": "matilda@example.org",   // ALL field-officer reports
 *     "comms": ["comms@example.org"],              // distribution media + ledger
 *     "consultants": { "<stewardId>": "email" } }  // each consultant's own report
 * Not exposed over GET (emails are not returned to phones); read server-side
 * by the report jobs. To seed it once from the editor, run seedRecipients(). */
function loadRecipients() {
  try { var f=getDataFolder(); var fs=f.getFilesByName('_recipients.json'); if(fs.hasNext()) return JSON.parse(fs.next().getBlob().getDataAsString())||{}; } catch(e){}
  return {};
}
function saveRecipients(obj) {
  var f=getDataFolder(); var fs=f.getFilesByName('_recipients.json'); var j=JSON.stringify(obj||{},null,2);
  if(fs.hasNext()) fs.next().setContent(j); else f.createFile('_recipients.json', j, MimeType.PLAIN_TEXT);
}
function updateRecipients(obj) { saveRecipients(obj||{}); return { status:'ok', message:'Recipients saved' }; }
/* One-time convenience: fill in and run from the Apps Script editor instead of
 * sending a coordinator action. Leave blank the ones you don't have yet. */
function seedRecipients() {
  saveRecipients({
    field_reports_to: '',          /* Matilda's email */
    comms: [],                     /* ['comms@example.org'] */
    consultants: {}                /* { 'CIFOR-ICRAF 01': 'name@example.org' } */
  });
  Logger.log('Seeded _recipients.json — edit it via update_recipients or re-run seedRecipients.');
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
  var zones = loadZoneConfig();
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
  var zones = loadZoneConfig();
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
    var COORDINATOR_ACTIONS = ['update_zones', 'update_topics', 'grant_authorisation', 'certify_trainer', 'update_water_sources', 'update_facilities', 'update_met_stations', 'update_pheno_plots', 'update_calendar', 'update_disturbances', 'update_help', 'update_date_review', 'update_issues', 'update_recipients'];
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

    /* Date review — steward posts flagged records at upload (upload secret only) */
    if (body._action === 'register_date_review') {
      return ContentService.createTextOutput(JSON.stringify(registerDateReview(body.items))).setMimeType(ContentService.MimeType.JSON);
    }
    /* Date review — coordinator correct/accept/reject (coordinator key required) */
    if (body._action === 'update_date_review') {
      return ContentService.createTextOutput(JSON.stringify(updateDateReview(body.date_review))).setMimeType(ContentService.MimeType.JSON);
    }
    /* Issue report — steward submits a problem (upload secret only) */
    if (body._action === 'register_issue') {
      return ContentService.createTextOutput(JSON.stringify(registerIssue(body.record))).setMimeType(ContentService.MimeType.JSON);
    }
    /* Issues — coordinator mark resolved / overwrite (coordinator key required) */
    if (body._action === 'update_issues') {
      return ContentService.createTextOutput(JSON.stringify(updateIssues(body.issues))).setMimeType(ContentService.MimeType.JSON);
    }
    /* Report recipients — coordinator maintains the email list (coordinator key required) */
    if (body._action === 'update_recipients') {
      return ContentService.createTextOutput(JSON.stringify(updateRecipients(body.recipients))).setMimeType(ContentService.MimeType.JSON);
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
  if (action === 'date_review') { return getDateReview(); }
  if (action === 'issues') { return getIssues(); }

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

  /* Ping / preflight — server_time is the authoritative UTC clock the app
     anchors to so it can detect a wrong device date offline. */
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ready', app: 'MCA Steward Upload v3', server_time: new Date().toISOString() }))
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

/* ─── Monthly distribution / handover ledger ────────────────────────────
 * ONE report each month listing what was given out, with the handover photos
 * and video extracted from the uploaded bundle into standalone Drive files so
 * the comms team can review them and the ledger can link to them.
 *
 * Routing (from _recipients.json): distributions are field-officer work, so the
 * ledger goes to field_reports_to (Matilda); comms also get the ledger + the
 * month's media folder as viewers. If no recipients are set it falls back to
 * REPORT_EMAILS.
 *
 * TRIGGER: run installMonthlyDistributionTrigger() once (1st of month, ~7am PNG,
 * project time zone Asia/Port_Moresby). Run monthlyDistributionReport() from the
 * editor any time for last month, or monthlyDistributionReport('monthly') for
 * the current month so far. Media that is base64 in the bundle becomes real
 * jpeg/mp4 files here (which also lets the bundle be media-stripped later). */

function _recInstant(rec) {
  var t = rec.recorded_at || rec.timestamp || rec.device_time || '';
  var ms = Date.parse(t);
  return isNaN(ms) ? 0 : ms;
}

function _pngDate(d, fmt) {
  var dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  return Utilities.formatDate(dt, 'Pacific/Port_Moresby', fmt || 'yyyy-MM-dd');
}

function _dataUriToBlob(uri, name) {
  if (!uri || typeof uri !== 'string' || uri.indexOf('data:') !== 0) return null;
  var m = uri.match(/^data:([^;]+);base64,([\s\S]*)$/);
  if (!m) return null;
  try { return Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], name); }
  catch(e) { return null; }
}

/* Save one base64 data: blob as a standalone file; returns its Drive URL
 * (idempotent — reuses the file if a file of that name already exists). */
function _saveMedia(folder, name, dataUri) {
  var existing = folder.getFilesByName(name);
  if (existing.hasNext()) return existing.next().getUrl();
  var blob = _dataUriToBlob(dataUri, name);
  if (!blob) return '';
  return folder.createFile(blob).getUrl();
}
function _extractMedia(folder, uid, slot, dataUri, ext) {
  return _saveMedia(folder, 'DIST_' + uid + '_' + slot + '.' + ext, dataUri);
}

/* Walk every steward subfolder, gather distribution records, dedup by
 * record_uid keeping the latest instant. Pilot-scale: scans all bundles. */
function collectDistributions() {
  var folder = getDataFolder();
  var byUid = {};
  var zones = folder.getFolders();
  while (zones.hasNext()) {
    var zf = zones.next();
    if (zf.getName().charAt(0) === '_') continue;          /* skip _media/_reports/config */
    var subs = zf.getFolders();
    while (subs.hasNext()) {
      var files = subs.next().getFilesByType(MimeType.PLAIN_TEXT);
      while (files.hasNext()) {
        var body;
        try { body = JSON.parse(files.next().getBlob().getDataAsString()); } catch(e) { continue; }
        var dists = (body.modules && body.modules.distributions) || [];
        if (!dists.length) continue;
        var stew = body.steward || {};
        for (var i = 0; i < dists.length; i++) {
          var rec = dists[i];
          var uid = rec.record_uid || rec.uid;
          if (!uid) continue;
          var prev = byUid[uid];
          if (prev && _recInstant(prev.rec) >= _recInstant(rec)) continue;  /* keep latest */
          byUid[uid] = { rec: rec, steward: stew };
        }
      }
    }
  }
  return Object.keys(byUid).map(function(k){ return byUid[k]; });
}

function _distItemsText(items) {
  if (!items || !items.length) return '';
  return items.map(function(it){
    var s = '';
    if (it.category)    s += it.category + ': ';
    s += (it.description || '');
    if (it.quantity != null && it.quantity !== '') s += ' × ' + it.quantity + (it.unit ? (' ' + it.unit) : '');
    return s;
  }).join(' ; ');
}

function monthlyDistributionReport(period) {
  period = (typeof period === 'string') ? period : 'prevmonth';   /* trigger passes an event object */
  var cutoff, periodEnd;
  if (period === 'monthly') { cutoff = currentMonthStart(); periodEnd = new Date(); }
  else { cutoff = prevMonthStart(); periodEnd = prevMonthEnd(); }
  var ym = _pngDate(cutoff, 'yyyy-MM');
  var cutMs = cutoff.getTime(), endMs = periodEnd.getTime();

  var rows = collectDistributions().filter(function(x){
    var t = _recInstant(x.rec); return t >= cutMs && t <= endMs;
  });

  var folder       = getDataFolder();
  var mediaMonth   = getOrCreateFolder(ym, getOrCreateFolder('_media', folder));
  var reportsFolder= getOrCreateFolder('_reports', folder);

  /* Fresh ledger for the month (replace any previous run for the same month). */
  var ssName = 'Distribution ledger ' + ym;
  var old = reportsFolder.getFilesByName(ssName);
  while (old.hasNext()) { try { old.next().setTrashed(true); } catch(e){} }
  var ss = SpreadsheetApp.create(ssName);
  var sheet = ss.getActiveSheet();
  sheet.appendRow(['Date (PNG)','Officer','Zone','Recipient','Recipient type','Received by','Recipient clan','Items','Purpose','Donor','Donor recognised','Confirmed receipt','GPS','Handover photo','Receipt photo','Video','record_uid']);

  rows.sort(function(a,b){ return _recInstant(a.rec) - _recInstant(b.rec); });
  rows.forEach(function(x){
    var r = x.rec, s = x.steward, o = r.officer || {}, rp = r.recipient || {};
    var uid = r.record_uid || r.uid;
    var hLink = _extractMedia(mediaMonth, uid, 'handover', r.photo_handover, 'jpg');
    var rLink = _extractMedia(mediaMonth, uid, 'receipt',  r.photo_receipt,  'jpg');
    var vLink = _extractMedia(mediaMonth, uid, 'video',    r.video,          'mp4');
    var gps = (r.gps && r.gps.lat != null) ? (r.gps.lat + ', ' + r.gps.lng + (r.gps.accuracy ? (' ±' + r.gps.accuracy + 'm') : '') + (r.gps_source ? (' (' + r.gps_source + ')') : '')) : '';
    sheet.appendRow([
      _pngDate(_recInstant(r) ? new Date(_recInstant(r)) : '', 'yyyy-MM-dd HH:mm'),
      (o.name || s.name || '') + (o.steward_id ? (' (' + o.steward_id + ')') : ''),
      s.zone || '',
      rp.name || '', rp.type || '', rp.received_by || '', rp.clan || '',
      _distItemsText(r.items),
      [r.purpose_category, r.purpose].filter(String).join(' — '),
      r.donor || '',
      (r.donor_recognised === true ? 'Yes' : (r.donor_recognised === false ? 'No' : '')),
      (rp.confirmed_receipt === true ? 'Yes' : (rp.confirmed_receipt === false ? 'No' : '')),
      gps, hLink, rLink, vLink, uid
    ]);
  });

  /* Move the new spreadsheet out of My Drive root into _reports. */
  var ssFile = DriveApp.getFileById(ss.getId());
  try { reportsFolder.addFile(ssFile); DriveApp.getRootFolder().removeFile(ssFile); } catch(e){}

  /* Recipients: Matilda (field_reports_to) + comms get the ledger + media. */
  var rcp = loadRecipients();
  var to = [];
  if (rcp.field_reports_to) to.push(rcp.field_reports_to);
  (rcp.comms || []).forEach(function(e){ if (e) to.push(e); });
  if (!to.length) to = REPORT_EMAILS.slice();
  to.forEach(function(email){
    try { mediaMonth.addViewer(email); } catch(e){}
    try { ssFile.addViewer(email); } catch(e){}
  });

  var body = [
    'MCA Steward App — Monthly distribution / handover ledger',
    '',
    'Month: ' + ym + ' (PNG time)',
    'Handovers: ' + rows.length,
    '',
    'Ledger (Google Sheet): ' + ss.getUrl(),
    'Photos & video for the month: ' + mediaMonth.getUrl(),
    '',
    'Each row links to the handover photo, receipt photo and video.'
  ].join('\n');
  to.forEach(function(email){ MailApp.sendEmail(email, 'MCA Distribution ledger — ' + ym, body); });
  Logger.log('Distribution ledger ' + ym + ': ' + rows.length + ' handovers → ' + to.join(', '));
  return { status: 'ok', month: ym, handovers: rows.length, ledger: ss.getUrl(), media: mediaMonth.getUrl() };
}

function installMonthlyDistributionTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === 'monthlyDistributionReport') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('monthlyDistributionReport').timeBased().onMonthDay(1).atHour(7).create();
  Logger.log('Monthly distribution trigger installed (1st of month, 7am PNG).');
}

/* ─── Per-consultant report (training given + sites visited) ─────────────
 * Each visiting consultant gets THEIR OWN report back — training they ran and
 * sites they visited (field maps) for the month — not a pooled one. Emailed to
 * the address held for that stewardId in _recipients.json ("consultants").
 *
 * TRIGGER: run installConsultantReportsTrigger() once (1st of month, ~7am PNG).
 * Run consultantReports() from the editor for last month, or
 * consultantReports('monthly') for the current month so far. A consultant with
 * no email set still gets a report file (logged) — it just isn't emailed. */
function collectConsultantWork() {
  var folder = getDataFolder();
  var byConsultant = {};          /* stewardId -> { steward, training:{uid:rec}, sites:{uid:rec} } */
  var zones = folder.getFolders();
  while (zones.hasNext()) {
    var zf = zones.next();
    if (zf.getName().charAt(0) === '_') continue;
    var subs = zf.getFolders();
    while (subs.hasNext()) {
      var files = subs.next().getFilesByType(MimeType.PLAIN_TEXT);
      while (files.hasNext()) {
        var body;
        try { body = JSON.parse(files.next().getBlob().getDataAsString()); } catch(e) { continue; }
        var stew = body.steward || {};
        if (stew.role !== 'consultant') continue;
        var sid = stew.stewardId || 'UNKNOWN';
        if (!byConsultant[sid]) byConsultant[sid] = { steward: stew, training: {}, sites: {} };
        var acc = byConsultant[sid], mods = body.modules || {};
        (mods.training || []).forEach(function(r){ var u=r.record_uid||r.uid; if(!u) return; var p=acc.training[u]; if(p && _recInstant(p)>=_recInstant(r)) return; acc.training[u]=r; });
        (mods.freemap  || []).forEach(function(r){ var u=r.record_uid||r.uid; if(!u) return; var p=acc.sites[u];    if(p && _recInstant(p)>=_recInstant(r)) return; acc.sites[u]=r; });
      }
    }
  }
  return byConsultant;
}

function _num(v){ var n = parseFloat(v); return isNaN(n) ? 0 : n; }

function consultantReports(period) {
  period = (typeof period === 'string') ? period : 'prevmonth';
  var cutoff, periodEnd;
  if (period === 'monthly') { cutoff = currentMonthStart(); periodEnd = new Date(); }
  else { cutoff = prevMonthStart(); periodEnd = prevMonthEnd(); }
  var ym = _pngDate(cutoff, 'yyyy-MM');
  var cutMs = cutoff.getTime(), endMs = periodEnd.getTime();

  var folder        = getDataFolder();
  var reportsFolder = getOrCreateFolder('_reports', folder);
  var consRoot      = getOrCreateFolder('consultants', getOrCreateFolder('_media', folder));
  var consEmails    = (loadRecipients().consultants) || {};
  var inMonth = function(r){ var t=_recInstant(r); return t>=cutMs && t<=endMs; };
  var byTime  = function(a,b){ return _recInstant(a) - _recInstant(b); };

  var all = collectConsultantWork();
  var out = [];
  Object.keys(all).forEach(function(sid){
    var c = all[sid];
    var training = Object.keys(c.training).map(function(k){ return c.training[k]; }).filter(inMonth).sort(byTime);
    var sites    = Object.keys(c.sites).map(function(k){ return c.sites[k]; }).filter(inMonth).sort(byTime);
    if (!training.length && !sites.length) return;              /* nothing this month */

    var name = c.steward.name || sid;
    var mediaFolder = getOrCreateFolder(ym, getOrCreateFolder(sid, consRoot));

    var ssName = 'Consultant report ' + name + ' ' + ym;
    var oldf = reportsFolder.getFilesByName(ssName); while (oldf.hasNext()) { try { oldf.next().setTrashed(true); } catch(e){} }
    var ss = SpreadsheetApp.create(ssName);

    /* Training given */
    var ts = ss.getActiveSheet(); ts.setName('Training given');
    ts.appendRow(['Date (PNG)','Type','Topic','Location','Duration','Pax F','Pax M','Pax youth','Pax total','Materials','Topics covered','Outcomes','Follow-up','Challenges','Notes','Photo','record_uid']);
    training.forEach(function(r){
      var uid = r.record_uid || r.uid;
      var photo = _saveMedia(mediaFolder, 'TRAIN_' + uid + '.jpg', r.photo);
      ts.appendRow([
        _pngDate(_recInstant(r) ? new Date(_recInstant(r)) : '', 'yyyy-MM-dd HH:mm'),
        r.type || '', r.topic || '', r.location || '', r.duration || '',
        _num(r.pax_female), _num(r.pax_male), _num(r.pax_youth),
        _num(r.pax_female) + _num(r.pax_male) + _num(r.pax_youth),
        (r.materials && r.materials.length ? r.materials.join(', ') : ''),
        r.topics_covered || '', r.outcomes || '', r.followup || '', r.challenges || '', r.notes || '',
        photo, uid
      ]);
    });

    /* Sites visited (field maps) */
    var vs = ss.insertSheet('Sites visited');
    vs.appendRow(['Date (PNG)','Category','Title','Description','Shape','Area (ha)','Length (m)','Points','Map link','Photo','record_uid']);
    sites.forEach(function(r){
      var uid = r.record_uid || r.uid;
      var photo = _saveMedia(mediaFolder, 'SITE_' + uid + '.jpg', r.photo);
      var p0 = (r.points && r.points[0]) ? r.points[0] : null;
      var mapLink = p0 ? ('https://www.google.com/maps?q=' + p0.lat + ',' + p0.lon) : '';
      vs.appendRow([
        _pngDate(_recInstant(r) ? new Date(_recInstant(r)) : '', 'yyyy-MM-dd HH:mm'),
        r.category_label || r.category || '', r.title || '', r.description || '',
        r.map_type || '',
        (r.area_ha != null ? r.area_ha : ''), (r.length_m != null ? r.length_m : ''),
        (r.points && r.points.length) || 0,
        mapLink, photo, uid
      ]);
    });

    var ssFile = DriveApp.getFileById(ss.getId());
    try { reportsFolder.addFile(ssFile); DriveApp.getRootFolder().removeFile(ssFile); } catch(e){}

    var to = consEmails[sid];
    if (to) {
      try { ssFile.addViewer(to); } catch(e){}
      try { mediaFolder.addViewer(to); } catch(e){}
      var body = [
        'Your MCA consultant report — ' + ym + ' (PNG time)',
        '',
        'Training sessions: ' + training.length,
        'Sites visited: ' + sites.length,
        '',
        'Report (Google Sheet): ' + ss.getUrl(),
        'Your photos for the month: ' + mediaFolder.getUrl()
      ].join('\n');
      MailApp.sendEmail(to, 'Your MCA consultant report — ' + ym, body);
    } else {
      Logger.log('No email for consultant ' + sid + ' (' + name + ') — report made but not sent: ' + ss.getUrl());
    }
    out.push({ stewardId: sid, name: name, training: training.length, sites: sites.length, report: ss.getUrl(), emailed: !!to });
  });
  Logger.log('Consultant reports ' + ym + ': ' + out.length + ' consultant(s) with activity.');
  return { status: 'ok', month: ym, reports: out };
}

function installConsultantReportsTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === 'consultantReports') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('consultantReports').timeBased().onMonthDay(1).atHour(7).create();
  Logger.log('Monthly consultant-reports trigger installed (1st of month, 7am PNG).');
}

/* ─── Field-officer reports (to Matilda) ─────────────────────────────────
 * Field-officer work all goes to one destination — Matilda
 * (_recipients.json → field_reports_to; falls back to REPORT_EMAILS). Three
 * monthly outputs, all PNG time, all emailed to Matilda in one message:
 *   1. Field officer report <YYYY-MM>            — summary, one row per officer
 *                                                  (active days + counts per module)
 *   2. Field officer training <YYYY-MM>          — one row per training session
 *                                                  (only produced if any exist)
 *   3. Field officer mapping & observations …    — one row per field map /
 *                                                  observation (only if any exist)
 * Distributions have their own ledger (monthlyDistributionReport); the summary
 * still counts them and points there. TRIGGER: installFieldOfficerReportsTrigger()
 * once (1st of month, 7am PNG). Run fieldOfficerReports('monthly') on demand. */

/* Generic: all records from bundles of a given role, grouped by steward then
 * module, deduped by record_uid (latest kept). */
function collectRecordsByRole(role) {
  var folder = getDataFolder();
  var out = {};                   /* stewardId -> { steward, mods: { modName: {uid:rec} } } */
  var zones = folder.getFolders();
  while (zones.hasNext()) {
    var zf = zones.next();
    if (zf.getName().charAt(0) === '_') continue;
    var subs = zf.getFolders();
    while (subs.hasNext()) {
      var files = subs.next().getFilesByType(MimeType.PLAIN_TEXT);
      while (files.hasNext()) {
        var body;
        try { body = JSON.parse(files.next().getBlob().getDataAsString()); } catch(e) { continue; }
        var stew = body.steward || {};
        if (stew.role !== role) continue;
        var sid = stew.stewardId || 'UNKNOWN';
        if (!out[sid]) out[sid] = { steward: stew, mods: {} };
        var mods = body.modules || {};
        Object.keys(mods).forEach(function(mn){
          var arr = mods[mn]; if (!arr || !arr.length) return;
          if (!out[sid].mods[mn]) out[sid].mods[mn] = {};
          arr.forEach(function(r){ var u=r.record_uid||r.uid; if(!u) return; var p=out[sid].mods[mn][u]; if(p && _recInstant(p)>=_recInstant(r)) return; out[sid].mods[mn][u]=r; });
        });
      }
    }
  }
  return out;
}

function _fmExtra(r) {
  var bits = [];
  if (r.crops) bits.push('crops: ' + r.crops);
  if (r.track_type) bits.push('track: ' + r.track_type);
  if (r.plant_problem) bits.push('problem: ' + r.plant_problem);
  if (r.processing && r.processing.stage) bits.push('processing: ' + r.processing.stage);
  return bits.join('; ');
}

function fieldOfficerReports(period) {
  period = (typeof period === 'string') ? period : 'prevmonth';
  var cutoff, periodEnd;
  if (period === 'monthly') { cutoff = currentMonthStart(); periodEnd = new Date(); }
  else { cutoff = prevMonthStart(); periodEnd = prevMonthEnd(); }
  var ym = _pngDate(cutoff, 'yyyy-MM');
  var cutMs = cutoff.getTime(), endMs = periodEnd.getTime();
  var inMonth = function(r){ var t=_recInstant(r); return t>=cutMs && t<=endMs; };
  var byTime  = function(a,b){ return _recInstant(a) - _recInstant(b); };
  var when    = function(r){ return _pngDate(_recInstant(r) ? new Date(_recInstant(r)) : '', 'yyyy-MM-dd HH:mm'); };

  var folder        = getDataFolder();
  var reportsFolder = getOrCreateFolder('_reports', folder);
  var mediaFolder   = getOrCreateFolder(ym, getOrCreateFolder('field_officers', getOrCreateFolder('_media', folder)));

  var all = collectRecordsByRole('field_officer');
  var MODS = ['training','freemap','distributions','water','gov','phenology','met','mafia'];
  var summaryRows = [], trainingRows = [], mapRows = [];

  Object.keys(all).forEach(function(sid){
    var c = all[sid], s = c.steward, counts = {}, days = {}, total = 0;
    MODS.forEach(function(mn){
      var recs = c.mods[mn] ? Object.keys(c.mods[mn]).map(function(k){ return c.mods[mn][k]; }).filter(inMonth) : [];
      counts[mn] = recs.length; total += recs.length;
      recs.forEach(function(r){ days[_pngDate(new Date(_recInstant(r)), 'yyyy-MM-dd')] = true; });
      if (mn === 'training') recs.sort(byTime).forEach(function(r){ trainingRows.push({ s:s, r:r }); });
      if (mn === 'freemap')  recs.sort(byTime).forEach(function(r){ mapRows.push({ s:s, r:r }); });
    });
    if (total === 0) return;
    summaryRows.push({ s:s, counts:counts, total:total, days:Object.keys(days).length });
  });

  var made = [];
  function newSheet(name){
    var old = reportsFolder.getFilesByName(name); while (old.hasNext()) { try { old.next().setTrashed(true); } catch(e){} }
    var ss = SpreadsheetApp.create(name);
    return ss;
  }
  function stash(ss){ var f = DriveApp.getFileById(ss.getId()); try { reportsFolder.addFile(f); DriveApp.getRootFolder().removeFile(f); } catch(e){} return f; }

  /* 1. Summary — always, if any field-officer activity */
  var summaryUrl = '';
  if (summaryRows.length) {
    var ss1 = newSheet('Field officer report ' + ym);
    var sh1 = ss1.getActiveSheet();
    sh1.appendRow(['Officer','Zone','Clan','Active days','Training','Field maps & obs','Distributions','Water','Gov services','Phenology','Met','MaFIA','Total']);
    summaryRows.sort(function(a,b){ return (a.s.name||'').localeCompare(b.s.name||''); });
    summaryRows.forEach(function(x){
      var s = x.s, c = x.counts;
      sh1.appendRow([ (s.name||'')+' ('+(s.stewardId||'')+')', s.zone||'', s.clan||'', x.days,
        c.training||0, c.freemap||0, c.distributions||0, c.water||0, c.gov||0, c.phenology||0, c.met||0, c.mafia||0, x.total ]);
    });
    summaryUrl = ss1.getUrl(); stash(ss1); made.push('Summary: ' + summaryUrl);
  }

  /* 2. Training — only if any */
  var trainingUrl = '';
  if (trainingRows.length) {
    var ss2 = newSheet('Field officer training ' + ym);
    var sh2 = ss2.getActiveSheet();
    sh2.appendRow(['Officer','Date (PNG)','Type','Topic','Location','Duration','Pax F','Pax M','Pax youth','Pax total','Materials','Topics covered','Outcomes','Follow-up','Challenges','Notes','Photo','record_uid']);
    trainingRows.forEach(function(x){
      var r = x.r, s = x.s, uid = r.record_uid || r.uid;
      sh2.appendRow([ (s.name||'')+' ('+(s.stewardId||'')+')', when(r), r.type||'', r.topic||'', r.location||'', r.duration||'',
        _num(r.pax_female), _num(r.pax_male), _num(r.pax_youth), _num(r.pax_female)+_num(r.pax_male)+_num(r.pax_youth),
        (r.materials&&r.materials.length?r.materials.join(', '):''), r.topics_covered||'', r.outcomes||'', r.followup||'', r.challenges||'', r.notes||'',
        _saveMedia(mediaFolder, 'TRAIN_'+uid+'.jpg', r.photo), uid ]);
    });
    trainingUrl = ss2.getUrl(); stash(ss2); made.push('Training: ' + trainingUrl);
  }

  /* 3. Field mapping & observations — only if any */
  var mapUrl = '';
  if (mapRows.length) {
    var ss3 = newSheet('Field officer mapping & observations ' + ym);
    var sh3 = ss3.getActiveSheet();
    sh3.appendRow(['Officer','Date (PNG)','Category','Title','Description','Shape','Area (ha)','Length (m)','Points','Detail','Map link','Photo','record_uid']);
    mapRows.forEach(function(x){
      var r = x.r, s = x.s, uid = r.record_uid || r.uid;
      var p0 = (r.points && r.points[0]) ? r.points[0] : null;
      sh3.appendRow([ (s.name||'')+' ('+(s.stewardId||'')+')', when(r), r.category_label||r.category||'', r.title||'', r.description||'',
        r.map_type||'', (r.area_ha!=null?r.area_ha:''), (r.length_m!=null?r.length_m:''), (r.points&&r.points.length)||0,
        _fmExtra(r), p0?('https://www.google.com/maps?q='+p0.lat+','+p0.lon):'',
        _saveMedia(mediaFolder, 'SITE_'+uid+'.jpg', r.photo), uid ]);
    });
    mapUrl = ss3.getUrl(); stash(ss3); made.push('Mapping & observations: ' + mapUrl);
  }

  /* Recipient: Matilda */
  var rcp = loadRecipients();
  var to = rcp.field_reports_to ? [rcp.field_reports_to] : REPORT_EMAILS.slice();
  to.forEach(function(email){ try { mediaFolder.addViewer(email); } catch(e){} });
  /* share the sheets we just made with Matilda */
  ['Field officer report ' + ym, 'Field officer training ' + ym, 'Field officer mapping & observations ' + ym].forEach(function(nm){
    var it = reportsFolder.getFilesByName(nm);
    while (it.hasNext()) { var f = it.next(); to.forEach(function(email){ try { f.addViewer(email); } catch(e){} }); }
  });

  if (!made.length) { Logger.log('Field officer reports ' + ym + ': no activity.'); return { status:'ok', month:ym, made:[] }; }
  var body = ['MCA Steward App — Field officer reports — ' + ym + ' (PNG time)','',
    'Officers active: ' + summaryRows.length,
    'Training sessions: ' + trainingRows.length,
    'Field maps & observations: ' + mapRows.length,
    '', 'Reports:'].concat(made.map(function(m){ return '  ' + m; }))
    .concat(['', 'Photos for the month: ' + mediaFolder.getUrl()]).join('\n');
  to.forEach(function(email){ MailApp.sendEmail(email, 'MCA Field officer reports — ' + ym, body); });
  Logger.log('Field officer reports ' + ym + ' → ' + to.join(', ') + ' (' + made.length + ' sheet(s)).');
  return { status:'ok', month:ym, officers:summaryRows.length, training:trainingRows.length, maps:mapRows.length, summary:summaryUrl, training_url:trainingUrl, map_url:mapUrl };
}

function installFieldOfficerReportsTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === 'fieldOfficerReports') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('fieldOfficerReports').timeBased().onMonthDay(1).atHour(7).create();
  Logger.log('Monthly field-officer-reports trigger installed (1st of month, 7am PNG).');
}

/* ─── Clan-steward compliance report ─────────────────────────────────────
 * "Were the regular tasks done, against target?" — but the target is almost
 * never a fixed number: it is the REGISTRY. A clan is due to monitor the
 * phenology trees / water sources / facilities / met stations REGISTERED to it,
 * so the denominator scales as those are registered (a clan with no coffee/cocoa
 * has 0 trees → shown "—", not 0% failing). The one fixed target is MaFIA: 1 per
 * period. Water / gov / met registries are not populated yet, so those columns
 * read "—" until clan-owned sites exist — then they light up automatically.
 *
 * Compliance per clan steward = distinct registered items (owned by their clan)
 * that have a monitoring record this period ÷ items registered to that clan.
 * Tiered: clan steward → zone → MCA. Monthly, PNG time. Sent to MCF oversight
 * (REPORT_EMAILS) + Matilda (field_reports_to). TRIGGER:
 * installClanComplianceTrigger() (1st of month, 7am PNG). On demand:
 * clanComplianceReport('monthly'). */

var COMPLIANCE_MAFIA_TARGET = 1;   /* MaFIA expected per report period (cadence TBD — adjust if not monthly) */

function _ownedApproved(list, clan) {
  return (list || []).filter(function(it){ return it && it.status === 'approved' && (it.owner_clan === clan || it.owner_clan_2 === clan); });
}
/* distinct registry-item ids referenced by this steward's monitoring records
 * (module `mod`, id field `idKey`) in the period, limited to `ownedIds`. */
function _monitoredOwned(modMap, idKey, ownedIds, inMonth) {
  if (!modMap) return 0;
  var owned = {}; ownedIds.forEach(function(id){ owned[String(id)] = true; });
  var seen = {};
  Object.keys(modMap).forEach(function(u){
    var r = modMap[u];
    if (!inMonth(r)) return;
    var id = r[idKey];
    if (id == null) return;
    if (owned[String(id)]) seen[String(id)] = true;
  });
  return Object.keys(seen).length;
}
function _complCell(done, reg) { return reg ? (done + '/' + reg + (done >= reg ? ' ✓' : '')) : '—'; }
/* Did this steward sync ANY record dated in the period? (participation) */
function _reportedThisMonth(mods, inMonth) {
  var mk = Object.keys(mods || {});
  for (var i = 0; i < mk.length; i++) {
    var mm = mods[mk[i]], us = Object.keys(mm);
    for (var j = 0; j < us.length; j++) { if (inMonth(mm[us[j]])) return true; }
  }
  return false;
}

function clanComplianceReport(period) {
  period = (typeof period === 'string') ? period : 'prevmonth';
  var cutoff, periodEnd;
  if (period === 'monthly') { cutoff = currentMonthStart(); periodEnd = new Date(); }
  else { cutoff = prevMonthStart(); periodEnd = prevMonthEnd(); }
  var ym = _pngDate(cutoff, 'yyyy-MM');
  var cutMs = cutoff.getTime(), endMs = periodEnd.getTime();
  var inMonth = function(r){ var t=_recInstant(r); return t>=cutMs && t<=endMs; };
  var monthCount = function(modMap){ if(!modMap) return 0; var n=0; Object.keys(modMap).forEach(function(u){ if(inMonth(modMap[u])) n++; }); return n; };

  var phenoList = loadPhenoPlotsList(), waterList = loadWaterSourcesList(),
      facList   = loadFacilitiesList(), metList   = loadMetStationsList();
  var ids = function(arr){ return arr.map(function(it){ return (it.id != null) ? it.id : it.uid; }); };

  var all = collectRecordsByRole('clan_steward');
  var rows = [];
  Object.keys(all).forEach(function(sid){
    var c = all[sid], s = c.steward, clan = s.clan || '';
    var phenoReg = _ownedApproved(phenoList, clan), waterReg = _ownedApproved(waterList, clan),
        facReg   = _ownedApproved(facList, clan),   metReg   = _ownedApproved(metList, clan);
    var maf = monthCount(c.mods.mafia);
    rows.push({
      s: s, clan: clan,
      reported: _reportedThisMonth(c.mods, inMonth),
      maf: maf,
      pheno: { done: _monitoredOwned(c.mods.phenology,      'plot_id',        ids(phenoReg), inMonth), reg: phenoReg.length },
      water: { done: _monitoredOwned(c.mods.water,          'water_source_id',ids(waterReg), inMonth), reg: waterReg.length },
      gov:   { done: _monitoredOwned(c.mods.facility_visits,'facility_id',    ids(facReg),   inMonth), reg: facReg.length },
      met:   { done: _monitoredOwned(c.mods.met_readings,   'met_station_id', ids(metReg),   inMonth), reg: metReg.length }
    });
  });
  rows.sort(function(a,b){ return (a.s.zone||'').localeCompare(b.s.zone||'') || (a.s.name||'').localeCompare(b.s.name||''); });

  var folder = getDataFolder(), reportsFolder = getOrCreateFolder('_reports', folder);
  var ssName = 'Clan steward compliance ' + ym;
  var old = reportsFolder.getFilesByName(ssName); while (old.hasNext()) { try { old.next().setTrashed(true); } catch(e){} }
  var ss = SpreadsheetApp.create(ssName);

  /* Tab 1 — by clan steward */
  var sh = ss.getActiveSheet(); sh.setName('By clan steward');
  sh.appendRow(['Clan steward','Zone','Clan','Reported this month','MaFIA (target '+COMPLIANCE_MAFIA_TARGET+')','Phenology','Water quality','Gov services','Met stations']);
  rows.forEach(function(x){
    sh.appendRow([ (x.s.name||'')+' ('+(x.s.stewardId||'')+')', x.s.zone||'', x.clan,
      (x.reported ? 'Yes' : 'No'),
      (x.maf>=COMPLIANCE_MAFIA_TARGET ? (x.maf+'/'+COMPLIANCE_MAFIA_TARGET+' ✓') : (x.maf+'/'+COMPLIANCE_MAFIA_TARGET)),
      _complCell(x.pheno.done,x.pheno.reg), _complCell(x.water.done,x.water.reg),
      _complCell(x.gov.done,x.gov.reg), _complCell(x.met.done,x.met.reg) ]);
  });

  /* Tab 2 — rollup by zone + MCA */
  var zoneMap = {};
  rows.forEach(function(x){
    var z = x.s.zone || '—';
    if (!zoneMap[z]) zoneMap[z] = { stewards:0, reported:0, mafDone:0, pD:0,pR:0, wD:0,wR:0, gD:0,gR:0, mD:0,mR:0 };
    var zm = zoneMap[z];
    zm.stewards++; if (x.reported) zm.reported++; if (x.maf>=COMPLIANCE_MAFIA_TARGET) zm.mafDone++;
    zm.pD+=x.pheno.done; zm.pR+=x.pheno.reg; zm.wD+=x.water.done; zm.wR+=x.water.reg;
    zm.gD+=x.gov.done;   zm.gR+=x.gov.reg;   zm.mD+=x.met.done;   zm.mR+=x.met.reg;
  });
  var ru = ss.insertSheet('Rollup');
  ru.appendRow(['Zone','Clan stewards (roster)','Reporting','MaFIA done','Phenology','Water quality','Gov services','Met stations']);
  var tot = { stewards:0, reported:0, mafDone:0, pD:0,pR:0, wD:0,wR:0, gD:0,gR:0, mD:0,mR:0 };
  Object.keys(zoneMap).sort().forEach(function(z){
    var zm = zoneMap[z];
    ru.appendRow([ z, zm.stewards, zm.reported+'/'+zm.stewards, zm.mafDone+'/'+zm.stewards,
      _complCell(zm.pD,zm.pR), _complCell(zm.wD,zm.wR), _complCell(zm.gD,zm.gR), _complCell(zm.mD,zm.mR) ]);
    ['stewards','reported','mafDone','pD','pR','wD','wR','gD','gR','mD','mR'].forEach(function(k){ tot[k]+=zm[k]; });
  });
  ru.appendRow(['MCA (all zones)', tot.stewards, tot.reported+'/'+tot.stewards, tot.mafDone+'/'+tot.stewards,
    _complCell(tot.pD,tot.pR), _complCell(tot.wD,tot.wR), _complCell(tot.gD,tot.gR), _complCell(tot.mD,tot.mR) ]);

  var ssFile = DriveApp.getFileById(ss.getId());
  try { reportsFolder.addFile(ssFile); DriveApp.getRootFolder().removeFile(ssFile); } catch(e){}

  var rcp = loadRecipients();
  var to = REPORT_EMAILS.slice();
  if (rcp.field_reports_to && to.indexOf(rcp.field_reports_to) === -1) to.push(rcp.field_reports_to);
  to.forEach(function(email){ try { ssFile.addViewer(email); } catch(e){} });

  var body = ['MCA Steward App — Clan-steward compliance — ' + ym + ' (PNG time)','',
    'Clan stewards in the roster: ' + rows.length,
    '',
    'Report (Google Sheet): ' + ss.getUrl(),
    '',
    'Target is the registry, not a fixed number: phenology / water / gov / met are',
    'measured against the sites registered to each clan. "—" means nothing is',
    'registered yet for that clan (e.g. no coffee/cocoa trees, or water/gov/met',
    'sites not defined). MaFIA target is ' + COMPLIANCE_MAFIA_TARGET + ' per period.',
    '',
    'Zone and MCA figures on the Rollup tab are a simple sum of the clan rows —',
    'the roster (clan stewards), what is registered, and what was done all add up',
    'the tiers. "Reporting" = how many of the roster synced anything this period.',
    'Roster = clan stewards who have synced at least once; a steward who has',
    'never synced cannot be counted until a central enrolment roster exists.'
  ].join('\n');
  to.forEach(function(email){ MailApp.sendEmail(email, 'MCA Clan-steward compliance — ' + ym, body); });
  Logger.log('Clan compliance ' + ym + ': ' + rows.length + ' stewards → ' + to.join(', '));
  return { status:'ok', month:ym, stewards:rows.length, report:ss.getUrl() };
}

function installClanComplianceTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === 'clanComplianceReport') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('clanComplianceReport').timeBased().onMonthDay(1).atHour(7).create();
  Logger.log('Monthly clan-compliance trigger installed (1st of month, 7am PNG).');
}
