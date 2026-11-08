/**
 * MCApp — Google Apps Script upload + reporting endpoint
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

/* ─── Phenology target counts (per clan, optional per species) ───────────
 * _pheno_targets.json — coordinator-maintained (update_pheno_targets, key
 * required; or seedPhenoTargets()). The standard is 5 trees per species; for
 * clans doing more detailed work the coordinator NAMES the clan here and sets a
 * higher number (before the extra trees are approved). Shape, default 5:
 *   { "Kubi": 10,                       // 10 of every species for Kubi
 *     "Afore": { "default":5, "okari":12 } }  // 12 okari, 5 of the rest
 * The app reads this to show that many establish slots; compliance already uses
 * the registered count, so no report change is needed. */
function loadPhenoTargets() {
  try { var f=getDataFolder(); var fs=f.getFilesByName('_pheno_targets.json'); if(fs.hasNext()) return JSON.parse(fs.next().getBlob().getDataAsString())||{}; } catch(e){}
  return {};
}
function savePhenoTargets(obj) {
  var f=getDataFolder(); var fs=f.getFilesByName('_pheno_targets.json'); var j=JSON.stringify(obj||{},null,2);
  if(fs.hasNext()) fs.next().setContent(j); else f.createFile('_pheno_targets.json', j, MimeType.PLAIN_TEXT);
}
function getPhenoTargets() {
  return ContentService.createTextOutput(JSON.stringify({ status:'ok', pheno_targets: loadPhenoTargets() })).setMimeType(ContentService.MimeType.JSON);
}
function updatePhenoTargets(obj) { savePhenoTargets(obj||{}); return { status:'ok', message:'Pheno targets saved' }; }
function seedPhenoTargets() {
  savePhenoTargets({ /* "Kubi": 10, "Afore": { "default":5, "okari":12 } */ });
  Logger.log('Seeded _pheno_targets.json — name the clans and set their counts via update_pheno_targets or seedPhenoTargets. Default is 5.');
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

/* ─── Clan list per zone ────────────────────────────────────────────────
 * _clans.json — coordinator-maintained (update_clans; or seedClans() in the
 * editor). Maps zone_id → the clans in that zone, so enrolment offers a
 * zone-scoped clan PICK-LIST (no free text) and a clan steward's clan name is
 * always exact — ownership routing, compliance and reports all match on it.
 *   { "Z05": ["Kubi","Bigaije"], "Z06": ["Muaduraina"] }
 * Only clan stewards carry a clan; other roles are zone- or MCA-level. */
function loadClans() {
  try { var f=getDataFolder(); var fs=f.getFilesByName('_clans.json'); if(fs.hasNext()) return JSON.parse(fs.next().getBlob().getDataAsString())||{}; } catch(e){}
  return {};
}
function saveClans(obj) {
  var f=getDataFolder(); var fs=f.getFilesByName('_clans.json'); var j=JSON.stringify(obj||{},null,2);
  if(fs.hasNext()) fs.next().setContent(j); else f.createFile('_clans.json', j, MimeType.PLAIN_TEXT);
}
function getClans() {
  return ContentService.createTextOutput(JSON.stringify({ status:'ok', clans: loadClans() })).setMimeType(ContentService.MimeType.JSON);
}
function updateClans(obj) { saveClans(obj||{}); return { status:'ok', message:'Clans saved' }; }

/* ─── Public holidays (national PNG) ────────────────────────────────────
 * _holidays.json — coordinator-maintained (update_holidays; or seedHolidays()
 * in the editor). A flat list the app shows on the Activity Calendar and uses
 * to pre-fill a facility "Public holiday" closed-reason:
 *   [ { "date":"2026-12-25", "name":"Christmas Day", "everyone_off":true }, ... ]
 * everyone_off = Christmas & Easter (no fieldwork at all); the rest are
 * government-office closures. Dates shift year to year — re-confirm against the
 * National Gazette and re-seed each year. No Oro provincial days. */
function loadHolidays() {
  try { var f=getDataFolder(); var fs=f.getFilesByName('_holidays.json'); if(fs.hasNext()) return JSON.parse(fs.next().getBlob().getDataAsString())||[]; } catch(e){}
  return [];
}
function saveHolidays(list) {
  var f=getDataFolder(); var fs=f.getFilesByName('_holidays.json'); var j=JSON.stringify(list||[],null,2);
  if(fs.hasNext()) fs.next().setContent(j); else f.createFile('_holidays.json', j, MimeType.PLAIN_TEXT);
}
function getHolidays() {
  return ContentService.createTextOutput(JSON.stringify({ status:'ok', holidays: loadHolidays() })).setMimeType(ContentService.MimeType.JSON);
}
function updateHolidays(list) { saveHolidays(list||[]); return { status:'ok', message:'Holidays saved' }; }
function seedHolidays() {
  /* PNG national public holidays — 2026 (gazette-based; confirm King's Birthday
   * via the National Gazette). Re-run yearly with the new dates. */
  saveHolidays([
    { date:'2026-01-01', name:"New Year's Day" },
    { date:'2026-02-26', name:'Grand Chief Sir Michael Somare Remembrance Day' },
    { date:'2026-04-03', name:'Good Friday', everyone_off:true },
    { date:'2026-04-04', name:'Easter Saturday', everyone_off:true },
    { date:'2026-04-05', name:'Easter Sunday', everyone_off:true },
    { date:'2026-04-06', name:'Easter Monday', everyone_off:true },
    { date:'2026-06-17', name:"King's Birthday" },
    { date:'2026-07-23', name:'National Remembrance Day' },
    { date:'2026-08-26', name:'National Repentance Day' },
    { date:'2026-09-16', name:'Independence Day' },
    { date:'2026-12-25', name:'Christmas Day', everyone_off:true },
    { date:'2026-12-26', name:'Boxing Day', everyone_off:true }
  ]);
  Logger.log('Seeded _holidays.json with the PNG 2026 national holidays — confirm against the Gazette and re-seed each year.');
}

/* ─── Livelihood projects ───────────────────────────────────────────────
 * _livelihood.json — COORDINATOR-maintained (update_livelihood; or
 * seedLivelihood() in the editor). The project types + sites that MCF staff
 * log monthly notes+photos against. Staff cannot create projects — only the
 * coordinator defines them here. Shape:
 *   { "types": ["Piggery", ...],
 *     "sites": [ { "id":"pig-z01", "type":"Piggery", "name":"Piggery — Zone 1",
 *                  "zone":"Z01", "clan":"", "active":true }, ... ] }
 * Synced down (GET ?action=livelihood); the per-type monthly report groups the
 * updates by each site's type. */
function loadLivelihood() {
  try { var f=getDataFolder(); var fs=f.getFilesByName('_livelihood.json'); if(fs.hasNext()) return JSON.parse(fs.next().getBlob().getDataAsString())||{types:[],sites:[]}; } catch(e){}
  return { types:[], sites:[] };
}
function saveLivelihood(obj) {
  var f=getDataFolder(); var fs=f.getFilesByName('_livelihood.json'); var j=JSON.stringify(obj||{types:[],sites:[]},null,2);
  if(fs.hasNext()) fs.next().setContent(j); else f.createFile('_livelihood.json', j, MimeType.PLAIN_TEXT);
}
function getLivelihood() {
  return ContentService.createTextOutput(JSON.stringify({ status:'ok', livelihood: loadLivelihood() })).setMimeType(ContentService.MimeType.JSON);
}
function updateLivelihood(obj) { saveLivelihood(obj||{types:[],sites:[]}); return { status:'ok', message:'Livelihood projects saved' }; }
function seedLivelihood() {
  /* Starter set from the project leads — edit/extend here or via update_livelihood.
   * Fish ponds (~80, clan level) are TBC, so no sites seeded for them yet.
   * Church chicken / Ducks / Solar drier: types ready, add sites when known. */
  var types = ['Layers / poultry','Church chicken project','Ducks','Piggery','Vegetable farm','Fish pond','Nursery','Meli (stingless-bee) hives','Solar drier','Tourism / trek','Other'];
  var sites = [
    { id:'lay-koruwo',  type:'Layers / poultry',             name:'Koruwo layers barn',     zone:'',    clan:'Koruwo', active:true },
    { id:'nur-umuate',  type:'Nursery',                      name:'Umuate massoy nursery',  zone:'',    clan:'',       active:true },
    { id:'trek-z04',    type:'Tourism / trek',               name:'Tourist trek — Zone 4',  zone:'Z04', clan:'',       active:true }
  ];
  /* Piggery — all zones */
  [['Z01','Zone 1'],['Z02','Zone 2'],['Z03','Zone 3'],['Z04','Zone 4'],['Z05','Zone 5'],['Z06','Zone 6'],['Z07A','Zone 7A'],['Z07B','Zone 7B'],['Z08','Zone 8'],['Z09','Zone 9'],['Z10','Zone 10']]
    .forEach(function(z){ sites.push({ id:'pig-'+z[0].toLowerCase(), type:'Piggery', name:'Piggery — '+z[1], zone:z[0], clan:'', active:true }); });
  /* Vegetable farms — Z2, Z3, Z5, Z7A, Z7B */
  [['Z02','Zone 2'],['Z03','Zone 3'],['Z05','Zone 5'],['Z07A','Zone 7A'],['Z07B','Zone 7B']]
    .forEach(function(z){ sites.push({ id:'veg-'+z[0].toLowerCase(), type:'Vegetable farm', name:'Vegetable farm — '+z[1], zone:z[0], clan:'', active:true }); });
  /* Meli (stingless-bee) hives — Z1, Z2, Z4, Z9, Z10 */
  [['Z01','Zone 1'],['Z02','Zone 2'],['Z04','Zone 4'],['Z09','Zone 9'],['Z10','Zone 10']]
    .forEach(function(z){ sites.push({ id:'meli-'+z[0].toLowerCase(), type:'Meli (stingless-bee) hives', name:'Meli hives — '+z[1], zone:z[0], clan:'', active:true }); });
  saveLivelihood({ types: types, sites: sites });
  Logger.log('Seeded _livelihood.json: ' + types.length + ' types, ' + sites.length + ' sites. Edit/add via update_livelihood.');
}
function seedClans() {
  /* Run once in the Apps Script editor to (re)populate _clans.json. Keys are
   * zone_ids (Z01–Z10, Z07 split into Z07A/Z07B). To update later, edit the map
   * and re-run, or push the same map via update_clans.
   * Authoritative clan list by zone — Kiara Combined Forum, 30–31 Oct 2026
   * (182 unique clans; the source's 185 counted a few clans listed in more than
   * one village). Keep spelling consistent — ownership routing, compliance and
   * reports all match on these names. */
  saveClans({
    "Z01": ["Akare", "Dahari", "Deobi", "Kanamane", "Moeko", "Roiko", "Sako", "Sanae", "Uva", "Uvuombiro", "Vajamo"],
    "Z02": ["Asigi", "Asoro", "Bujevi", "Garinko", "Juaiko", "Kasaki", "Kasiko", "Kavako", "Manoiko", "Mazanko", "Muanari", "Nituri", "Riko", "Rondi", "Sukadi", "Tamaru", "Tuko", "Uagi", "Zabiko"],
    "Z03": ["Abriz", "Abunraez", "Aguoenikol", "Anunaniz", "Arinikol", "Diari", "Doiko", "Giroko", "Gumuri", "Kakol", "Koegire", "Kuani", "Kukuko", "Majai", "Managi", "Muaigi", "Muamutu", "Nui", "Sawasi", "Sirieg", "Zai"],
    "Z04": ["Asio", "Averi", "Bidani", "Bie", "Bumeba", "Mikari", "Mudi", "Orero", "Ruvari", "Suaisime", "Udiri"],
    "Z05": ["Ajabi", "Bonool", "Ceuse", "Dajoje", "Danam", "Daudau", "Dohol", "Guruije", "Ikole", "Jiwara", "Kubiol", "Marovekol", "Mejekan", "Mesaje", "Niboije", "Osena", "Samoije", "Sarusa", "Venikol"],
    "Z06": ["Ahusura", "Ajanija", "Asinakura", "Awakura", "Iko'ura", "Irumija", "Kajanija", "Kui", "Manamko'ra", "Manukwiora", "Mareura", "Mera'Ora", "Midada", "Mighunija", "Muaturaina", "Nahara'Ora", "Namakura", "Narija", "Nupa'Ora", "Pakura", "Pena'Ora", "Sahiruta", "Sanarija", "Siaja'ora", "Ueura", "Umudi", "Urimukura"],
    "Z07A": ["Ajokol", "Azabi", "Borori", "Bumol", "Butarat", "Daralkol", "Dokap", "Ginagi", "Kawowoki", "Kawuri", "Kawuribaru", "Kuhanakol", "Kuskol", "Settlers", "Tagul"],
    "Z07B": ["Abuankol", "Azabe", "Bajanei", "Binugkol", "Ginagi", "Jarigi", "Manag", "Marang", "Marijabinkol", "Murai", "Nahalkol", "Natang", "Settlers", "Sugulkol", "Wohukol"],
    "Z08": ["Aduanakol", "Aneji", "Asackol", "Asuan", "Bagia", "Duribip", "Gubai", "Gumuyudae", "Karira", "Kinun", "Madukol", "Masuabip", "Momokol", "Mugaikol", "Nagabaru", "Nituri", "Riribodae", "Salakin", "Saruan", "Suhikol", "Titkol", "Uekol", "Uremkol", "Uwana"],
    "Z09": ["Auha", "Baroi", "Ihomo", "Javejave", "Kita", "Kobara", "Mahake", "Mo-oni", "Na-a", "Tabuwai", "Torua", "Umatei", "Warama"],
    "Z10": ["Agabije", "Aimapa", "Dahoraje", "Kuwanije", "Misaje", "Salkol", "Suhinraje"]
  });
  Logger.log('Seeded _clans.json — 182 clans across 11 zones (Kiara Forum, Oct 2026). Served to the app via ?action=clans for the enrolment / attendance clan pick-lists.');
}

/* ─── Expected clan-steward roster ──────────────────────────────────────
 * _roster.json in the data folder, coordinator-maintained (update_roster —
 * coordinator key required; or seedRoster() in the editor). The LIST OF WHO IS
 * SUPPOSED TO REPORT. Compliance is measured against this roster, so a steward
 * who never syncs still shows up as FAILED (not reporting = not done = no pay),
 * instead of silently vanishing. Entries:
 *   [ { "stewardId":"MCA-012", "name":"...", "clan":"Kubi", "zone":"Z05 — Zone 5" }, ... ]
 * Enrolment is offline/on-device; this roster is how the project declares the
 * expected cohort until a profile is registered centrally at enrolment. */
function loadRoster() {
  try { var f=getDataFolder(); var fs=f.getFilesByName('_roster.json'); if(fs.hasNext()) return JSON.parse(fs.next().getBlob().getDataAsString())||[]; } catch(e){}
  return [];
}
function saveRoster(list) {
  var f=getDataFolder(); var fs=f.getFilesByName('_roster.json'); var j=JSON.stringify(list||[],null,2);
  if(fs.hasNext()) fs.next().setContent(j); else f.createFile('_roster.json', j, MimeType.PLAIN_TEXT);
}
function getRoster() {
  return ContentService.createTextOutput(JSON.stringify({ status:'ok', roster: loadRoster() })).setMimeType(ContentService.MimeType.JSON);
}
function updateRoster(list) { saveRoster(list||[]); return { status:'ok', message:'Roster saved', count:(list||[]).length }; }
function seedRoster() {
  saveRoster([ /* { stewardId:'MCA-012', name:'', clan:'', zone:'' } */ ]);
  Logger.log('Seeded _roster.json — add the expected clan stewards via update_roster or seedRoster.');
}
/* collectRecordsByRole('clan_steward') reconciled with the expected roster:
 *  - an ACTIVE roster member who never synced is added (empty mods → fails);
 *  - a RETIRED member (active:false — died or replaced) is dropped, so their
 *    old data stays in Drive for audit but they no longer show as a failing
 *    active reporter;
 *  - ever-synced stewards not on the roster are KEPT (nothing hides).
 * With no roster set, this is just the ever-synced set (safe fallback). The
 * roster is the movable active cohort until 100% enrolment pins the clan count. */
function clanStewardsWithRoster() {
  var all = collectRecordsByRole('clan_steward');
  loadRoster().forEach(function(e){
    if (!e || !e.stewardId) return;
    if (e.active === false || (e.role && e.role !== 'clan_steward')) { delete all[e.stewardId]; return; }  /* retired / wrong role */
    if (!all[e.stewardId]) {
      all[e.stewardId] = { steward:{ stewardId:e.stewardId, name:e.name||'', clan:e.clan||'', zone:e.zone||'', role:'clan_steward' }, mods:{} };
    } else {
      var s = all[e.stewardId].steward;
      s.name = s.name || e.name; s.clan = s.clan || e.clan; s.zone = s.zone || e.zone;
    }
  });
  return all;
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

/* ─── Value-chain auditor authorisations ────────────────────────────────
 * Separate from training. A coordinator authorises specific people (any role)
 * to complete value-chain audits for a commodity. Stored in _vc_auditors.json:
 *   { "<stewardId>": [ {commodity, authorised_by, basis, authorised_at,
 *                        status}, ... ], ... }
 * The phone fetches ?action=vc_auditors&stewardId=... and unlocks the audit
 * tile for each commodity granted. ── */
function loadVcAuditorsFile() {
  var folder = getDataFolder();
  var files  = folder.getFilesByName('_vc_auditors.json');
  if (files.hasNext()) { try { return JSON.parse(files.next().getBlob().getDataAsString()); } catch(e){ return {}; } }
  return {};
}
function saveVcAuditorsFile(data) {
  var folder = getDataFolder();
  var files  = folder.getFilesByName('_vc_auditors.json');
  var json   = JSON.stringify(data, null, 2);
  if (files.hasNext()) { files.next().setContent(json); }
  else { folder.createFile('_vc_auditors.json', json, MimeType.PLAIN_TEXT); }
}
function grantVcAuthorisation(record) {
  if (!record || !record.stewardId || !record.commodity) {
    return { status:'error', message:'Missing stewardId or commodity' };
  }
  try {
    var data = loadVcAuditorsFile();
    var sid  = String(record.stewardId).trim().toUpperCase();
    if (!data[sid]) data[sid] = [];
    var exists = data[sid].some(function(r){ return r.commodity === record.commodity && r.status !== 'revoked'; });
    if (!exists) { data[sid].push(record); }
    saveVcAuditorsFile(data);
    return { status:'ok', message:'Auditor authorised', stewardId:sid, commodity:record.commodity, duplicate:exists };
  } catch(err) { return { status:'error', message:err.toString() }; }
}
function getVcAuditors(stewardId) {
  if (!stewardId) {
    return ContentService.createTextOutput(JSON.stringify({ status:'error', message:'Missing stewardId' })).setMimeType(ContentService.MimeType.JSON);
  }
  try {
    var data = loadVcAuditorsFile();
    var recs = data[String(stewardId).trim().toUpperCase()] || [];
    var commodities = recs.filter(function(r){ return r.status !== 'revoked'; }).map(function(r){ return r.commodity; });
    return ContentService.createTextOutput(JSON.stringify({ status:'ok', stewardId:stewardId, commodities:commodities })).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ status:'error', message:err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

/* ─── Clan-steward module training (coordinator-granted module unlocks) ──────
 * _module_training.json: { "<stewardId>": [ {module, authorised_by,
 * authorised_at, status}, ... ] }. A trainable data module opens on a clan
 * steward's phone only once it's listed here. Fetched via
 * ?action=module_training&stewardId=... ── */
function loadModuleTrainingFile() {
  var folder = getDataFolder(); var files = folder.getFilesByName('_module_training.json');
  if (files.hasNext()) { try { return JSON.parse(files.next().getBlob().getDataAsString()); } catch(e){ return {}; } }
  return {};
}
function saveModuleTrainingFile(data) {
  var folder = getDataFolder(); var files = folder.getFilesByName('_module_training.json'); var json = JSON.stringify(data, null, 2);
  if (files.hasNext()) { files.next().setContent(json); } else { folder.createFile('_module_training.json', json, MimeType.PLAIN_TEXT); }
}
/* Zone-default module unlocks: _module_defaults.json = { "<zone_id>": ["water",
 * "phenology", ...] }. A clan steward whose enrolment zone appears here
 * auto-unlocks those modules at login, on top of any explicit per-steward
 * grant — so a whole zone can be pre-approved before anyone registers, with no
 * manual grant each. Read-only merge: it never writes to _module_training.json,
 * so deleting/editing this file re-tightens the gate immediately. Only applies
 * to role === 'clan_steward' (other roles are never module-gated). */
function loadModuleDefaultsFile() {
  var folder = getDataFolder(); var files = folder.getFilesByName('_module_defaults.json');
  if (files.hasNext()) { try { return JSON.parse(files.next().getBlob().getDataAsString()); } catch(e){ return {}; } }
  return {};
}
function _findEnrolmentRecord(stewardId) {
  var map = loadEnrolments() || {};
  if (map[stewardId]) return map[stewardId];
  var norm = String(stewardId).trim().toUpperCase().replace(/\s+/g, '');
  for (var k in map) { if (String(k).trim().toUpperCase().replace(/\s+/g, '') === norm) return map[k]; }
  return null;
}
function grantModuleTraining(record) {
  if (!record || !record.stewardId || !record.modules || !record.modules.length) {
    return { status:'error', message:'Missing stewardId or modules' };
  }
  try {
    var data = loadModuleTrainingFile(); var sid = String(record.stewardId).trim().toUpperCase();
    if (!data[sid]) data[sid] = [];
    record.modules.forEach(function(m){
      var exists = data[sid].some(function(r){ return r.module === m && r.status !== 'revoked'; });
      if (!exists) data[sid].push({ module:m, authorised_by:record.authorised_by||'', authorised_at:record.authorised_at||new Date().toISOString(), status:'active' });
    });
    saveModuleTrainingFile(data);
    return { status:'ok', message:'Modules unlocked', stewardId:sid, count:record.modules.length };
  } catch(err) { return { status:'error', message:err.toString() }; }
}
function getModuleTraining(stewardId) {
  if (!stewardId) { return ContentService.createTextOutput(JSON.stringify({ status:'error', message:'Missing stewardId' })).setMimeType(ContentService.MimeType.JSON); }
  try {
    var data = loadModuleTrainingFile(); var recs = data[String(stewardId).trim().toUpperCase()] || [];
    var modSet = {};
    recs.filter(function(r){ return r.status !== 'revoked'; }).forEach(function(r){ modSet[r.module] = true; });
    /* Merge in any zone-default unlocks for a clan steward (pre-approved zone) */
    try {
      var enr = _findEnrolmentRecord(stewardId);
      if (enr && String(enr.role) === 'clan_steward') {
        var zdef = loadModuleDefaultsFile()[enr.zone_id || ''];
        if (zdef && zdef.length) { zdef.forEach(function(m){ if (m) modSet[m] = true; }); }
      }
    } catch(e) { /* defaults are best-effort; never block explicit grants */ }
    var modules = Object.keys(modSet);
    return ContentService.createTextOutput(JSON.stringify({ status:'ok', stewardId:stewardId, modules:modules })).setMimeType(ContentService.MimeType.JSON);
  } catch(err) { return ContentService.createTextOutput(JSON.stringify({ status:'error', message:err.toString() })).setMimeType(ContentService.MimeType.JSON); }
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
/* ─── Enrolment registry (who has been created) ─────────────────────────
 * _enrolments.json — one entry per stewardId. Written by the app's enrolment
 * ping (enrol_ping, upload secret only) when a coordinator enrols someone and
 * when anyone logs in while online, and back-filled from every data upload, so
 * the coordinator has a LIVE roster of everyone created — including people who
 * have enrolled but not yet uploaded any monitoring data. Read via
 * GET ?action=enrolments. This is a convenience roster, not an auth source. */
function loadEnrolments() {
  try {
    var folder = getDataFolder();
    var fs = folder.getFilesByName('_enrolments.json');
    if (fs.hasNext()) return JSON.parse(fs.next().getBlob().getDataAsString()) || {};
  } catch(e) {}
  return {};
}
function saveEnrolments(obj) {
  var folder = getDataFolder();
  var fs = folder.getFilesByName('_enrolments.json');
  var json = JSON.stringify(obj || {}, null, 2);
  if (fs.hasNext()) fs.next().setContent(json);
  else folder.createFile('_enrolments.json', json, MimeType.PLAIN_TEXT);
}
/* Upsert one person. `uploaded` true marks that real data has arrived (set from
 * the upload path); the ping alone leaves the prior upload flag untouched. */
function registerEnrolment(rec, uploaded) {
  if (!rec || !rec.stewardId) return { status:'error', message:'Missing stewardId' };
  var map = loadEnrolments();
  var id  = String(rec.stewardId);
  var now = new Date().toISOString();
  var prev = map[id] || {};
  map[id] = {
    stewardId:   id,
    name:        rec.name    || prev.name    || '',
    role:        rec.role    || prev.role    || '',
    zone:        rec.zone    || prev.zone    || '',
    zone_id:     rec.zone_id || prev.zone_id || '',
    clan:        rec.clan    || prev.clan    || '',
    village:     rec.village || prev.village || '',
    enrolled_at: rec.enrolled_at || prev.enrolled_at || now,
    first_seen:  prev.first_seen || now,
    last_seen:   now,
    app_build:   rec.app_build || prev.app_build || '',
    verify_method: rec.verify_method || prev.verify_method || '',
    consent_at:  rec.consent_at || prev.consent_at || '',
    has_uploaded: uploaded ? true : (prev.has_uploaded || false)
  };
  saveEnrolments(map);
  return { status:'ok', message:'Enrolment recorded', stewardId:id };
}
function getEnrolments() {
  var map = loadEnrolments();
  var list = Object.keys(map).map(function(k){ return map[k]; });
  list.sort(function(a,b){ return (a.name||'').localeCompare(b.name||''); });
  return ContentService.createTextOutput(JSON.stringify({ status:'ok', enrolments: list, count: list.length }))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ─── Market prices (world indicator) ──────────────────────────────────────
 * _prices.json — a WORLD-MARKET reference, NOT a local buying price. A daily
 * job (pricesUpdate) pulls coffee/cocoa/gold from a keyless finance endpoint
 * and keeps ~2 years of monthly points for a trend line. Vanilla is NOT
 * exchange-traded, so it has no feed — the coordinator sets an INDICATIVE
 * figure (update_indicative_price), clearly flagged in the app. Served to all
 * phones via GET ?action=prices and cached offline. ── */
var PRICE_SYMBOLS = [
  { key:'coffee', symbol:'KC=F', label:'Coffee (Arabica)', unit:'US¢/lb',  source:'ICE Arabica futures' },
  { key:'cocoa',  symbol:'CC=F', label:'Cocoa',            unit:'USD/tonne',    source:'ICE cocoa futures' },
  { key:'gold',   symbol:'GC=F', label:'Gold',             unit:'USD/oz',       source:'COMEX gold futures' }
];
function loadPrices() {
  try { var f=getDataFolder(); var fs=f.getFilesByName('_prices.json'); if(fs.hasNext()) return JSON.parse(fs.next().getBlob().getDataAsString())||{commodities:{}}; } catch(e){}
  return { commodities:{} };
}
function savePrices(o) {
  var f=getDataFolder(); var fs=f.getFilesByName('_prices.json'); var j=JSON.stringify(o||{commodities:{}},null,2);
  if(fs.hasNext()) fs.next().setContent(j); else f.createFile('_prices.json', j, MimeType.PLAIN_TEXT);
}
function getPrices() {
  /* Vanilla (and any coordinator "indicative" figure) is intentionally NOT
   * served with the world-market indicator: vanilla isn't exchange-traded, so
   * a manual per-kg figure isn't comparable to the coffee/cocoa futures shown
   * here. Strip it at serve time so a stale _prices.json never surfaces it. */
  var store = loadPrices();
  var out = { commodities:{}, updated_at: store.updated_at };
  var com = store.commodities || {};
  Object.keys(com).forEach(function(k){
    var c = com[k];
    if (k === 'vanilla' || (c && c.indicative)) return;
    out.commodities[k] = c;
  });
  return ContentService.createTextOutput(JSON.stringify({ status:'ok', prices: out })).setMimeType(ContentService.MimeType.JSON);
}
/* Keyless finance chart endpoint → {latest, points:[{t:'yyyy-MM', v}], as_of}. */
function _fetchPriceSeries(symbol) {
  var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) + '?range=2y&interval=1mo';
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions:true, headers:{ 'User-Agent':'Mozilla/5.0' } });
  if (resp.getResponseCode() !== 200) return null;
  var d = JSON.parse(resp.getContentText());
  var r = d && d.chart && d.chart.result && d.chart.result[0];
  if (!r) return null;
  var ts = r.timestamp || [];
  var closes = (r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close) || [];
  /* One point per month (the chart endpoint can return both the month's close
   * and a live partial-month candle — keep the latest value for each month). */
  var byMonth = {};
  for (var i=0;i<ts.length;i++){ var v=closes[i]; if(v==null||isNaN(v)) continue; byMonth[_pngDate(new Date(ts[i]*1000),'yyyy-MM')] = Math.round(v*100)/100; }
  var points = Object.keys(byMonth).sort().map(function(mk){ return { t:mk, v:byMonth[mk] }; });
  var latest = (r.meta && r.meta.regularMarketPrice!=null) ? r.meta.regularMarketPrice : (points.length ? points[points.length-1].v : null);
  if (latest==null && points.length===0) return null;
  return { latest:(latest!=null?Math.round(latest*100)/100:null), points:points, as_of:_pngDate(new Date(),'yyyy-MM-dd') };
}
function pricesUpdate() {
  var store = loadPrices(); if(!store.commodities) store.commodities={};
  var done=[], failed=[];
  PRICE_SYMBOLS.forEach(function(s){
    try {
      var ser = _fetchPriceSeries(s.symbol);
      if (ser && ser.latest!=null) {
        store.commodities[s.key] = { key:s.key, label:s.label, unit:s.unit, source:s.source,
          latest:ser.latest, points:ser.points, as_of:ser.as_of, indicative:false };
        done.push(s.key);
      } else { failed.push(s.key); }
    } catch(e) { failed.push(s.key+' ('+e+')'); }
  });
  store.updated_at = new Date().toISOString();
  savePrices(store);
  Logger.log('Prices updated: ' + (done.join(', ')||'none') + (failed.length?(' | failed: '+failed.join(', ')):''));
  return { status:'ok', updated:done, failed:failed };
}
/* Coordinator sets the vanilla (or any non-traded) indicative figure; each save
 * appends/updates a monthly point so it builds its own small trend. */
function updateIndicativePrice(body) {
  var store = loadPrices(); if(!store.commodities) store.commodities={};
  var key = body.key || 'vanilla';
  var price = parseFloat(body.price);
  if (isNaN(price)) return { status:'error', message:'A numeric price is required' };
  var asOf = body.as_of || _pngDate(new Date(),'yyyy-MM-dd');
  var cur = store.commodities[key] || { key:key, label:body.label||'Vanilla', unit:body.unit||'USD/kg', source:'Indicative (coordinator)', points:[] };
  cur.label = body.label || cur.label || 'Vanilla';
  cur.unit = body.unit || cur.unit || 'USD/kg';
  cur.source = 'Indicative (coordinator)';
  cur.latest = Math.round(price*100)/100;
  cur.as_of = asOf;
  cur.note = body.note || '';
  cur.indicative = true;
  cur.points = cur.points || [];
  var mk = asOf.slice(0,7), found=false;
  cur.points.forEach(function(p){ if(p.t===mk){ p.v=cur.latest; found=true; } });
  if (!found) cur.points.push({ t:mk, v:cur.latest });
  cur.points = cur.points.slice(-24);
  store.commodities[key] = cur; store.updated_at = new Date().toISOString();
  savePrices(store);
  return { status:'ok', message:'Indicative price saved', key:key };
}
function installPricesTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t){ if(t.getHandlerFunction()==='pricesUpdate') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('pricesUpdate').timeBased().everyDays(1).atHour(6).create();
  return 'Prices trigger installed (daily ~06:00). Run pricesUpdate() once now to populate.';
}
function seedPrices() {
  /* World markets only (coffee, cocoa). Vanilla is deliberately excluded — it
   * isn't exchange-traded, so it isn't comparable to the futures shown here. */
  pricesUpdate();
  Logger.log('Seeded _prices.json (world markets: coffee, cocoa).');
}

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

    /* Verify the coordinator server key at unlock, so a wrong/blank key is
     * caught at the unlock screen instead of failing later on a grant/approve.
     * Returns whether a key is configured on the backend and whether the one
     * supplied matches. Not a coordinator write action — only a check. */
    if (body._action === 'verify_coordinator') {
      var _vck = getCoordinatorSecret();
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok', configured: !!_vck, valid: (!!_vck && body._coordinator_secret === _vck) }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    /* Coordinator write actions require a second server-side key in addition to the upload secret.
     * The key is stored in Script Properties (never in the distributed app source). */
    var COORDINATOR_ACTIONS = ['update_zones', 'update_topics', 'grant_authorisation', 'certify_trainer', 'update_water_sources', 'update_facilities', 'update_met_stations', 'update_pheno_plots', 'update_calendar', 'update_disturbances', 'update_help', 'update_date_review', 'update_issues', 'update_recipients', 'update_roster', 'update_pheno_targets', 'update_clans', 'update_holidays', 'update_livelihood', 'update_indicative_price', 'grant_vc_authorisation', 'grant_module_training'];
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

    if (body._action === 'grant_vc_authorisation') {
      var vcRes = grantVcAuthorisation(body.record);
      return ContentService
        .createTextOutput(JSON.stringify(vcRes))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (body._action === 'grant_module_training') {
      var mtRes = grantModuleTraining(body.record);
      return ContentService
        .createTextOutput(JSON.stringify(mtRes))
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

    /* Enrolment ping — app reports who was created / logged in (upload secret
     * only). Lets the coordinator see everyone enrolled, even before any data
     * upload. */
    if (body._action === 'enrol_ping') {
      return ContentService
        .createTextOutput(JSON.stringify(registerEnrolment(body.enrolment, false)))
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
    /* Expected clan-steward roster — coordinator maintains it (coordinator key required) */
    if (body._action === 'update_roster') {
      return ContentService.createTextOutput(JSON.stringify(updateRoster(body.roster))).setMimeType(ContentService.MimeType.JSON);
    }
    /* Phenology target counts per clan — coordinator maintains it (coordinator key required) */
    if (body._action === 'update_pheno_targets') {
      return ContentService.createTextOutput(JSON.stringify(updatePhenoTargets(body.pheno_targets))).setMimeType(ContentService.MimeType.JSON);
    }
    /* Clan list per zone — coordinator maintains it (coordinator key required) */
    if (body._action === 'update_clans') {
      return ContentService.createTextOutput(JSON.stringify(updateClans(body.clans))).setMimeType(ContentService.MimeType.JSON);
    }
    /* Public holidays (national PNG) — coordinator maintains it (coordinator key required) */
    if (body._action === 'update_holidays') {
      return ContentService.createTextOutput(JSON.stringify(updateHolidays(body.holidays))).setMimeType(ContentService.MimeType.JSON);
    }
    /* Livelihood projects (types + sites) — coordinator maintains it (coordinator key required) */
    if (body._action === 'update_livelihood') {
      return ContentService.createTextOutput(JSON.stringify(updateLivelihood(body.livelihood))).setMimeType(ContentService.MimeType.JSON);
    }
    /* Indicative (non-traded) price — coordinator sets vanilla etc. */
    if (body._action === 'update_indicative_price') {
      return ContentService.createTextOutput(JSON.stringify(updateIndicativePrice(body))).setMimeType(ContentService.MimeType.JSON);
    }
    /* One full-quality photo/video, uploaded as its own file (the record that
     * references it comes separately as a small text file). */
    if (body._action === 'media') {
      return ContentService.createTextOutput(JSON.stringify(storeMediaFile(body))).setMimeType(ContentService.MimeType.JSON);
    }
    /* Mint a RESUMABLE upload session for a LARGE file (video). The phone then
     * streams the file straight to Drive on the returned URL, bypassing the
     * ~50 MB request limit of this relay. */
    if (body._action === 'media_session') {
      return ContentService.createTextOutput(JSON.stringify(createMediaSession(body))).setMimeType(ContentService.MimeType.JSON);
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

    /* Minify on disk — the app sends many small per-record files now, so there
     * is no need to pretty-print each one. */
    var content = JSON.stringify(body);

    /* Per-record chunk uploads carry chunk_uid: name the file by it so a RETRY
     * (or a half-success over a weak link) OVERWRITES the same file instead of
     * making a duplicate — idempotent. A legacy full-bundle upload (no
     * chunk_uid) keeps the old date-named behaviour. */
    var fileName;
    var chunkUid = body.chunk_uid ? String(body.chunk_uid).replace(/[^A-Za-z0-9_-]/g, '_') : '';
    if (chunkUid) {
      fileName = 'MCA_' + sid + '_' + chunkUid + '.json';
      var exC = subFolder.getFilesByName(fileName);
      if (exC.hasNext()) { exC.next().setContent(content); }
      else { subFolder.createFile(fileName, content, MimeType.PLAIN_TEXT); }
    } else {
      var dateStr = new Date().toISOString().slice(0, 10);
      fileName = 'MCA_' + sid + '_' + dateStr + '.json';
      var existing = subFolder.getFilesByName(fileName);
      if (existing.hasNext()) {
        var ts = new Date().toISOString().slice(0,16).replace(':','h');
        fileName = 'MCA_' + sid + '_' + ts + '.json';
      }
      subFolder.createFile(fileName, content, MimeType.PLAIN_TEXT);
    }

    /* Back-fill the enrolment roster from the upload's steward block (marks the
     * person as having uploaded). Never fails the upload. */
    try { if (body.steward && body.steward.stewardId) registerEnrolment(body.steward, true); } catch(e) {}

    /* A no-attendance ("failed") training event → queue it for independent
     * verification by the field-reports lead and send one alert. Never fails
     * the upload. */
    try { queueNoAttendanceVerification(body); } catch(e) {}

    /* Extract any gate/login face photos (selfie-verified phones) into a
     * reviewable per-steward folder, so the coordinator has an audit trail
     * without digging through the raw upload JSON. Never fails the upload. */
    try {
      var _gs = body.modules && body.modules.gate_selfies;
      if (_gs && _gs.length) {
        var gsRoot = getOrCreateFolder('_gate_selfies', getDataFolder());
        var gsSid  = String((body.steward && body.steward.stewardId) || sid).replace(/[^A-Za-z0-9_-]/g,'_');
        var gsFolder = getOrCreateFolder(gsSid, gsRoot);
        for (var gi = 0; gi < _gs.length; gi++) {
          var gsr = _gs[gi]; if (!gsr || !gsr.photo) continue;
          var ctx = String(gsr.context || 'gate').replace(/[^A-Za-z0-9_-]/g,'_');
          var when = (gsr.timestamp || new Date().toISOString()).replace(/[:.]/g,'-').slice(0,19);
          var gname = ctx + '_' + when + '.jpg';
          if (gsFolder.getFilesByName(gname).hasNext()) continue; /* idempotent */
          var gblob = _dataUriToBlob(gsr.photo, gname);
          if (gblob) gsFolder.createFile(gblob);
        }
      }
    } catch(e) {}

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
/* ── Backend version — BUMP THIS whenever you paste a new copy, so you can
 * always confirm what is actually deployed. Check it two ways:
 *   • open  <your web-app URL>?action=version  in a browser, or
 *   • run   backendVersion()  in the Apps Script editor (see the Execution log).
 * If this doesn't match the file you were given, the deploy is stale. */
var BACKEND_VERSION = '2026-11-08.7 — zone-default module unlocks (pre-approve a zone for clan-steward modules)';
function backendVersion(){ Logger.log('MCA backend ' + BACKEND_VERSION); return BACKEND_VERSION; }

function doGet(e) {
  var action = (e.parameter && e.parameter.action) || 'ping';

  if (action === 'version') {
    return ContentService.createTextOutput(JSON.stringify({ status:'ok', version: BACKEND_VERSION }))
      .setMimeType(ContentService.MimeType.JSON);
  }
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
  if (action === 'roster') { return getRoster(); }
  if (action === 'clans') { return getClans(); }
  if (action === 'holidays') { return getHolidays(); }
  if (action === 'livelihood') { return getLivelihood(); }
  if (action === 'enrolments') { return getEnrolments(); }
  if (action === 'prices') { return getPrices(); }
  if (action === 'pheno_targets') { return getPhenoTargets(); }

  if (action === 'authorisations') {
    var stewId = (e.parameter && e.parameter.stewardId) || '';
    return getAuthorisations(stewId);
  }

  if (action === 'trainer_certs') {
    var stewId = (e.parameter && e.parameter.stewardId) || '';
    return getTrainerCerts(stewId);
  }

  if (action === 'vc_auditors') {
    var vcSid = (e.parameter && e.parameter.stewardId) || '';
    return getVcAuditors(vcSid);
  }

  if (action === 'module_training') {
    var mtSid = (e.parameter && e.parameter.stewardId) || '';
    return getModuleTraining(mtSid);
  }

  if (action === 'vc_report') {
    try {
      var vcMonths = parseInt((e.parameter && e.parameter.months) || '18', 10);
      return HtmlService.createHtmlOutput(vcRenderReportHtml(vcMonths))
        .setTitle('MCApp — Value Chain Training Needs')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
    } catch (err) {
      return HtmlService.createHtmlOutput('<p style="font-family:sans-serif;padding:20px">Report error: ' + err + '</p>');
    }
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
    .createTextOutput(JSON.stringify({ status: 'ready', app: 'MCApp Upload v3', server_time: new Date().toISOString() }))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ─── Weekly summary email ──────────────────────────────────────────── */
function weeklyReport() {
  var report = buildMCFReport('weekly');
  var dataFolder = getDataFolder();

  var lines = ['MCApp — Weekly Summary Report', ''];
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

  var lines = ['MCApp — Monthly Summary Report', ''];
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

/* ─── No-attendance verification queue ──────────────────────────────────
 * A training session can be recorded as "arranged but no one came"
 * (outcome:'no_attendance'). Because that is a paid activity with nothing to
 * show for it, each such record is queued for INDEPENDENT verification by the
 * field-reports lead (Matilda) — she confirms with the community what actually
 * happened. The record still carries the trainer's LIVE venue photo + GPS, so
 * the evidence that they were physically there is already attached.
 *
 * Each event becomes one task file in _verification_queue/ (named by chunk_uid,
 * so a retried upload never re-queues or re-alerts). A newly-queued event also
 * sends ONE alert email to the verifier. Recipient: _recipients.json
 * field_reports_to, else REPORT_EMAILS (the review address) until Matilda's is
 * set. Never throws — a failure here must not fail the upload. */
function queueNoAttendanceVerification(body) {
  try {
    var mods = body && body.modules;
    var recs = mods && mods.training;
    if (!recs || !recs.length) return;
    var sid  = (body.steward && body.steward.stewardId) || 'UNKNOWN';
    var sName = (body.steward && body.steward.name) || '';
    var zName = (body.steward && body.steward.zone) || '';
    var zId   = (body.steward && body.steward.zone_id) || '';
    var baseUid = body.chunk_uid ? String(body.chunk_uid).replace(/[^A-Za-z0-9_-]/g,'_') : ('' + Date.now());

    for (var i = 0; i < recs.length; i++) {
      var r = recs[i] || {};
      if (r.outcome !== 'no_attendance' && r.attendance_status !== 'no_attendance' && !r.needs_verification) continue;
      if (r.outcome === 'held') continue;

      var qFolder = getOrCreateFolder('_verification_queue', getDataFolder());
      var qName = 'VQ_' + sid + '_' + baseUid + (recs.length > 1 ? ('_' + i) : '') + '.json';
      if (qFolder.getFilesByName(qName).hasNext()) continue; /* already queued + alerted */

      var gps = r.gps || null;
      var mapLink = (gps && gps.lat != null && gps.lng != null) ? ('https://maps.google.com/?q=' + gps.lat + ',' + gps.lng) : '';
      var photoWhen = r.photo_captured_at ? _pngDate(new Date(r.photo_captured_at), 'd MMM yyyy, HH:mm') + ' (PNG)' : '';
      var sessionDate = r.date ? _pngDate(new Date(r.date), 'd MMM yyyy') : '';

      var task = {
        status: 'open',
        queued_at: new Date().toISOString(),
        queued_png: _pngDate(new Date(), 'd MMM yyyy, HH:mm') + ' (PNG)',
        steward_id: sid,
        trainer_name: r.trainer_name || sName,
        trainer_org: r.trainer_org || '',
        zone_id: zId, zone: zName,
        topic: r.topic || '', type: r.type || '',
        session_date: r.date || '', session_date_png: sessionDate,
        location: r.location || '',
        reason: r.no_show_reason || '',
        notes: r.no_show_notes || '',
        gps: gps,
        map_link: mapLink,
        photo_captured_at: r.photo_captured_at || '',
        photo_when_png: photoWhen,
        photo_on_session_date: (r.photo_on_session_date === true),
        location_missing: (r.location_missing === true),
        chunk_uid: body.chunk_uid || ''
      };
      qFolder.createFile(qName, JSON.stringify(task, null, 2), MimeType.PLAIN_TEXT);

      /* One alert per newly-queued event. Neutral, factual — asks the lead to
       * confirm independently; does not pre-judge. */
      try {
        var rcp = loadRecipients() || {};
        var to  = rcp.field_reports_to || (REPORT_EMAILS && REPORT_EMAILS[0]) || '';
        if (to) {
          var L = [];
          L.push('A training session was recorded as ARRANGED BUT NO ONE ATTENDED.');
          L.push('Please confirm independently with the community what happened.');
          L.push('');
          L.push('Trainer:   ' + (task.trainer_name || '(unknown)') + (task.trainer_org ? ' · ' + task.trainer_org : ''));
          L.push('Steward ID: ' + sid);
          L.push('Zone:      ' + (task.zone || task.zone_id || '(unknown)'));
          L.push('Topic:     ' + (task.type ? task.type + ' — ' : '') + (task.topic || '(none given)'));
          L.push('Date:      ' + (task.session_date_png || task.session_date || '(unknown)'));
          L.push('Location:  ' + (task.location || '(none given)'));
          L.push('Reason given: ' + (task.reason || '(none)'));
          if (task.notes) L.push('Notes:     ' + task.notes);
          L.push('');
          L.push('Evidence captured on the phone:');
          L.push('  Venue photo taken: ' + (task.photo_when_png || '(no timestamp)') + (task.photo_on_session_date ? '' : '  ⚠ not on the session date'));
          L.push('  Location: ' + (task.map_link || (task.location_missing ? '(no GPS fix — flagged)' : '(none)')));
          L.push('');
          L.push('This event is in the _verification_queue folder on Drive (file ' + qName + ').');
          MailApp.sendEmail(to, 'MCA — verify a no-attendance training event (' + (task.zone || task.zone_id || '') + ')', L.join('\n'));
        }
      } catch (mailErr) { /* queued file remains; alert can be resent from the queue */ }
    }
  } catch (e) { /* never fail the upload */ }
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

/* Store ONE full-quality photo/video (uploaded on its own, ahead of the small
 * text record that references it) in the steward's media/ subfolder. Idempotent
 * by filename, so a retry reuses the existing file instead of duplicating.
 * Returns the Drive file name + URL so the client can keep a link. */
function storeMediaFile(body) {
  try {
    if (!body || !body.data || !body.name) return { status: 'error', message: 'missing media' };
    var folder   = getDataFolder();
    var zoneId   = (body.steward && body.steward.zone_id) || '';
    var zoneName = (body.steward && body.steward.zone)    || '';
    var zoneDir  = zoneId ? (zoneId + '_' + zoneName.replace(/\s+/g, '_')) : 'Unzoned';
    var zoneFolder = getOrCreateFolder(zoneDir, folder);
    var sid         = (body.steward && body.steward.stewardId) || 'UNKNOWN';
    var stewardName = (body.steward && body.steward.name)      || 'Unknown';
    var subFolder   = getOrCreateFolder(sid + '_' + stewardName.replace(/\s+/g, '_'), zoneFolder);
    var mediaFolder = getOrCreateFolder('media', subFolder);
    var name = String(body.name).replace(/[^A-Za-z0-9_.\-]/g, '_');
    var url  = _saveMedia(mediaFolder, name, body.data);   /* idempotent */
    if (!url) return { status: 'error', message: 'bad media data' };
    return { status: 'ok', file: name, url: url };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

/* Mint a RESUMABLE Drive upload session for one large file (video) and return
 * the session URL. The phone streams the bytes straight to Drive on that URL
 * (chunked, resumable), so a big file never passes through this script's ~50 MB
 * request limit. Idempotent: if the file already exists, say so and the phone
 * skips re-uploading it.
 * Needs the Drive OAuth scope — already granted because the script uses
 * DriveApp. If session init returns 401/403, add
 * "https://www.googleapis.com/auth/drive" to the manifest's oauthScopes and
 * re-authorise once. */
function createMediaSession(body) {
  try {
    if (!body || !body.name) return { status: 'error', message: 'missing name' };
    var folder = getDataFolder();
    var zoneId   = (body.steward && body.steward.zone_id) || '';
    var zoneName = (body.steward && body.steward.zone)    || '';
    var zoneDir  = zoneId ? (zoneId + '_' + zoneName.replace(/\s+/g, '_')) : 'Unzoned';
    var zoneFolder  = getOrCreateFolder(zoneDir, folder);
    var sid         = (body.steward && body.steward.stewardId) || 'UNKNOWN';
    var stewardName = (body.steward && body.steward.name)      || 'Unknown';
    var subFolder   = getOrCreateFolder(sid + '_' + stewardName.replace(/\s+/g, '_'), zoneFolder);
    var mediaFolder = getOrCreateFolder('media', subFolder);
    var name = String(body.name).replace(/[^A-Za-z0-9_.\-]/g, '_');
    var ex = mediaFolder.getFilesByName(name);
    if (ex.hasNext()) return { status: 'ok', existed: true, file: name, url: ex.next().getUrl() };
    var mime  = body.mimeType || 'application/octet-stream';
    var token = ScriptApp.getOAuthToken();
    var meta  = { name: name, parents: [mediaFolder.getId()], mimeType: mime };
    var resp = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
      method: 'post',
      contentType: 'application/json; charset=UTF-8',
      headers: { 'Authorization': 'Bearer ' + token, 'X-Upload-Content-Type': mime },
      payload: JSON.stringify(meta),
      muteHttpExceptions: true
    });
    var code = resp.getResponseCode();
    if (code < 200 || code >= 300) return { status: 'error', message: 'session init ' + code + ': ' + String(resp.getContentText()).slice(0, 180) };
    var hdr = resp.getAllHeaders() || {};
    var loc = hdr['Location'] || hdr['location'] || '';
    if (!loc) return { status: 'error', message: 'no session URL returned by Drive' };
    return { status: 'ok', session: loc, file: name };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
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
          if (rec.is_training) continue;            /* never report practice handovers */
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

/* Build a one-page, readable PDF for a single handover: the facts + the
 * handover photo embedded (scaled down) + links to the receipt photo and the
 * video (which stay as standalone Drive files). Idempotent by file name. */
function _handoverPdf(handoversFolder, r, s) {
  var uid = r.record_uid || r.uid;
  var rp  = r.recipient || {}, o = r.officer || {};
  var inst = _recInstant(r) ? new Date(_recInstant(r)) : new Date();
  var safe = function(x){ return String(x||'').replace(/[^A-Za-z0-9_\-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40); };
  var pdfName = 'Handover_' + (safe(rp.name) || 'recipient') + '_' + _pngDate(inst, 'yyyy-MM-dd') + '_' + String(uid).slice(-6) + '.pdf';
  var existing = handoversFolder.getFilesByName(pdfName);
  if (existing.hasNext()) return existing.next().getUrl();

  var doc = DocumentApp.create('tmp_' + pdfName.replace('.pdf',''));
  var b = doc.getBody();
  b.appendParagraph('MCA — Handover / Distribution record').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  b.appendParagraph('Date (PNG): ' + _pngDate(inst, 'd MMM yyyy'));
  b.appendParagraph('Officer: ' + (o.name || s.name || '') + (o.steward_id ? (' (' + o.steward_id + ')') : ''));
  b.appendParagraph('Zone: ' + (s.zone || ''));

  b.appendParagraph('Recipient').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  b.appendParagraph('Name: ' + (rp.name || ''));
  b.appendParagraph('Type: ' + (rp.type || '') + (rp.zone ? (' — ' + rp.zone) : '') + (rp.clan ? (' — clan ' + rp.clan) : ''));
  if (rp.received_by) b.appendParagraph('Received by: ' + rp.received_by);
  b.appendParagraph('Receipt confirmed: ' + (rp.confirmed_receipt === true ? 'Yes' : 'No'));

  b.appendParagraph('Items').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  var items = r.items || [];
  if (items.length) {
    var tbl = [['Item','Qty','Unit','Category']];
    items.forEach(function(it){ tbl.push([ String(it.description||''), (it.quantity!=null?String(it.quantity):''), String(it.unit||''), String(it.category||'') ]); });
    b.appendTable(tbl);
  } else { b.appendParagraph('(none listed)'); }

  b.appendParagraph('Purpose: ' + [r.purpose_category, r.purpose].filter(String).join(' — '));
  b.appendParagraph('Donor: ' + (r.donor || '') + (r.donor_recognised === true ? ' (recognised at handover)' : ''));
  var gps = (r.gps && r.gps.lat != null) ? (r.gps.lat + ', ' + r.gps.lng + (r.gps.accuracy ? (' ±' + r.gps.accuracy + 'm') : '')) : 'not recorded';
  b.appendParagraph('GPS: ' + gps);

  var ph = _dataUriToBlob(r.photo_handover, 'handover.jpg');
  if (ph) {
    b.appendParagraph('Handover photo').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    try { var img = b.appendImage(ph); var w = img.getWidth(); if (w > 420) { img.setHeight(Math.round(img.getHeight() * 420 / w)); img.setWidth(420); } }
    catch (e) { b.appendParagraph('(photo could not be embedded — see link below)'); }
  }

  /* Undertaking Form (equipment-for-work handovers). */
  b.appendParagraph('Undertaking Form: ' + (r.undertaking_completed === true ? 'Completed' : 'Not required / not completed'));
  var uf = r.undertaking_completed === true ? _dataUriToBlob(r.undertaking_photo, 'undertaking.jpg') : null;
  if (uf) {
    b.appendParagraph('Undertaking Form (photo)').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    try { var uimg = b.appendImage(uf); var uw = uimg.getWidth(); if (uw > 420) { uimg.setHeight(Math.round(uimg.getHeight() * 420 / uw)); uimg.setWidth(420); } }
    catch (e) { b.appendParagraph('(undertaking photo could not be embedded)'); }
  }

  b.appendParagraph('Media files').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  var L = r._links || {};
  var addLink = function(label, url){ if (!url) return; var p = b.appendParagraph(label + ' '); p.appendText(url).setLinkUrl(url); };
  addLink('Handover photo (full):', L.handover);
  addLink('Receipt photo:', L.receipt);
  addLink('Video:', L.video);

  b.appendParagraph('record_uid: ' + uid).editAsText().setFontSize(8).setForegroundColor('#999999');

  doc.saveAndClose();
  var pdfBlob = DriveApp.getFileById(doc.getId()).getAs('application/pdf').setName(pdfName);
  var file = handoversFolder.createFile(pdfBlob);
  try { DriveApp.getFileById(doc.getId()).setTrashed(true); } catch (e) {}  /* remove the temp Doc */
  return file.getUrl();
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
  var handoversMonth = getOrCreateFolder(ym, getOrCreateFolder('handovers', reportsFolder));

  /* Fresh ledger for the month (replace any previous run for the same month). */
  var ssName = 'Distribution ledger ' + ym;
  var old = reportsFolder.getFilesByName(ssName);
  while (old.hasNext()) { try { old.next().setTrashed(true); } catch(e){} }
  var ss = SpreadsheetApp.create(ssName);
  var sheet = ss.getActiveSheet();
  sheet.appendRow(['Date (PNG)','Officer','Zone','Recipient','Recipient type','Received by','Recipient clan','Items','Purpose','Donor','Donor recognised','Confirmed receipt','Undertaking form','GPS','Handover PDF','Handover photo','Receipt photo','Video','record_uid']);

  rows.sort(function(a,b){ return _recInstant(a.rec) - _recInstant(b.rec); });
  rows.forEach(function(x){
    var r = x.rec, s = x.steward, o = r.officer || {}, rp = r.recipient || {};
    var uid = r.record_uid || r.uid;
    var hLink = _extractMedia(mediaMonth, uid, 'handover', r.photo_handover, 'jpg');
    var rLink = _extractMedia(mediaMonth, uid, 'receipt',  r.photo_receipt,  'jpg');
    var vLink = _extractMedia(mediaMonth, uid, 'video',    r.video,          'mp4');
    r._links = { handover: hLink, receipt: rLink, video: vLink };
    var pdfLink = '';
    try { pdfLink = _handoverPdf(handoversMonth, r, s); } catch (e) { Logger.log('handover PDF failed for ' + uid + ': ' + e); }
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
      (r.undertaking_completed === true ? 'Yes' : ''),
      gps, pdfLink, hLink, rLink, vLink, uid
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
    try { handoversMonth.addViewer(email); } catch(e){}
    try { ssFile.addViewer(email); } catch(e){}
  });

  var body = [
    'MCApp — Monthly distribution / handover ledger',
    '',
    'Month: ' + ym + ' (PNG time)',
    'Handovers: ' + rows.length,
    '',
    'Ledger (Google Sheet): ' + ss.getUrl(),
    'One-page handover PDFs (photo + media links): ' + handoversMonth.getUrl(),
    'Photos & video for the month: ' + mediaMonth.getUrl(),
    '',
    'Each ledger row links to its one-page PDF, the handover photo, receipt photo and video.'
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

/* ─── Livelihood projects — monthly report, one PDF per TYPE across all sites ──
 * MCF staff log notes+photos per site (modules.livelihood). This groups the
 * month's updates by each site's TYPE and builds one readable PDF per type
 * (each site a section: notes + the first photo embedded, extra photos linked).
 * Emailed to Matilda/comms. Reuses _saveMedia + _dataUriToBlob. */
function collectLivelihoodUpdates() {
  var folder = getDataFolder(); var byUid = {};
  var zones = folder.getFolders();
  while (zones.hasNext()) {
    var zf = zones.next(); if (zf.getName().charAt(0) === '_') continue;
    var subs = zf.getFolders();
    while (subs.hasNext()) {
      var files = subs.next().getFilesByType(MimeType.PLAIN_TEXT);
      while (files.hasNext()) {
        var body; try { body = JSON.parse(files.next().getBlob().getDataAsString()); } catch(e){ continue; }
        var arr = (body.modules && body.modules.livelihood) || []; if (!arr.length) continue;
        var stew = body.steward || {};
        for (var i = 0; i < arr.length; i++) {
          var rec = arr[i]; var uid = rec.uid || rec.record_uid; if (!uid) continue;
          var prev = byUid[uid]; if (prev && _recInstant(prev.rec) >= _recInstant(rec)) continue;
          byUid[uid] = { rec: rec, steward: stew };
        }
      }
    }
  }
  return Object.keys(byUid).map(function(k){ return byUid[k]; });
}
function livelihoodReports(period) {
  period = (typeof period === 'string') ? period : 'prevmonth';
  var cutoff, periodEnd;
  if (period === 'monthly') { cutoff = currentMonthStart(); periodEnd = new Date(); }
  else { cutoff = prevMonthStart(); periodEnd = prevMonthEnd(); }
  var ym = _pngDate(cutoff, 'yyyy-MM');
  var cutMs = cutoff.getTime(), endMs = periodEnd.getTime();
  var updates = collectLivelihoodUpdates().filter(function(x){ var t = _recInstant(x.rec); return t >= cutMs && t <= endMs; });

  var reg = loadLivelihood(); var siteById = {}; (reg.sites || []).forEach(function(s){ siteById[s.id] = s; });
  var byType = {};
  updates.forEach(function(x){ var r = x.rec; var site = siteById[r.site_id] || {}; var type = r.type || site.type || 'Other'; (byType[type] = byType[type] || []).push(x); });

  var folder = getDataFolder();
  var mediaMonth   = getOrCreateFolder(ym, getOrCreateFolder('livelihood', getOrCreateFolder('_media', folder)));
  var reportsMonth = getOrCreateFolder(ym, getOrCreateFolder('livelihood', getOrCreateFolder('_reports', folder)));
  var made = [];
  Object.keys(byType).sort().forEach(function(type){
    var list = byType[type]; list.sort(function(a,b){ return _recInstant(a.rec) - _recInstant(b.rec); });
    var doc = DocumentApp.create('tmp_LVH_' + type.replace(/[^A-Za-z0-9]+/g,'-'));
    var b = doc.getBody();
    b.appendParagraph('MCA Livelihood — ' + type).setHeading(DocumentApp.ParagraphHeading.HEADING1);
    b.appendParagraph('Month: ' + _pngDate(cutoff, 'MMMM yyyy') + ' (PNG time) · ' + list.length + ' update' + (list.length===1?'':'s'));
    list.forEach(function(x){
      var r = x.rec, s = x.steward; var site = siteById[r.site_id] || {};
      b.appendParagraph((r.site_name || site.name || r.site_id || 'Site') + (site.zone ? (' — ' + site.zone) : '') + (site.clan ? (' — ' + site.clan) : '')).setHeading(DocumentApp.ParagraphHeading.HEADING2);
      b.appendParagraph('Date (PNG): ' + _pngDate(_recInstant(r) ? new Date(_recInstant(r)) : new Date(), 'd MMM yyyy') + ' · by ' + ((s.name||'') + (s.stewardId ? (' (' + s.stewardId + ')') : '')));
      b.appendParagraph(r.notes || '(no notes)');
      var photos = r.photos || (r.photo ? [r.photo] : []);
      photos.forEach(function(ph, i){
        var url = _saveMedia(mediaMonth, 'LVH_' + (r.uid || 'x') + '_p' + (i+1) + '.jpg', ph);
        if (i === 0) { var blob = _dataUriToBlob(ph, 'lvh.jpg'); if (blob) { try { var img = b.appendImage(blob); var w = img.getWidth(); if (w > 420) { img.setHeight(Math.round(img.getHeight()*420/w)); img.setWidth(420); } } catch(e){} } }
        else if (url) { var p = b.appendParagraph('Photo ' + (i+1) + ': '); p.appendText(url).setLinkUrl(url); }
      });
    });
    doc.saveAndClose();
    var pdf = DriveApp.getFileById(doc.getId()).getAs('application/pdf').setName(type.replace(/[^A-Za-z0-9]+/g,'_') + '_' + ym + '.pdf');
    var file = reportsMonth.createFile(pdf);
    try { DriveApp.getFileById(doc.getId()).setTrashed(true); } catch(e){}
    made.push({ type: type, url: file.getUrl(), n: list.length });
  });

  var rcp = loadRecipients(); var to = [];
  if (rcp.field_reports_to) to.push(rcp.field_reports_to);
  (rcp.comms || []).forEach(function(e){ if (e) to.push(e); });
  if (!to.length) to = REPORT_EMAILS.slice();
  to.forEach(function(email){ try { reportsMonth.addViewer(email); } catch(e){} try { mediaMonth.addViewer(email); } catch(e){} });
  var lines = ['MCA — Livelihood projects monthly report', '', 'Month: ' + ym + ' (PNG time)', '', 'One PDF per project type (site updates + photos): ' + reportsMonth.getUrl(), ''];
  made.forEach(function(p){ lines.push('• ' + p.type + ' — ' + p.n + ' update' + (p.n===1?'':'s') + ': ' + p.url); });
  if (!made.length) lines.push('(no livelihood updates recorded this month)');
  to.forEach(function(email){ MailApp.sendEmail(email, 'MCA Livelihood report — ' + ym, lines.join('\n')); });
  Logger.log('Livelihood report ' + ym + ': ' + made.length + ' type-PDFs → ' + to.join(', '));
  return { status: 'ok', month: ym, types: made.length, folder: reportsMonth.getUrl() };
}
function installLivelihoodReportsTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === 'livelihoodReports') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('livelihoodReports').timeBased().onMonthDay(1).atHour(8).create();
  Logger.log('Monthly livelihood report trigger installed (1st of month, 8am PNG).');
}

/* ─── Local price reports — witnessed sales + buyer announcements ────────────
 * Field staff record real local prices (massoy/coffee/cocoa/vanilla). This
 * builds a monthly spreadsheet ledger for analysis (toward a fair local price),
 * and emails it. Photos are left in the uploaded records; the ledger links the
 * record_uid. ── */
function collectPriceReports() {
  var folder = getDataFolder(); var byUid = {};
  var zones = folder.getFolders();
  while (zones.hasNext()) {
    var zf = zones.next(); if (zf.getName().charAt(0) === '_') continue;
    var subs = zf.getFolders();
    while (subs.hasNext()) {
      var files = subs.next().getFilesByType(MimeType.PLAIN_TEXT);
      while (files.hasNext()) {
        var body; try { body = JSON.parse(files.next().getBlob().getDataAsString()); } catch(e){ continue; }
        var arr = (body.modules && body.modules.price_reports) || []; if (!arr.length) continue;
        var stew = body.steward || {};
        for (var i = 0; i < arr.length; i++) {
          var rec = arr[i]; var uid = rec.record_uid || rec.uid; if (!uid) continue;
          var prev = byUid[uid]; if (prev && _recInstant(prev.rec) >= _recInstant(rec)) continue;
          byUid[uid] = { rec: rec, steward: stew };
        }
      }
    }
  }
  return Object.keys(byUid).map(function(k){ return byUid[k]; });
}
function _prCommodityLabel(r) {
  var m = { massoy:'Massoy', coffee:'Coffee', cocoa:'Cocoa', vanilla:'Vanilla', other:(r.commodity_other||'Other') };
  return m[r.commodity] || r.commodity || '';
}
function localPricesReport(period) {
  period = (typeof period === 'string') ? period : 'prevmonth';
  var cutoff, periodEnd;
  if (period === 'monthly') { cutoff = currentMonthStart(); periodEnd = new Date(); }
  else { cutoff = prevMonthStart(); periodEnd = prevMonthEnd(); }
  var ym = _pngDate(cutoff, 'yyyy-MM');
  var cutMs = cutoff.getTime(), endMs = periodEnd.getTime();
  var rows = collectPriceReports().filter(function(x){ var t = _recInstant(x.rec); return t >= cutMs && t <= endMs; });
  rows.sort(function(a,b){ return _recInstant(a.rec) - _recInstant(b.rec); });

  var folder = getDataFolder();
  var reportsFolder = getOrCreateFolder(ym, getOrCreateFolder('local_prices', getOrCreateFolder('_reports', folder)));
  var ss = SpreadsheetApp.create('MCA_Local_Prices_' + ym);
  var sheet = ss.getActiveSheet(); sheet.setName('Prices');
  sheet.appendRow(['Date (PNG)','Type','Commodity','Price (K)','Price unit','Volume','Volume unit','Place','Quality','Officer','Role','Zone','GPS','record_uid']);
  rows.forEach(function(x){
    var r = x.rec, s = x.steward, o = r.officer || {};
    var gps = (r.gps && r.gps.lat != null) ? (r.gps.lat + ', ' + r.gps.lng) : '';
    sheet.appendRow([
      _pngDate(_recInstant(r) ? new Date(_recInstant(r)) : '', 'yyyy-MM-dd HH:mm'),
      (r.report_type === 'announcement' ? 'Buyer price' : 'Witnessed sale'),
      _prCommodityLabel(r),
      (r.price != null ? r.price : ''),
      (r.price_unit === 'per_bag' ? 'per bag' : 'per kg'),
      (r.volume != null ? r.volume : ''),
      (r.volume_unit || ''),
      r.place || '', r.quality || '',
      (o.name || s.name || '') + (o.steward_id ? (' (' + o.steward_id + ')') : ''),
      o.role || s.role || '', o.zone || s.zone || '',
      gps, (r.record_uid || r.uid || '')
    ]);
  });
  /* Analysis tab: grouped by commodity + unit (never mixing per-kg and per-bag),
     witnessed vs buyer-announced, with min/avg/max — the beginning of a local
     fair-price picture. It fills out as more reports accumulate. */
  var an = ss.insertSheet('By commodity');
  an.appendRow(['Commodity','Price unit','Reports','Witnessed','Buyer-announced','Min (K)','Avg (K)','Max (K)','Places']);
  var groups = {};
  rows.forEach(function(x){
    var r = x.rec;
    var unit = (r.price_unit === 'per_bag' ? 'per bag' : 'per kg');
    var key = _prCommodityLabel(r) + '||' + unit;
    var g = groups[key] || (groups[key] = { commodity:_prCommodityLabel(r), unit:unit, n:0, wit:0, ann:0, prices:[], places:{} });
    g.n++; if (r.report_type === 'announcement') g.ann++; else g.wit++;
    if (r.price != null && !isNaN(r.price)) g.prices.push(Number(r.price));
    if (r.place) g.places[r.place] = 1;
  });
  var gkeys = Object.keys(groups).sort();
  gkeys.forEach(function(k){
    var g = groups[k], ps = g.prices;
    var min = ps.length ? Math.min.apply(null, ps) : '';
    var max = ps.length ? Math.max.apply(null, ps) : '';
    var avg = ps.length ? Math.round(ps.reduce(function(a,b){ return a+b; }, 0) / ps.length * 100) / 100 : '';
    an.appendRow([g.commodity, g.unit, g.n, g.wit, g.ann, min, avg, max, Object.keys(g.places).join(', ')]);
  });
  if (!gkeys.length) an.appendRow(['(no price reports in this period)','','','','','','','','']);

  var ssFile = DriveApp.getFileById(ss.getId());
  try { reportsFolder.addFile(ssFile); DriveApp.getRootFolder().removeFile(ssFile); } catch(e){}

  var rcp = loadRecipients(); var to = [];
  if (rcp.field_reports_to) to.push(rcp.field_reports_to);
  (rcp.comms || []).forEach(function(e){ if (e) to.push(e); });
  if (!to.length) to = REPORT_EMAILS.slice();
  to.forEach(function(email){ try { ssFile.addViewer(email); } catch(e){} });
  var lines = ['MCA — Local price reports', '', 'Month: ' + ym + ' (PNG time)', '', rows.length + ' report(s). Two tabs: full ledger + "By commodity" analysis.', '', 'Workbook: ' + ssFile.getUrl(), ''];
  to.forEach(function(email){ try { MailApp.sendEmail(email, 'MCA Local prices — ' + ym, lines.join('\n')); } catch(e){} });
  Logger.log('Local prices report ' + ym + ': ' + rows.length + ' rows → ' + to.join(', '));
  return { status:'ok', rows: rows.length, url: ssFile.getUrl() };
}
function installLocalPricesTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t){ if (t.getHandlerFunction() === 'localPricesReport') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('localPricesReport').timeBased().onMonthDay(1).atHour(8).create();
  Logger.log('Monthly local-prices report trigger installed (1st of month, 8am PNG).');
}

/* ─── Upload activity report — "what has been uploaded" ──────────────────────
 * A plain monitoring digest the coordinator can read at a glance: per steward,
 * how many records came in, broken down by activity type, with the latest
 * upload date — WITHOUT any of the heavy photo/video media. Emailed weekly.
 *
 * It must survive the big files (a handover carries a video and can be tens of
 * MB), so it does NOT JSON.parse each bundle — parsing a 40 MB file inflates
 * memory and can fail. Instead it scans the raw text for the light markers that
 * every record carries ("record_uid", "survey_type") and the flat "steward"
 * block, so counting costs almost nothing and never touches the base64 media.
 * Files above UPLOAD_SCAN_MAX_MB are reported by name/size/date only (the
 * stewardId is still recovered from the filename MCA_<id>_<date>.json).
 *
 * Totals are deduplicated by record_uid, so a record that was re-sent across
 * two syncs (e.g. a duplicate upload) is counted once, not twice.
 *
 * Run uploadActivityReport() from the editor for the last 7 days, or
 * uploadActivityReport('monthly') / uploadActivityReport('all'). Install the
 * weekly trigger once with installUploadActivityTrigger(). */
var UPLOAD_SCAN_MAX_MB = 25;   /* above this, report metadata only (no scan) */

var MODULE_LABELS = {
  freemap:'Field mapping', mafia:'MaFIA transect', water:'Water source',
  distribution:'Handover / distribution', livelihood:'Livelihood update',
  price_report:'Local price report', training:'Training', phenology:'Phenology',
  issue:'Issue report', facility:'Facility', met:'Weather station'
};
function _moduleLabel(k){ return MODULE_LABELS[k] || (k ? (k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g,' ')) : 'Other'); }

function _stewardIdFromFile(name) {
  /* MCA_<stewardId>_<date>.json  — stewardId may contain _ so strip a trailing
   * _<date> (YYYY-MM-DD, optionally with time) and the MCA_ prefix. */
  var n = String(name || '').replace(/^MCA_/, '').replace(/\.json$/i, '');
  return n.replace(/_\d{4}-\d{2}-\d{2}(?:[T_].*)?$/, '') || n;
}

function collectUploadActivity(cutMs) {
  cutMs = cutMs || 0;
  var folder = getDataFolder();
  var files = [];                 /* one row per upload file, newest first */
  var byStew = {};                /* stewardId -> aggregate across their files */
  function stew(id){ return byStew[id] || (byStew[id] = { id:id, name:'', role:'', zone:'', files:0, uids:{}, types:{}, latest:0, mb:0, highlights:[] }); }

  var zones = folder.getFolders();
  while (zones.hasNext()) {
    var zf = zones.next(); if (zf.getName().charAt(0) === '_') continue;
    var subs = zf.getFolders();
    while (subs.hasNext()) {
      var ff = subs.next().getFilesByType(MimeType.PLAIN_TEXT);
      while (ff.hasNext()) {
        var f = ff.next();
        var created = f.getDateCreated();
        if (created.getTime() < cutMs) continue;
        var sizeMb = Math.round(f.getSize() / 104857.6) / 10;   /* 1 dp MB */
        var row = { file:f.getName(), uploaded:created, sizeMB:sizeMb,
                    steward:'', stewardId:_stewardIdFromFile(f.getName()),
                    role:'', zone:'', types:{}, total:0, note:'', highlights:[] };
        if (f.getSize() > UPLOAD_SCAN_MAX_MB * 1048576) {
          row.note = 'large upload (' + sizeMb + ' MB, likely photos/video) — not scanned';
          row.total = -1;                                       /* unknown */
        } else {
          try {
            var s = f.getBlob().getDataAsString();
            var m = s.match(/"steward"\s*:\s*\{([\s\S]*?)\}/);
            if (m) {
              var b = m[1];
              var g = function(k){ var x = b.match(new RegExp('"' + k + '"\\s*:\\s*"([^"]*)"')); return x ? x[1] : ''; };
              row.steward = g('name'); if (g('stewardId')) row.stewardId = g('stewardId');
              row.role = g('role'); row.zone = g('zone');
            }
            var re = /"survey_type"\s*:\s*"([^"]+)"/g, mm, uidSet = {};
            while ((mm = re.exec(s)) !== null) { row.types[mm[1]] = (row.types[mm[1]] || 0) + 1; }
            var reu = /"record_uid"\s*:\s*"([^"]+)"/g;
            while ((mm = reu.exec(s)) !== null) { uidSet[mm[1]] = row; }
            row.total = Object.keys(uidSet).length;
            if (!row.total) { var rc = s.match(/"record_count"\s*:\s*(\d+)/); if (rc) row.total = parseInt(rc[1], 10); }
            row._uids = uidSet;                                 /* for steward dedup */
            /* Light content highlights: look only at the first ~1.5 KB after each
               survey_type marker (fields sit before any photo blob), so this stays
               cheap and never touches the base64 media. Capped per upload. */
            var parts = s.split('"survey_type"');
            for (var pi = 1; pi < parts.length && row.highlights.length < 6; pi++) {
              var blk = parts[pi].slice(0, 1500);
              var gt = function(k){ var x = blk.match(new RegExp('"' + k + '"\\s*:\\s*"([^"]*)"')); return x ? x[1] : ''; };
              var gnum = function(k){ var x = blk.match(new RegExp('"' + k + '"\\s*:\\s*([0-9.]+)')); return x ? x[1] : ''; };
              var st = (blk.match(/^\s*:\s*"([^"]+)"/) || [])[1] || '';
              if (st === 'price_report')      row.highlights.push('price · ' + gt('commodity') + ' ' + gnum('price') + '/' + (gt('price_unit') === 'per_bag' ? 'bag' : 'kg'));
              else if (st === 'freemap')      row.highlights.push('map (' + (gt('map_type') || '?') + ') · ' + (gt('title') || gt('category_label') || '—'));
              else if (st === 'livelihood')   row.highlights.push('livelihood · ' + (gt('site_name') || '—'));
              else if (st === 'training')     row.highlights.push('training · ' + (gt('topic') || gt('topic_name') || '—'));
              else if (st === 'distribution') row.highlights.push('handover · ' + (gt('item') || gt('activity') || '—'));
            }
          } catch (e) { row.note = 'could not read (' + String(e).slice(0, 60) + ')'; }
        }
        files.push(row);

        var a = stew(row.stewardId);
        a.files++; a.mb += sizeMb;
        if (created.getTime() > a.latest) a.latest = created.getTime();
        if (row.steward && !a.name) a.name = row.steward;
        if (row.role && !a.role) a.role = row.role;
        if (row.zone && !a.zone) a.zone = row.zone;
        if (row._uids) { for (var u in row._uids) a.uids[u] = 1; delete row._uids; }
        for (var t in row.types) a.types[t] = (a.types[t] || 0) + row.types[t];
        for (var hi = 0; hi < row.highlights.length && a.highlights.length < 8; hi++) {
          if (a.highlights.indexOf(row.highlights[hi]) < 0) a.highlights.push(row.highlights[hi]);
        }
      }
    }
  }
  files.sort(function(x, y){ return y.uploaded.getTime() - x.uploaded.getTime(); });
  var stewards = Object.keys(byStew).map(function(k){
    var a = byStew[k]; a.records = Object.keys(a.uids).length; delete a.uids; return a;
  }).sort(function(x, y){ return y.latest - x.latest; });
  return { files: files, stewards: stewards };
}

function _typeSummary(types) {
  var keys = Object.keys(types); if (!keys.length) return '';
  keys.sort(function(a, b){ return types[b] - types[a]; });
  return keys.map(function(k){ return _moduleLabel(k) + ': ' + types[k]; }).join(' · ');
}

/* Reads a data-folder JSON registry by name (returns {} if absent/bad). */
function _readDataJson(name) {
  try { var fs = getDataFolder().getFilesByName(name); if (fs.hasNext()) return JSON.parse(fs.next().getBlob().getDataAsString()); } catch(e){}
  return {};
}
/* "New approvals this window" — trainer certs, value-chain auditors and
 * clan-steward module unlocks granted since cutMs, resolved to names. */
function _newApprovalsLines(cutMs) {
  var roster = loadEnrolments() || {};
  function nm(sid){ sid=String(sid); var r=roster[sid]||roster[sid.trim().toUpperCase()]; return (r&&r.name)?(r.name+' ('+sid+')'):sid; }
  function recent(iso){ var t=Date.parse(iso||''); return !isNaN(t) && (!cutMs || t>=cutMs); }
  function scan(obj, fmt){ var out=[]; Object.keys(obj).forEach(function(sid){ (obj[sid]||[]).forEach(function(r){ if(r.status!=='revoked' && recent(r.authorised_at)) out.push('  • '+nm(sid)+' — '+fmt(r)+' (by '+(r.authorised_by||'?')+', '+_pngDate(new Date(r.authorised_at),'d MMM')+')'); }); }); return out; }
  var tlines = scan(_readDataJson('_trainer_certs.json'), function(r){ return 'Training: '+(r.topic_name||r.topic_id||''); });
  var alines = scan(_readDataJson('_vc_auditors.json'),   function(r){ return (r.commodity||'')+' auditor'; });
  var mlines = scan(_readDataJson('_module_training.json'),function(r){ return 'Module: '+(r.module||''); });
  var out = ['New approvals this window:'];
  out.push(' Training (' + tlines.length + '):');            out = out.concat(tlines.length ? tlines : ['  (none)']);
  out.push(' Value-chain auditors (' + alines.length + '):'); out = out.concat(alines.length ? alines : ['  (none)']);
  out.push(' Clan-steward modules (' + mlines.length + '):'); out = out.concat(mlines.length ? mlines : ['  (none)']);
  return out;
}

function uploadActivityReport(period) {
  period = (typeof period === 'string') ? period : 'weekly';
  var now = Date.now(), cutMs, label;
  if (period === 'all')       { cutMs = 0;                       label = 'all uploads to date'; }
  else if (period === 'monthly') { cutMs = now - 30 * 86400000;  label = 'last 30 days'; }
  else                        { cutMs = now - 7 * 86400000;       label = 'last 7 days'; }

  var data = collectUploadActivity(cutMs);
  var files = data.files, stewards = data.stewards;
  var fromTxt = (cutMs ? _pngDate(new Date(cutMs), 'd MMM yyyy') : 'start');
  var toTxt   = _pngDate(new Date(now), 'd MMM yyyy');

  /* Spreadsheet ledger — one row per upload file (no media) */
  var folder = getDataFolder();
  var tag = _pngDate(new Date(now), 'yyyy-MM-dd');
  var reportsFolder = getOrCreateFolder(tag, getOrCreateFolder('uploads', getOrCreateFolder('_reports', folder)));
  var ss = SpreadsheetApp.create('MCA_Uploads_' + tag);
  var sheet = ss.getActiveSheet(); sheet.setName('Uploads');
  sheet.appendRow(['Uploaded (PNG)','Steward','Steward ID','Role','Zone','Records','By activity','Size (MB)','File','Note']);
  files.forEach(function(r){
    sheet.appendRow([
      _pngDate(r.uploaded, 'yyyy-MM-dd HH:mm'),
      r.steward || '', r.stewardId || '', r.role || '', r.zone || '',
      (r.total < 0 ? '?' : r.total), _typeSummary(r.types),
      r.sizeMB, r.file, r.note
    ]);
  });
  var ssFile = DriveApp.getFileById(ss.getId());
  try { reportsFolder.addFile(ssFile); DriveApp.getRootFolder().removeFile(ssFile); } catch(e){}

  /* Readable email body — per steward */
  var totalFiles = files.length;
  var totalRecords = stewards.reduce(function(s, a){ return s + a.records; }, 0);
  var lines = [];
  lines.push('MCA — Upload activity (' + label + ')');
  lines.push('');
  lines.push('Window: ' + fromTxt + ' – ' + toTxt + ' (PNG time)');
  lines.push(stewards.length + ' steward(s), ' + totalFiles + ' upload(s), ' + totalRecords + ' record(s).');
  lines.push('');
  if (!stewards.length) {
    lines.push('No uploads in this window.');
  } else {
    lines.push('By steward (most recent first):');
    stewards.forEach(function(a){
      var who = (a.name || a.id) + (a.name && a.id ? (' (' + a.id + ')') : '');
      var meta = [a.role, a.zone].filter(Boolean).join(', ');
      lines.push('• ' + who + (meta ? ' — ' + meta : ''));
      var ts = _typeSummary(a.types);
      lines.push('    ' + a.records + ' record(s)' + (ts ? ' — ' + ts : '') +
                 ' · ' + a.files + ' upload(s) · last ' + _pngDate(new Date(a.latest), 'd MMM HH:mm'));
      if (a.highlights && a.highlights.length) lines.push('    e.g. ' + a.highlights.join('  |  '));
    });
  }
  lines.push('');
  lines = lines.concat(_newApprovalsLines(cutMs));
  lines.push('');
  lines.push('Full per-upload ledger (no photos/video): ' + ssFile.getUrl());

  var rcp = loadRecipients(); var to = [];
  if (rcp.field_reports_to) to.push(rcp.field_reports_to);
  (rcp.comms || []).forEach(function(e){ if (e) to.push(e); });
  if (!to.length) to = REPORT_EMAILS.slice();
  /* dedupe recipients */
  var seen = {}; to = to.filter(function(e){ e = String(e).trim(); if (!e || seen[e]) return false; seen[e] = 1; return true; });
  to.forEach(function(email){ try { ssFile.addViewer(email); } catch(e){} });
  to.forEach(function(email){ try { MailApp.sendEmail(email, 'MCA uploads — ' + toTxt + ' (' + label + ')', lines.join('\n')); } catch(e){} });
  Logger.log('Upload activity report (' + label + '): ' + totalFiles + ' files, ' + totalRecords + ' records → ' + to.join(', '));
  return { status:'ok', period: period, stewards: stewards.length, files: totalFiles, records: totalRecords, url: ssFile.getUrl() };
}

function installUploadActivityTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t){ if (t.getHandlerFunction() === 'uploadActivityReport') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('uploadActivityReport').timeBased().everyWeeks(1).onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).create();
  Logger.log('Weekly upload-activity report trigger installed (Mondays ~7am PNG).');
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
  var body = ['MCApp — Field officer reports — ' + ym + ' (PNG time)','',
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

var COMPLIANCE_MAFIA_TARGET = 1;   /* MaFIA: 1 per month, every clan (monthly cadence confirmed) */

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
/* Fire & deforestation investigation for a clan in a window: due = fire/clearance
 * alerts owned by the clan raised in the window; done = those verified/closed.
 * "(if any)" — due is 0 when no alerts were raised for the clan. */
function _clanInvestigations(distList, clan, cutMs, endMs) {
  var due = 0, done = 0;
  (distList || []).forEach(function(d){
    if (!d || (d.kind !== 'fire' && d.kind !== 'clearance')) return;
    if (d.owner_clan !== clan) return;
    var t = Date.parse(d.created_date || d.detected_date || '');
    if (isNaN(t) || t < cutMs || t > endMs) return;
    due++;
    if (d.status === 'verified' || d.status === 'closed') done++;
  });
  return { due: due, done: done };
}
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
      facList   = loadFacilitiesList(), metList   = loadMetStationsList(),
      distList  = loadDisturbancesList();
  var ids = function(arr){ return arr.map(function(it){ return (it.id != null) ? it.id : it.uid; }); };
  var everSynced = function(mods){ return Object.keys(mods||{}).some(function(mk){ return Object.keys(mods[mk]).length > 0; }); };

  var all = clanStewardsWithRoster();
  var rows = [];
  Object.keys(all).forEach(function(sid){
    var c = all[sid], s = c.steward, clan = s.clan || '';
    var phenoReg = _ownedApproved(phenoList, clan), waterReg = _ownedApproved(waterList, clan),
        facReg   = _ownedApproved(facList, clan),   metReg   = _ownedApproved(metList, clan);
    var maf = monthCount(c.mods.mafia);
    rows.push({
      s: s, clan: clan,
      reported: _reportedThisMonth(c.mods, inMonth),
      everSynced: everSynced(c.mods),
      maf: maf,
      fire:  _clanInvestigations(distList, clan, cutMs, endMs),
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
  sh.appendRow(['Clan steward','Zone','Clan','Reported this month','MaFIA (target '+COMPLIANCE_MAFIA_TARGET+')','Fire & deforestation','Phenology','Water quality','Gov services','Met stations']);
  rows.forEach(function(x){
    sh.appendRow([ (x.s.name||'')+' ('+(x.s.stewardId||'')+')', x.s.zone||'', x.clan,
      (x.reported ? 'Yes' : (x.everSynced ? 'No' : 'No (never synced)')),
      (x.maf>=COMPLIANCE_MAFIA_TARGET ? (x.maf+'/'+COMPLIANCE_MAFIA_TARGET+' ✓') : (x.maf+'/'+COMPLIANCE_MAFIA_TARGET)),
      _complCell(x.fire.done,x.fire.due),
      _complCell(x.pheno.done,x.pheno.reg), _complCell(x.water.done,x.water.reg),
      _complCell(x.gov.done,x.gov.reg), _complCell(x.met.done,x.met.reg) ]);
  });

  /* Tab 2 — rollup by zone + MCA */
  var zoneMap = {};
  rows.forEach(function(x){
    var z = x.s.zone || '—';
    if (!zoneMap[z]) zoneMap[z] = { stewards:0, reported:0, mafDone:0, fD:0,fR:0, pD:0,pR:0, wD:0,wR:0, gD:0,gR:0, mD:0,mR:0 };
    var zm = zoneMap[z];
    zm.stewards++; if (x.reported) zm.reported++; if (x.maf>=COMPLIANCE_MAFIA_TARGET) zm.mafDone++;
    zm.fD+=x.fire.done;  zm.fR+=x.fire.due;
    zm.pD+=x.pheno.done; zm.pR+=x.pheno.reg; zm.wD+=x.water.done; zm.wR+=x.water.reg;
    zm.gD+=x.gov.done;   zm.gR+=x.gov.reg;   zm.mD+=x.met.done;   zm.mR+=x.met.reg;
  });
  var ru = ss.insertSheet('Rollup');
  ru.appendRow(['Zone','Clan stewards (roster)','Reporting','MaFIA done','Fire & deforestation','Phenology','Water quality','Gov services','Met stations']);
  var tot = { stewards:0, reported:0, mafDone:0, fD:0,fR:0, pD:0,pR:0, wD:0,wR:0, gD:0,gR:0, mD:0,mR:0 };
  Object.keys(zoneMap).sort().forEach(function(z){
    var zm = zoneMap[z];
    ru.appendRow([ z, zm.stewards, zm.reported+'/'+zm.stewards, zm.mafDone+'/'+zm.stewards,
      _complCell(zm.fD,zm.fR), _complCell(zm.pD,zm.pR), _complCell(zm.wD,zm.wR), _complCell(zm.gD,zm.gR), _complCell(zm.mD,zm.mR) ]);
    ['stewards','reported','mafDone','fD','fR','pD','pR','wD','wR','gD','gR','mD','mR'].forEach(function(k){ tot[k]+=zm[k]; });
  });
  ru.appendRow(['MCA (all zones)', tot.stewards, tot.reported+'/'+tot.stewards, tot.mafDone+'/'+tot.stewards,
    _complCell(tot.fD,tot.fR), _complCell(tot.pD,tot.pR), _complCell(tot.wD,tot.wR), _complCell(tot.gD,tot.gR), _complCell(tot.mD,tot.mR) ]);

  var ssFile = DriveApp.getFileById(ss.getId());
  try { reportsFolder.addFile(ssFile); DriveApp.getRootFolder().removeFile(ssFile); } catch(e){}

  var rcp = loadRecipients();
  var to = REPORT_EMAILS.slice();
  if (rcp.field_reports_to && to.indexOf(rcp.field_reports_to) === -1) to.push(rcp.field_reports_to);
  to.forEach(function(email){ try { ssFile.addViewer(email); } catch(e){} });

  var body = ['MCApp — Clan-steward compliance — ' + ym + ' (PNG time)','',
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

/* ─── Annual clan-steward compliance (2-month leeway) ───────────────────
 * Once a year, a COMPLETE picture of progress and action. Records bucket by
 * their own date (PNG), so running this ~1 March for the previous calendar year
 * captures reports synced late — the 2-month leeway. Per clan steward, a 12-
 * month summary (months reported, MaFIA done /12, fire & deforestation, annual
 * phenology coverage, water/gov/met), plus a zone + MCA rollup (simple sums).
 * Same registry-as-target and roster logic as the monthly report. To MCF
 * oversight + Matilda. TRIGGER: installAnnualComplianceTrigger() → fires 1st of
 * each month 8am PNG but only acts in March (prior year). On demand:
 * annualComplianceReport(2026). */
function annualComplianceReport(year) {
  var now = new Date();
  if (typeof year !== 'number') year = (now.getMonth() <= 1) ? (now.getFullYear() - 1) : now.getFullYear();
  var yStart = new Date(year,0,1).getTime(), yEnd = new Date(year+1,0,1).getTime() - 1;
  var months = []; for (var m=0;m<12;m++) months.push({ s:new Date(year,m,1).getTime(), e:new Date(year,m+1,1).getTime()-1 });

  var phenoList=loadPhenoPlotsList(), waterList=loadWaterSourcesList(), facList=loadFacilitiesList(),
      metList=loadMetStationsList(), distList=loadDisturbancesList();
  var ids=function(arr){ return arr.map(function(it){ return (it.id!=null)?it.id:it.uid; }); };

  var all = clanStewardsWithRoster();
  var rows = [];
  Object.keys(all).forEach(function(sid){
    var c=all[sid], s=c.steward, clan=s.clan||'';
    var phenoReg=_ownedApproved(phenoList,clan), waterReg=_ownedApproved(waterList,clan),
        facReg=_ownedApproved(facList,clan), metReg=_ownedApproved(metList,clan);
    var rep=0, maf=0, pD=0, wD=0, gD=0, mD=0;
    months.forEach(function(w){
      var inM=function(r){ var t=_recInstant(r); return t>=w.s && t<=w.e; };
      if (_reportedThisMonth(c.mods, inM)) rep++;
      var mafN=0; if (c.mods.mafia) Object.keys(c.mods.mafia).forEach(function(u){ if(inM(c.mods.mafia[u])) mafN++; });
      if (mafN>=COMPLIANCE_MAFIA_TARGET) maf++;
      pD+=_monitoredOwned(c.mods.phenology,      'plot_id',        ids(phenoReg), inM);
      wD+=_monitoredOwned(c.mods.water,          'water_source_id',ids(waterReg), inM);
      gD+=_monitoredOwned(c.mods.facility_visits,'facility_id',    ids(facReg),   inM);
      mD+=_monitoredOwned(c.mods.met_readings,   'met_station_id', ids(metReg),   inM);
    });
    rows.push({ s:s, clan:clan, rep:rep, maf:maf, fire:_clanInvestigations(distList,clan,yStart,yEnd),
      pheno:{done:pD,exp:phenoReg.length*12}, water:{done:wD,exp:waterReg.length*12},
      gov:{done:gD,exp:facReg.length*12},     met:{done:mD,exp:metReg.length*12} });
  });
  rows.sort(function(a,b){ return (a.s.zone||'').localeCompare(b.s.zone||'') || (a.s.name||'').localeCompare(b.s.name||''); });

  var folder=getDataFolder(), reportsFolder=getOrCreateFolder('_reports', folder);
  var ssName='Clan steward annual compliance '+year;
  var old=reportsFolder.getFilesByName(ssName); while(old.hasNext()){ try{old.next().setTrashed(true);}catch(e){} }
  var ss=SpreadsheetApp.create(ssName);

  var sh=ss.getActiveSheet(); sh.setName('By clan steward ('+year+')');
  sh.appendRow(['Clan steward','Zone','Clan','Months reported','MaFIA (/12)','Fire & deforestation','Phenology (tree-months)','Water quality','Gov services','Met stations']);
  rows.forEach(function(x){
    sh.appendRow([ (x.s.name||'')+' ('+(x.s.stewardId||'')+')', x.s.zone||'', x.clan,
      x.rep+'/12', x.maf+'/12'+(x.maf>=12?' ✓':''), _complCell(x.fire.done,x.fire.due),
      _complCell(x.pheno.done,x.pheno.exp), _complCell(x.water.done,x.water.exp),
      _complCell(x.gov.done,x.gov.exp), _complCell(x.met.done,x.met.exp) ]);
  });

  var zoneMap={};
  rows.forEach(function(x){
    var z=x.s.zone||'—';
    if(!zoneMap[z]) zoneMap[z]={ stewards:0, repM:0, mafM:0, fD:0,fR:0, pD:0,pE:0, wD:0,wE:0, gD:0,gE:0, mD:0,mE:0 };
    var zm=zoneMap[z];
    zm.stewards++; zm.repM+=x.rep; zm.mafM+=x.maf; zm.fD+=x.fire.done; zm.fR+=x.fire.due;
    zm.pD+=x.pheno.done; zm.pE+=x.pheno.exp; zm.wD+=x.water.done; zm.wE+=x.water.exp;
    zm.gD+=x.gov.done;   zm.gE+=x.gov.exp;   zm.mD+=x.met.done;   zm.mE+=x.met.exp;
  });
  var ru=ss.insertSheet('Rollup ('+year+')');
  ru.appendRow(['Zone','Clan stewards (roster)','Months reported (of 12N)','MaFIA (of 12N)','Fire & deforestation','Phenology (tree-months)','Water quality','Gov services','Met stations']);
  var tot={ stewards:0, repM:0, mafM:0, fD:0,fR:0, pD:0,pE:0, wD:0,wE:0, gD:0,gE:0, mD:0,mE:0 };
  Object.keys(zoneMap).sort().forEach(function(z){
    var zm=zoneMap[z], cap=zm.stewards*12;
    ru.appendRow([ z, zm.stewards, zm.repM+'/'+cap, zm.mafM+'/'+cap, _complCell(zm.fD,zm.fR),
      _complCell(zm.pD,zm.pE), _complCell(zm.wD,zm.wE), _complCell(zm.gD,zm.gE), _complCell(zm.mD,zm.mE) ]);
    ['stewards','repM','mafM','fD','fR','pD','pE','wD','wE','gD','gE','mD','mE'].forEach(function(k){ tot[k]+=zm[k]; });
  });
  var capT=tot.stewards*12;
  ru.appendRow(['MCA (all zones)', tot.stewards, tot.repM+'/'+capT, tot.mafM+'/'+capT, _complCell(tot.fD,tot.fR),
    _complCell(tot.pD,tot.pE), _complCell(tot.wD,tot.wE), _complCell(tot.gD,tot.gE), _complCell(tot.mD,tot.mE) ]);

  var ssFile=DriveApp.getFileById(ss.getId());
  try { reportsFolder.addFile(ssFile); DriveApp.getRootFolder().removeFile(ssFile); } catch(e){}
  var rcp=loadRecipients(); var to=REPORT_EMAILS.slice();
  if (rcp.field_reports_to && to.indexOf(rcp.field_reports_to)===-1) to.push(rcp.field_reports_to);
  to.forEach(function(email){ try{ ssFile.addViewer(email); }catch(e){} });
  var body=['MCApp — Annual clan-steward compliance — '+year+' (PNG time)','',
    'Clan stewards in the roster: '+rows.length,
    '',
    'Report (Google Sheet): '+ss.getUrl(),
    '',
    'Complete year with a 2-month leeway: records count in the month of the work,',
    'so reports synced up to ~end of February still land in last year. "12N" = 12',
    'months × stewards. Targets are the registry (phenology/water/gov/met) and the',
    'alerts raised (fire & deforestation); "—" means nothing was due. Not reporting',
    'is a failure — the report is the deliverable.'
  ].join('\n');
  to.forEach(function(email){ MailApp.sendEmail(email, 'MCA Annual clan-steward compliance — '+year, body); });
  Logger.log('Annual compliance '+year+': '+rows.length+' stewards → '+to.join(', '));
  return { status:'ok', year:year, stewards:rows.length, report:ss.getUrl() };
}

/* Fires 1st of each month (8am PNG) but only acts in March, producing the
 * previous calendar year's annual report after the 2-month leeway. */
function annualComplianceTriggerRun() {
  if (new Date().getMonth() === 2) annualComplianceReport(new Date().getFullYear() - 1);
}
function installAnnualComplianceTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === 'annualComplianceTriggerRun') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('annualComplianceTriggerRun').timeBased().onMonthDay(1).atHour(8).create();
  Logger.log('Annual clan-compliance trigger installed (1st monthly, acts in March for prior year).');
}

/* ─── Water quality report (clan → zone → MCA) ──────────────────────────
 * Answers the three questions: (1) better or worse than before, (2) seasonal
 * trend, (3) drying out. Water quality here is OBSERVATIONAL (colour, odour,
 * pollution, Secchi clarity, bioindicators; engineered: contamination, leaks,
 * damage) — not lab chemistry — so "quality" is a count of concern signals, not
 * a fake score. "Drying" reads the flow field. Covers all readings to date
 * (trends need history); seasonal needs a full wet+dry cycle to be meaningful.
 * To MCF oversight + Matilda. TRIGGER: installWaterQualityTrigger() (1st, 8am
 * PNG). On demand: waterQualityReport(). Populates as readings accumulate. */

/* Generic: all records of a module across every steward bundle, deduped by
 * record_uid (latest kept), with the recording steward attached. */
function collectModule(moduleKey) {
  var folder = getDataFolder(), byUid = {};
  var zones = folder.getFolders();
  while (zones.hasNext()) {
    var zf = zones.next(); if (zf.getName().charAt(0) === '_') continue;
    var subs = zf.getFolders();
    while (subs.hasNext()) {
      var files = subs.next().getFilesByType(MimeType.PLAIN_TEXT);
      while (files.hasNext()) {
        var body; try { body = JSON.parse(files.next().getBlob().getDataAsString()); } catch(e) { continue; }
        var arr = (body.modules && body.modules[moduleKey]) || []; if (!arr.length) continue;
        var stew = body.steward || {};
        arr.forEach(function(r){ var u=r.record_uid||r.uid; if(!u) return; var p=byUid[u]; if(p && _recInstant(p.rec)>=_recInstant(r)) return; byUid[u]={rec:r, steward:stew}; });
      }
    }
  }
  return Object.keys(byUid).map(function(k){ return byUid[k]; });
}

function _wIsEngineered(rec) { return rec.source_flow != null || rec.delivery_flow != null; }
function _waterFlow(rec) {
  if (_wIsEngineered(rec)) {
    var f = rec.source_flow || '';
    return { label:f, ord:(f==='Good flow'?2:f==='Low / reduced'?1:f==='None — dry'?0:null), dry:(f==='None — dry') };
  }
  var n = rec.flow || '';
  return { label:n, ord:(n==='Fast/Flood'?3:n==='Moderate'?2:n==='Slow'?1:n==='Still / Not flowing'?0:null), dry:(n==='Still / Not flowing') };
}
function _waterConcerns(rec) {
  var c = [];
  if (_wIsEngineered(rec)) {
    if (rec.contamination && rec.contamination !== 'none') c.push('contamination:'+rec.contamination);
    if (rec.leaks && rec.leaks !== 'none')               c.push('leaks:'+rec.leaks);
    if (rec.damage && rec.damage !== 'none')             c.push('damage:'+rec.damage);
  } else {
    if (rec.water_colour && rec.water_colour !== 'Clear') c.push('colour:'+rec.water_colour);
    if (rec.odour && rec.odour !== 'None')                c.push('odour:'+rec.odour);
    if (rec.pollution === 'Yes')                          c.push('pollution');
  }
  return c;
}
function _waterSeason(ms) {
  var m = parseInt(Utilities.formatDate(new Date(ms), 'Pacific/Port_Moresby', 'M'), 10);
  return (m >= 11 || m <= 4) ? 'Wet (Nov–Apr)' : 'Dry (May–Oct)';
}
function _waterBioCell(rec) {
  var b = [];
  if (rec.secchi_depth_cm != null && rec.secchi_depth_cm !== 0) b.push('Secchi ' + rec.secchi_depth_cm + 'cm');
  if (rec.pond_skaters) b.push('skaters:' + rec.pond_skaters);
  if (rec.shading) b.push('shade:' + rec.shading);
  return b.join(', ');
}

function waterQualityReport() {
  var readings = collectModule('water');
  /* clan → zone from steward blocks (recorder's zone) */
  var clanZone = {};
  readings.forEach(function(x){ var cl=x.rec.clan||''; if(cl && x.steward.zone) clanZone[cl]=x.steward.zone; });

  /* group by source */
  var bySource = {};
  readings.forEach(function(x){
    var r = x.rec, id = (r.water_source_id != null) ? String(r.water_source_id) : ('name:'+(r.water_source_name||'?'));
    if (!bySource[id]) bySource[id] = { id:id, name:r.water_source_name||'(unnamed)', type:r.source_type||'', clan:r.clan||'', zone:clanZone[r.clan]||'', readings:[] };
    bySource[id].readings.push(r);
  });
  Object.keys(bySource).forEach(function(id){ bySource[id].readings.sort(function(a,b){ return _recInstant(a)-_recInstant(b); }); });

  var folder = getDataFolder(), reportsFolder = getOrCreateFolder('_reports', folder);
  var stamp = _pngDate(new Date(), 'yyyy-MM-dd');
  var ssName = 'Water quality report ' + stamp;
  var old = reportsFolder.getFilesByName(ssName); while (old.hasNext()) { try { old.next().setTrashed(true); } catch(e){} }
  var ss = SpreadsheetApp.create(ssName);

  /* Tab 1 — Readings (time series) */
  var rd = ss.getActiveSheet(); rd.setName('Readings');
  rd.appendRow(['Source','Clan','Zone','Type','Date (PNG)','Season','Flow','Colour','Odour','Pollution','Clarity/bioindicators','Concern flags','Photo','Notes']);
  Object.keys(bySource).sort().forEach(function(id){
    var sc = bySource[id];
    sc.readings.forEach(function(r){
      var fl = _waterFlow(r), cc = _waterConcerns(r);
      rd.appendRow([ sc.name, sc.clan, sc.zone, sc.type,
        _pngDate(_recInstant(r)?new Date(_recInstant(r)):'', 'yyyy-MM-dd'),
        _recInstant(r)?_waterSeason(_recInstant(r)):'',
        fl.label + (fl.dry?' ⚠':''),
        r.water_colour||'', r.odour||'', r.pollution||'',
        _waterBioCell(r), (cc.length?cc.length+' ('+cc.join('; ')+')':'0'),
        (r.photo?'yes':''), r.notes||'' ]);
    });
  });

  /* Tab 2 — By source: better/worse + drying */
  var bs = ss.insertSheet('By source');
  bs.appendRow(['Source','Clan','Zone','Type','Readings','First','Last','Quality vs before','Flow now','Drying?','Latest concerns']);
  Object.keys(bySource).sort().forEach(function(id){
    var sc = bySource[id], rs = sc.readings, n = rs.length;
    var last = rs[n-1], prev = n>=2 ? rs[n-2] : null, first = rs[0];
    var lastC = _waterConcerns(last).length, prevC = prev ? _waterConcerns(prev).length : null;
    var quality = (prev==null) ? 'insufficient data' : (lastC<prevC ? 'better ↑' : lastC>prevC ? 'worse ↓' : 'same =');
    var flLast = _waterFlow(last), flFirst = _waterFlow(first);
    var drying = flLast.dry ? 'DRY/stagnant now' :
                 (flLast.ord!=null && flFirst.ord!=null && n>=2 && flLast.ord<flFirst.ord) ? 'flow declining' : 'stable';
    bs.appendRow([ sc.name, sc.clan, sc.zone, sc.type, n,
      _pngDate(_recInstant(first)?new Date(_recInstant(first)):'', 'yyyy-MM-dd'),
      _pngDate(_recInstant(last)?new Date(_recInstant(last)):'', 'yyyy-MM-dd'),
      quality, flLast.label, drying, _waterConcerns(last).join('; ') ]);
  });

  /* Tab 3 — Seasonal (per source × season) */
  var se = ss.insertSheet('Seasonal');
  se.appendRow(['Source','Clan','Zone','Season','Readings','Avg concern flags','Dry/stagnant readings']);
  Object.keys(bySource).sort().forEach(function(id){
    var sc = bySource[id], bySeason = {};
    sc.readings.forEach(function(r){
      var t=_recInstant(r); if(!t) return; var s=_waterSeason(t);
      if(!bySeason[s]) bySeason[s]={ n:0, c:0, dry:0 };
      bySeason[s].n++; bySeason[s].c += _waterConcerns(r).length; if(_waterFlow(r).dry) bySeason[s].dry++;
    });
    Object.keys(bySeason).sort().forEach(function(s){
      var v=bySeason[s];
      se.appendRow([ sc.name, sc.clan, sc.zone, s, v.n, (v.n?(Math.round(v.c/v.n*10)/10):0), v.dry ]);
    });
  });

  /* Tab 4 — Rollup clan → zone → MCA */
  var agg = function(){ return { sources:0, readings:0, concern:0, drying:0 }; };
  var clanM={}, zoneM={}, mca=agg();
  Object.keys(bySource).forEach(function(id){
    var sc=bySource[id], rs=sc.readings, last=rs[rs.length-1];
    var hasConcern = _waterConcerns(last).length>0 ? 1:0;
    var fl=_waterFlow(last), flFirst=_waterFlow(rs[0]);
    var isDry = (fl.dry || (fl.ord!=null && flFirst.ord!=null && rs.length>=2 && fl.ord<flFirst.ord)) ? 1:0;
    var ck=sc.clan||'—', zk=sc.zone||'—';
    if(!clanM[ck]) clanM[ck]={ zone:zk, a:agg() }; if(!zoneM[zk]) zoneM[zk]=agg();
    [clanM[ck].a, zoneM[zk], mca].forEach(function(a){ a.sources++; a.readings+=rs.length; a.concern+=hasConcern; a.drying+=isDry; });
  });
  var ro = ss.insertSheet('Rollup');
  ro.appendRow(['Tier','Name','Zone','Sources monitored','Readings','Sources w/ concern (latest)','Sources drying']);
  Object.keys(clanM).sort().forEach(function(ck){ var a=clanM[ck].a; ro.appendRow(['Clan', ck, clanM[ck].zone, a.sources, a.readings, a.concern, a.drying]); });
  Object.keys(zoneM).sort().forEach(function(zk){ var a=zoneM[zk]; ro.appendRow(['Zone', zk, zk, a.sources, a.readings, a.concern, a.drying]); });
  ro.appendRow(['MCA','All zones','', mca.sources, mca.readings, mca.concern, mca.drying]);

  var ssFile = DriveApp.getFileById(ss.getId());
  try { reportsFolder.addFile(ssFile); DriveApp.getRootFolder().removeFile(ssFile); } catch(e){}
  var rcp = loadRecipients(), to = REPORT_EMAILS.slice();
  if (rcp.field_reports_to && to.indexOf(rcp.field_reports_to)===-1) to.push(rcp.field_reports_to);
  to.forEach(function(email){ try{ ssFile.addViewer(email); }catch(e){} });
  var srcCount = Object.keys(bySource).length;
  var body = ['MCApp — Water quality report — ' + stamp + ' (PNG time)','',
    'Sources with readings: ' + srcCount + '   ·   total readings: ' + readings.length,
    '',
    'Report (Google Sheet): ' + ss.getUrl(),
    '',
    'Tabs: Readings (every reading) · By source (better/worse vs last reading +',
    'drying from the flow field) · Seasonal (wet Nov–Apr / dry May–Oct) · Rollup',
    '(clan → zone → MCA). Quality is observational — a count of concern signals',
    '(colour/odour/pollution or contamination/leaks/damage), not a lab score.',
    '"Better/worse" needs ≥2 readings; seasonal needs a full wet+dry cycle. The',
    'report fills out as readings accumulate.'
  ].join('\n');
  to.forEach(function(email){ MailApp.sendEmail(email, 'MCA Water quality report — ' + stamp, body); });
  Logger.log('Water quality report ' + stamp + ': ' + srcCount + ' sources, ' + readings.length + ' readings → ' + to.join(', '));
  return { status:'ok', sources:srcCount, readings:readings.length, report:ss.getUrl() };
}

function installWaterQualityTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === 'waterQualityReport') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('waterQualityReport').timeBased().onMonthDay(1).atHour(8).create();
  Logger.log('Monthly water-quality trigger installed (1st of month, 8am PNG).');
}

/* ─── Field-mapping export — freemap uploads → map files people can open ─────
 * Field officers' biggest output is field mapping (points, walked lines, and
 * area polygons: gardens, tracks, water points, problems). The raw JSON bundles
 * aren't viewable, so this turns every freemap record into TWO map files in
 * Drive — a KML (opens straight in Google Earth / Maps) and a GeoJSON (loads
 * into QGIS, a database, or a Leaflet map) — plus a one-page summary email.
 * Photos are deliberately left out of the export (they stay in the source
 * records); this is the geometry + attributes, so the data can be read and used.
 *
 * Run freemapExportReport() from the editor any time, or install the weekly
 * trigger with installFreemapExportTrigger(). */
function _xml(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _fmMeasure(r){
  if (r.map_type==='area'){ var ha=(r.area_ha!=null?r.area_ha:0); var m2=(r.area_m2!=null?r.area_m2:Math.round(ha*10000)); return (ha<0.1)?(m2+' m2'):(ha.toFixed(1)+' ha'); }
  if (r.map_type==='line'){ return (r.length_m||0)+' m'; }
  return 'point';
}
function _fmLonLat(p){ return (p.lon!=null?p.lon:p.lng)+','+p.lat+',0'; }
function collectFreemap() {
  var folder = getDataFolder(); var byUid = {};
  var zones = folder.getFolders();
  while (zones.hasNext()) {
    var zf = zones.next(); if (zf.getName().charAt(0)==='_') continue;
    var subs = zf.getFolders();
    while (subs.hasNext()) {
      var files = subs.next().getFilesByType(MimeType.PLAIN_TEXT);
      while (files.hasNext()) {
        var body; try { body = JSON.parse(files.next().getBlob().getDataAsString()); } catch(e){ continue; }
        var arr = (body.modules && body.modules.freemap) || []; if (!arr.length) continue;
        var stew = body.steward || {};
        for (var i=0;i<arr.length;i++){
          var r = arr[i]; var uid = r.record_uid || r.uid; if (!uid || byUid[uid]) continue;
          if (r.photo) r.photo = null;                 /* drop media from the export */
          r._steward_name = stew.name || '';
          r._steward_id = r.steward || stew.stewardId || '';
          r._zone = stew.zone || '';
          byUid[uid] = r;
        }
      }
    }
  }
  return Object.keys(byUid).map(function(k){ return byUid[k]; });
}
function _freemapKml(recs){
  var out = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>',
    '<name>MCA Field Maps - '+_pngDate(new Date(),'yyyy-MM-dd')+'</name>',
    '<Style id="pt"><IconStyle><color>ff578b2e</color></IconStyle></Style>',
    '<Style id="ln"><LineStyle><color>ff5c6900</color><width>3</width></LineStyle></Style>',
    '<Style id="ar"><LineStyle><color>ffa86e0b</color><width>2</width></LineStyle><PolyStyle><color>554caf50</color></PolyStyle></Style>'];
  recs.forEach(function(r){
    var pts = r.points || []; if (!pts.length) return;
    var who = (r._steward_name||r._steward_id||'')+(r._steward_id?(' ('+r._steward_id+')'):'');
    var desc = [
      (r.category_label||r.category||''),
      'Mapped by: '+who,
      'Zone: '+(r._zone||r.clan||''),
      'Date: '+_pngDate(r.recorded_at?new Date(r.recorded_at):new Date(),'yyyy-MM-dd'),
      'Size: '+_fmMeasure(r),
      r.crops?('Crops: '+r.crops):'',
      (r.garden_owner&&r.garden_owner.name)?('Owner: '+r.garden_owner.name+(r.garden_owner.village?(' - '+r.garden_owner.village):'')):'',
      r.track_type?('Track: '+r.track_type):'',
      r.description?('Notes: '+r.description):''
    ].filter(String).join('\n');
    out.push('<Placemark><name>'+_xml(r.title||r.category_label||'(untitled)')+'</name>');
    out.push('<description>'+_xml(desc)+'</description>');
    if (r.map_type==='area' && pts.length>=3){
      var ring = pts.map(_fmLonLat); ring.push(_fmLonLat(pts[0]));
      out.push('<styleUrl>#ar</styleUrl><Polygon><outerBoundaryIs><LinearRing><coordinates>'+ring.join(' ')+'</coordinates></LinearRing></outerBoundaryIs></Polygon>');
    } else if (r.map_type==='line' && pts.length>=2){
      out.push('<styleUrl>#ln</styleUrl><LineString><coordinates>'+pts.map(_fmLonLat).join(' ')+'</coordinates></LineString>');
    } else {
      out.push('<styleUrl>#pt</styleUrl><Point><coordinates>'+_fmLonLat(pts[0])+'</coordinates></Point>');
    }
    out.push('</Placemark>');
  });
  out.push('</Document></kml>');
  return out.join('\n');
}
function _freemapGeoJson(recs){
  var ll=function(p){ return [ Number(p.lon!=null?p.lon:p.lng), Number(p.lat) ]; };
  var feats = [];
  recs.forEach(function(r){
    var pts=r.points||[]; if(!pts.length) return;
    var type, coords;
    if (r.map_type==='area' && pts.length>=3){ type='Polygon'; var ring=pts.map(ll); ring.push(ll(pts[0])); coords=[ring]; }
    else if (r.map_type==='line' && pts.length>=2){ type='LineString'; coords=pts.map(ll); }
    else { type='Point'; coords=ll(pts[0]); }
    feats.push({ type:'Feature', geometry:{ type:type, coordinates:coords }, properties:{
      title:r.title||'', category:r.category_label||r.category||'', map_type:r.map_type||'',
      steward:r._steward_name||'', steward_id:r._steward_id||'', zone:r._zone||'', clan:r.clan||'',
      date:_pngDate(r.recorded_at?new Date(r.recorded_at):new Date(),'yyyy-MM-dd'),
      measure:_fmMeasure(r), crops:r.crops||'', track_type:r.track_type||'', notes:r.description||''
    }});
  });
  return JSON.stringify({ type:'FeatureCollection', features:feats }, null, 1);
}
function freemapExportReport(){
  var recs = collectFreemap();
  var stamp = _pngDate(new Date(),'yyyy-MM-dd');
  var folder = getDataFolder();
  var out = getOrCreateFolder(stamp, getOrCreateFolder('field_maps', getOrCreateFolder('_reports', folder)));
  var kmlFile = out.createFile('MCA_FieldMaps_'+stamp+'.kml', _freemapKml(recs), 'application/vnd.google-earth.kml+xml');
  var gjFile  = out.createFile('MCA_FieldMaps_'+stamp+'.geojson', _freemapGeoJson(recs), 'application/json');
  var byType={}, byCat={}, byStew={};
  recs.forEach(function(r){
    var t=r.map_type||'point'; byType[t]=(byType[t]||0)+1;
    var c=r.category_label||r.category||'other'; byCat[c]=(byCat[c]||0)+1;
    var s=(r._steward_name||r._steward_id||'?'); byStew[s]=(byStew[s]||0)+1;
  });
  var rcp=loadRecipients(); var to=[];
  if (rcp.field_reports_to) to.push(rcp.field_reports_to);
  (rcp.comms||[]).forEach(function(e){ if(e) to.push(e); });
  if (!to.length) to=REPORT_EMAILS.slice();
  var seen={}; to=to.filter(function(e){ e=String(e).trim(); if(!e||seen[e]) return false; seen[e]=1; return true; });
  to.forEach(function(e){ try{ kmlFile.addViewer(e); }catch(_){} try{ gjFile.addViewer(e); }catch(_){} });
  var fmt=function(o){ return Object.keys(o).map(function(k){return k+': '+o[k];}).join(' · ') || '(none)'; };
  var lines=['MCA - Field maps export','', stamp+' (PNG time)','', recs.length+' mapped feature(s).','',
    'By kind: '+fmt(byType),
    'By category: '+fmt(byCat),
    'By mapper: '+fmt(byStew),'',
    'Open in Google Earth (KML): '+kmlFile.getUrl(),
    'Load into QGIS / database (GeoJSON): '+gjFile.getUrl()];
  to.forEach(function(e){ try{ MailApp.sendEmail(e,'MCA Field maps - '+stamp+' ('+recs.length+' features)', lines.join('\n')); }catch(_){} });
  Logger.log('Field maps export '+stamp+': '+recs.length+' features -> '+to.join(', '));
  return { status:'ok', features:recs.length, kml:kmlFile.getUrl(), geojson:gjFile.getUrl() };
}
function installFreemapExportTrigger(){
  ScriptApp.getProjectTriggers().forEach(function(t){ if(t.getHandlerFunction()==='freemapExportReport') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('freemapExportReport').timeBased().everyWeeks(1).onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).create();
  Logger.log('Weekly field-maps export trigger installed (Mondays ~7am PNG).');
}

/* ─── Turn on all the reports at once ───────────────────────────────────────
 * One call installs every reporting trigger so the data stops sitting idle and
 * starts arriving in inboxes on a schedule. Idempotent: each install*Trigger()
 * removes its own existing trigger first, so running this again just refreshes
 * them. Data feeds (prices, disturbances) are NOT touched here — install those
 * separately (installPricesTrigger / installDisturbanceFeedTrigger). */
/* ─── No-attendance verification digest ─────────────────────────────────
 * Safety net for the per-event alert: once a week, email the field-reports
 * lead every OPEN no-attendance event still in _verification_queue, so none
 * is forgotten even if an immediate alert was missed. Mark an item done by
 * setting "status":"closed" in its queue file (or deleting it). */
function verificationQueueReport() {
  var folder = getDataFolder();
  var open = [];
  var qFolders = folder.getFoldersByName('_verification_queue');
  if (qFolders.hasNext()) {
    var files = qFolders.next().getFiles();
    while (files.hasNext()) {
      var f = files.next();
      try { var t = JSON.parse(f.getBlob().getDataAsString()); if (t && t.status !== 'closed') open.push(t); } catch(e) {}
    }
  }
  var rcp = loadRecipients() || {};
  var to  = rcp.field_reports_to || (REPORT_EMAILS && REPORT_EMAILS[0]) || '';
  if (!to) { Logger.log('verificationQueueReport: no recipient set'); return { status:'ok', open: open.length, sent:false }; }
  if (open.length === 0) { Logger.log('verificationQueueReport: nothing open'); return { status:'ok', open:0, sent:false }; }

  open.sort(function(a,b){ return (b.queued_at||'').localeCompare(a.queued_at||''); });
  var L = ['Open no-attendance training events awaiting independent verification:', ''];
  open.forEach(function(t, i){
    L.push((i+1) + '. ' + (t.session_date_png || t.session_date || '') + ' — ' + (t.type ? t.type + ': ' : '') + (t.topic || '(no topic)'));
    L.push('   Trainer: ' + (t.trainer_name || '(unknown)') + ' · Zone: ' + (t.zone || t.zone_id || '') + ' · Location: ' + (t.location || '(none)'));
    L.push('   Reason given: ' + (t.reason || '(none)') + (t.notes ? ' — ' + t.notes : ''));
    L.push('   Venue photo: ' + (t.photo_when_png || '(no timestamp)') + (t.photo_on_session_date ? '' : ' ⚠ not on session date') + ' · ' + (t.map_link || '(no GPS)'));
    L.push('');
  });
  L.push('To close an item, set "status":"closed" in its file in the _verification_queue folder on Drive.');
  try { MailApp.sendEmail(to, 'MCA — no-attendance events to verify (' + open.length + ' open)', L.join('\n')); } catch(e) {}
  return { status:'ok', open: open.length, sent:true };
}
function installVerificationDigestTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t){ if (t.getHandlerFunction() === 'verificationQueueReport') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('verificationQueueReport').timeBased().everyWeeks(1).onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).create();
}

/* ─── Value-chain training-needs analysis ───────────────────────────────
 * Walks every uploaded record for value-chain audits (modules.vc_audit) and
 * builds the per-item training-needs ranking: each item scored on the SAME
 * basis (value/2, ignoring the critical double-weight so items compare), then
 * ranked by shortfall (1 − mean). Highest shortfall = first training priority.
 * Also a per-stage summary and the good/bad practice photo tally. Emails the
 * field-reports lead (or REPORT_EMAILS) and files a spreadsheet in Reports. ── */
function collectVcAudits() {
  var out = [];
  var root = getDataFolder();
  var zones = root.getFolders();
  while (zones.hasNext()) {
    var zf = zones.next();
    if (zf.getName().charAt(0) === '_') continue;            /* skip config/system folders */
    var stewards = zf.getFolders();
    while (stewards.hasNext()) {
      var sf = stewards.next();
      var files = sf.getFiles();
      while (files.hasNext()) {
        var f = files.next(); var nm = f.getName();
        if (nm.indexOf('MCA_') !== 0 || nm.slice(-5) !== '.json') continue;
        try {
          var body = JSON.parse(f.getBlob().getDataAsString());
          var arr = body && body.modules && body.modules.vc_audit;
          if (arr && arr.length) { for (var i=0;i<arr.length;i++) out.push(arr[i]); }
        } catch(e) {}
      }
    }
  }
  return out;
}

/* ─── Value-chain training-needs HTML report (live + auto) ───────────────
 * The report template (docs/reports/vc-training-report-template.html) is
 * embedded below as base64 and served live at ?action=vc_report, so the
 * monthly job can email a link to an always-current report that renders in a
 * browser. Photos are linked to their Drive originals, never re-stored.
 * Regenerate VC_REPORT_TPL_B64 when the template changes. ── */
var VC_REPORT_TPL_B64 = "PCFkb2N0eXBlIGh0bWw+CjwhLS0KICBNQ0FwcCDigJQgVmFsdWUgQ2hhaW4gQXVkaXQ6IFRyYWluaW5nIE5lZWRzIHJlcG9ydCAoVEVNUExBVEUsIGRhdGEtZHJpdmVuKQoKICBIT1cgSVQgSVMgRkVECiAgLS0tLS0tLS0tLS0tLQogIFRoZSBwYWdlIHJlbmRlcnMgZW50aXJlbHkgZnJvbSBvbmUgYXJyYXksIEFVRElUUywgaW4gdGhlIHNoYXBlIHRoZSBwaG9uZXMKICB1cGxvYWQgKG1vZHVsZXMudmNfYXVkaXQgcmVjb3JkcykuIFRvIHByb2R1Y2UgYSByZWFsIHJlcG9ydCwgcmVwbGFjZSB0aGUKICBgLypfX0FVRElUU19fKi8gW11gIHBsYWNlaG9sZGVyIGJlbG93IHdpdGggdGhlIGF1ZGl0IHJlY29yZHMgZm9yIHRoZSBwZXJpb2QuCiAgRWFjaCByZWNvcmQgbmVlZHM6IGNvbW1vZGl0eSwgY29tbW9kaXR5X25hbWUsIGNvbW1vZGl0eV9kcmFmdCwgbW9kdWxlX2NvZGUsCiAgbW9kdWxlX25hbWUsIGFzc2Vzc29yX2lkL25hbWUsIGFzc2Vzc29yX3pvbmVfaWQvem9uZSwgcmVjb3JkZWRfYXQsCiAgcmVzcG9uc2VzW3tjb2RlLGl0ZW0sY3JpdGljYWwsd2VpZ2h0LHJlc3BvbnNlLHZhbHVlfV0sIGFuZAogIHBob3Rvc1t7c3RhZ2Usc3RhZ2VfbmFtZSxpdGVtX2NvZGUscHJhY3RpY2U6J2dvb2QnfCdiYWQnLGNhcHRpb24sCiAgICAgICAgICB0aHVtYl91cmwsb3JpZ2luYWxfdXJsfV0uCgogIFBIT1RPUyAvIExJTktJTkcgVE8gT1JJR0lOQUxTCiAgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0KICBUaGUgcmVwb3J0IG5ldmVyIHJlLXN0b3JlcyBpbWFnZXMuIEZvciBlYWNoIGF1ZGl0IHBob3RvIHRoZSBiYWNrZW5kIHJlc29sdmVzCiAgdGhlIHJlY29yZCdzIHtfbWVkaWE6IjxmaWxlbmFtZT4ifSByZWZlcmVuY2UgdG8gdGhlIGZpbGUgaW4gdGhlIHN0ZXdhcmQncwogIERyaXZlIG1lZGlhLyBmb2xkZXIgYW5kIHNldHM6CiAgICBvcmlnaW5hbF91cmwgPSB0aGF0IGZpbGUncyBEcml2ZSBsaW5rICh3ZWJWaWV3TGluaykgICAtPiBvcGVuZWQgb24gY2xpY2sKICAgIHRodW1iX3VybCAgICA9IERyaXZlIHRodW1ibmFpbCBsaW5rLCBlLmcuIC4uLi90aHVtYm5haWw/aWQ9PElEPiZzej13MzIwCiAgKEluIHRoaXMgZGVtbyB0aHVtYl91cmwgaXMgb21pdHRlZCBhbmQgYSBwbGFjZWhvbGRlciB0aWxlIGlzIGRyYXduIGluc3RlYWQuKQoKICBUaGUgYW5hbHlzaXMgKHBlci1pdGVtIHNob3J0ZmFsbCByYW5raW5nLCBwZXItc3RhZ2UgbWVhbnMsIHBlci1jb21tb2RpdHkKICByb2xsdXBzKSBpcyBjb21wdXRlZCBpbi1wYWdlIGFuZCBtaXJyb3JzIHRoZSBiYWNrZW5kIHZjVHJhaW5pbmdOZWVkc1JlcG9ydCgpLgotLT4KCjxodG1sIGxhbmc9ImVuIj4KPGhlYWQ+CjxtZXRhIGNoYXJzZXQ9InV0Zi04Ij4KPG1ldGEgbmFtZT0idmlld3BvcnQiIGNvbnRlbnQ9IndpZHRoPWRldmljZS13aWR0aCwgaW5pdGlhbC1zY2FsZT0xIj4KPHRpdGxlPlZhbHVlIENoYWluIFRyYWluaW5nIE5lZWRzPC90aXRsZT4KPG1ldGEgbmFtZT0iZGVzY3JpcHRpb24iIGNvbnRlbnQ9IlRyYWluaW5nLW5lZWRzIGFuYWx5c2lzIGJ1aWx0IGZyb20gTUNBcHAgdmFsdWUtY2hhaW4gYXVkaXRzIOKAlCByYW5rZWQgYnkgd2hlcmUgcHJhY3RpY2UgaXMgd2Vha2VzdCwgd2l0aCBnb29kL2JhZCBwcmFjdGljZSBwaG90b3MgbGlua2VkIHRvIHRoZWlyIG9yaWdpbmFscy4iPgo8bGluayByZWw9InN0eWxlc2hlZXQiIGhyZWY9Imh0dHBzOi8vZm9udHMuZ29vZ2xlYXBpcy5jb20vY3NzMj9mYW1pbHk9U291cmNlK1NlcmlmKzQ6b3Bzeix3Z2h0QDguLjYwLDUwMDs4Li42MCw2MDA7OC4uNjAsNzAwJmZhbWlseT1JQk0rUGxleCtTYW5zOndnaHRANDAwOzUwMDs2MDA7NzAwJmZhbWlseT1JQk0rUGxleCtNb25vOndnaHRANTAwOzYwMCZkaXNwbGF5PXN3YXAiPgo8c3R5bGU+CiAgOnJvb3R7CiAgICAtLWJnOiNlY2VlZTk7IC0tcGFnZTojZmZmZmZmOyAtLXBhbmVsOiNmNWY2ZjI7IC0tcGFuZWwyOiNlZWYyZWM7CiAgICAtLWluazojMWEyMTFjOyAtLW11dGVkOiM1YzY2NWU7IC0tZmFpbnQ6IzhiOTU4YzsKICAgIC0tcnVsZTojZGRlMmQ4OyAtLXJ1bGUtYm9sZDojYjljMWI3OwogICAgLS1mb3Jlc3Q6IzI0NWEyYjsgLS1mb3Jlc3QtaW5rOiMxNjNkMWI7IC0tZm9yZXN0LXNvZnQ6I2U3ZjBlNjsKICAgIC0tZ29vZDojMmU3ZDMyOyAtLWdvb2Qtc29mdDojZTdmMmU4OwogICAgLS1iYWQ6I2I0NDQwZTsgLS1iYWQtc29mdDojZjhlN2RjOyAtLWJhZC1pbms6IzhmMzUwOTsKICAgIC0td2FybjojYjQ1MzA5OyAtLXdhcm4tc29mdDojZmJmMGUxOwogICAgLS1jLXZhbjojMjQ1YTJiOyAtLWMtY29mOiM4YTVhMmI7IC0tYy1jb2M6IzZhM2ZhMDsKICAgIC0tc2VyaWY6J1NvdXJjZSBTZXJpZiA0JyxHZW9yZ2lhLHNlcmlmOwogICAgLS1zYW5zOidJQk0gUGxleCBTYW5zJyxzeXN0ZW0tdWksc2Fucy1zZXJpZjsKICAgIC0tbW9ubzonSUJNIFBsZXggTW9ubycsdWktbW9ub3NwYWNlLG1vbm9zcGFjZTsKICB9CiAgQG1lZGlhIChwcmVmZXJzLWNvbG9yLXNjaGVtZTpkYXJrKXs6cm9vdDpub3QoW2RhdGEtdGhlbWU9ImxpZ2h0Il0pewogICAgLS1iZzojMGYxMzEwOyAtLXBhZ2U6IzE2MWIxNzsgLS1wYW5lbDojMWUyNDFmOyAtLXBhbmVsMjojMjMyYTI0OwogICAgLS1pbms6I2U3ZWNlNzsgLS1tdXRlZDojYTNhZGE1OyAtLWZhaW50OiM3YTg0N2I7CiAgICAtLXJ1bGU6IzJiMzMyZDsgLS1ydWxlLWJvbGQ6IzNiNDQzZDsKICAgIC0tZm9yZXN0OiM2YmJmNzI7IC0tZm9yZXN0LWluazojOGZkMTk2OyAtLWZvcmVzdC1zb2Z0OiMxYjJhMWU7CiAgICAtLWdvb2Q6IzY3YjU2ZDsgLS1nb29kLXNvZnQ6IzFiMmExZTsKICAgIC0tYmFkOiNlNzhhNTI7IC0tYmFkLXNvZnQ6IzJmMjAxNjsgLS1iYWQtaW5rOiNmMGExNzY7CiAgICAtLXdhcm46I2UwYTM1YzsgLS13YXJuLXNvZnQ6IzJkMjExNDsKICAgIC0tYy12YW46IzZiYmY3MjsgLS1jLWNvZjojY2E5YTVlOyAtLWMtY29jOiNiODlhZTA7CiAgICBjb2xvci1zY2hlbWU6ZGFyazsKICB9fQogIDpyb290W2RhdGEtdGhlbWU9ImRhcmsiXXsKICAgIC0tYmc6IzBmMTMxMDsgLS1wYWdlOiMxNjFiMTc7IC0tcGFuZWw6IzFlMjQxZjsgLS1wYW5lbDI6IzIzMmEyNDsKICAgIC0taW5rOiNlN2VjZTc7IC0tbXV0ZWQ6I2EzYWRhNTsgLS1mYWludDojN2E4NDdiOwogICAgLS1ydWxlOiMyYjMzMmQ7IC0tcnVsZS1ib2xkOiMzYjQ0M2Q7CiAgICAtLWZvcmVzdDojNmJiZjcyOyAtLWZvcmVzdC1pbms6IzhmZDE5NjsgLS1mb3Jlc3Qtc29mdDojMWIyYTFlOwogICAgLS1nb29kOiM2N2I1NmQ7IC0tZ29vZC1zb2Z0OiMxYjJhMWU7CiAgICAtLWJhZDojZTc4YTUyOyAtLWJhZC1zb2Z0OiMyZjIwMTY7IC0tYmFkLWluazojZjBhMTc2OwogICAgLS13YXJuOiNlMGEzNWM7IC0td2Fybi1zb2Z0OiMyZDIxMTQ7CiAgICAtLWMtdmFuOiM2YmJmNzI7IC0tYy1jb2Y6I2NhOWE1ZTsgLS1jLWNvYzojYjg5YWUwOwogICAgY29sb3Itc2NoZW1lOmRhcms7CiAgfQogICp7Ym94LXNpemluZzpib3JkZXItYm94fQogIGJvZHl7YmFja2dyb3VuZDp2YXIoLS1iZyk7Y29sb3I6dmFyKC0taW5rKTtmb250LWZhbWlseTp2YXIoLS1zYW5zKTtsaW5lLWhlaWdodDoxLjU7bWFyZ2luOjA7LXdlYmtpdC1mb250LXNtb290aGluZzphbnRpYWxpYXNlZH0KICAucGFnZXttYXgtd2lkdGg6MTAwMHB4O21hcmdpbjoyNHB4IGF1dG87YmFja2dyb3VuZDp2YXIoLS1wYWdlKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLXJ1bGUpO2JvcmRlci1yYWRpdXM6NnB4O2JveC1zaGFkb3c6MCAycHggMThweCByZ2JhKDAsMCwwLC4wOSk7cGFkZGluZzpjbGFtcCgyMHB4LDR2dyw0NHB4KX0KICBAbWVkaWEgKG1heC13aWR0aDo1NjBweCl7IC5wYWdle21hcmdpbjoxMHB4O3BhZGRpbmc6MTZweH0gfQogIC5tYXN0e2JvcmRlci1ib3R0b206M3B4IGRvdWJsZSB2YXIoLS1ydWxlLWJvbGQpO3BhZGRpbmctYm90dG9tOjE4cHg7bWFyZ2luLWJvdHRvbToyMnB4fQogIC5leWVicm93e2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2ZvbnQtc2l6ZTouN3JlbTtsZXR0ZXItc3BhY2luZzouMThlbTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7Y29sb3I6dmFyKC0tZm9yZXN0KTttYXJnaW46MCAwIDhweH0KICBoMXtmb250LWZhbWlseTp2YXIoLS1zZXJpZik7Zm9udC13ZWlnaHQ6NzAwO2ZvbnQtc2l6ZTpjbGFtcCgxLjdyZW0sNHZ3LDIuM3JlbSk7bGluZS1oZWlnaHQ6MS4wODttYXJnaW46MDtsZXR0ZXItc3BhY2luZzotLjAxNWVtO3RleHQtd3JhcDpiYWxhbmNlfQogIC5zdWJ7Zm9udC1mYW1pbHk6dmFyKC0tc2VyaWYpO2ZvbnQtc2l6ZToxLjA1cmVtO2NvbG9yOnZhcigtLW11dGVkKTttYXJnaW4tdG9wOjZweH0KICAubWV0YXtkaXNwbGF5OmZsZXg7ZmxleC13cmFwOndyYXA7Z2FwOjRweCAxOHB4O21hcmdpbi10b3A6MTJweDtmb250LXNpemU6LjgycmVtO2NvbG9yOnZhcigtLW11dGVkKX0KICAubWV0YSBie2NvbG9yOnZhcigtLWluayk7Zm9udC13ZWlnaHQ6NjAwfQogIC5rcGlze2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDUsMWZyKTtnYXA6MTBweDttYXJnaW46MjJweCAwIDZweH0KICBAbWVkaWEgKG1heC13aWR0aDo2NDBweCl7IC5rcGlze2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoMiwxZnIpfSB9CiAgLmtwaXtiYWNrZ3JvdW5kOnZhcigtLXBhbmVsKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLXJ1bGUpO2JvcmRlci1yYWRpdXM6OXB4O3BhZGRpbmc6MTNweCAxNHB4fQogIC5rcGkgLnZ7Zm9udC1mYW1pbHk6dmFyKC0tbW9ubyk7Zm9udC1zaXplOjEuNTVyZW07Zm9udC13ZWlnaHQ6NzAwO2NvbG9yOnZhcigtLWZvcmVzdC1pbmspO2xpbmUtaGVpZ2h0OjF9CiAgLmtwaSAubHtmb250LXNpemU6LjcycmVtO2NvbG9yOnZhcigtLW11dGVkKTttYXJnaW4tdG9wOjZweH0KICBoMntmb250LWZhbWlseTp2YXIoLS1zZXJpZik7Zm9udC1zaXplOjEuMzVyZW07Zm9udC13ZWlnaHQ6NzAwO21hcmdpbjozNHB4IDAgNHB4O2xldHRlci1zcGFjaW5nOi0uMDFlbTtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDoxMHB4O2ZsZXgtd3JhcDp3cmFwfQogIGgze2ZvbnQtZmFtaWx5OnZhcigtLXNhbnMpO2ZvbnQtc2l6ZTouNzhyZW07Zm9udC13ZWlnaHQ6NzAwO3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtsZXR0ZXItc3BhY2luZzouMDdlbTtjb2xvcjp2YXIoLS1tdXRlZCk7bWFyZ2luOjIwcHggMCA4cHh9CiAgLmRyYWZ0e2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2ZvbnQtc2l6ZTouNjJyZW07Zm9udC13ZWlnaHQ6NzAwO2xldHRlci1zcGFjaW5nOi4wOGVtO3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtiYWNrZ3JvdW5kOnZhcigtLXdhcm4tc29mdCk7Y29sb3I6dmFyKC0td2Fybik7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS13YXJuKTtib3JkZXItcmFkaXVzOjk5OXB4O3BhZGRpbmc6MnB4IDlweH0KICAuY21ldGF7Zm9udC1zaXplOi44MnJlbTtjb2xvcjp2YXIoLS1tdXRlZCk7bWFyZ2luOjJweCAwIDB9CiAgLmNtZXRhIC5jaGlwe2Rpc3BsYXk6aW5saW5lLWJsb2NrO2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2ZvbnQtc2l6ZTouNzRyZW07Y29sb3I6dmFyKC0tZm9yZXN0LWluayk7YmFja2dyb3VuZDp2YXIoLS1mb3Jlc3Qtc29mdCk7Ym9yZGVyLXJhZGl1czo2cHg7cGFkZGluZzoxcHggOHB4O21hcmdpbi1yaWdodDo2cHh9CiAgdGFibGV7Ym9yZGVyLWNvbGxhcHNlOmNvbGxhcHNlO3dpZHRoOjEwMCU7Zm9udC1zaXplOi44NnJlbTttYXJnaW4tdG9wOjZweH0KICB0aCx0ZHtwYWRkaW5nOjdweCAxMHB4O3RleHQtYWxpZ246bGVmdDtib3JkZXItYm90dG9tOjFweCBzb2xpZCB2YXIoLS1ydWxlKTt2ZXJ0aWNhbC1hbGlnbjptaWRkbGV9CiAgdGh7Zm9udC1zaXplOi42N3JlbTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7bGV0dGVyLXNwYWNpbmc6LjA1ZW07Y29sb3I6dmFyKC0tZmFpbnQpO2ZvbnQtd2VpZ2h0OjYwMH0KICB0ZC5uLHRoLm57dGV4dC1hbGlnbjpyaWdodDtmb250LWZhbWlseTp2YXIoLS1tb25vKTtmb250LXZhcmlhbnQtbnVtZXJpYzp0YWJ1bGFyLW51bXN9CiAgLnJhbmt7Zm9udC1mYW1pbHk6dmFyKC0tbW9ubyk7Zm9udC13ZWlnaHQ6NzAwO2NvbG9yOnZhcigtLWZvcmVzdC1pbmspfQogIC5jcml0e2ZvbnQtc2l6ZTouNThyZW07Zm9udC13ZWlnaHQ6NzAwO2NvbG9yOnZhcigtLWJhZC1pbmspO2JhY2tncm91bmQ6dmFyKC0tYmFkLXNvZnQpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tYmFkKTtib3JkZXItcmFkaXVzOjk5OXB4O3BhZGRpbmc6MXB4IDZweDt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7bWFyZ2luLWxlZnQ6NXB4fQogIC5zZntkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo4cHg7bWluLXdpZHRoOjEyMHB4fQogIC5zZi1iYXJ7ZmxleDoxO2hlaWdodDo4cHg7Ym9yZGVyLXJhZGl1czo5OTlweDtiYWNrZ3JvdW5kOnZhcigtLXBhbmVsMik7b3ZlcmZsb3c6aGlkZGVufQogIC5zZi1maWxse2hlaWdodDoxMDAlO2JvcmRlci1yYWRpdXM6OTk5cHh9CiAgLnNmLXZ7Zm9udC1mYW1pbHk6dmFyKC0tbW9ubyk7Zm9udC1zaXplOi43OHJlbTt3aWR0aDozNHB4O3RleHQtYWxpZ246cmlnaHR9CiAgLnlwbntmb250LWZhbWlseTp2YXIoLS1tb25vKTtmb250LXNpemU6Ljc0cmVtO2NvbG9yOnZhcigtLW11dGVkKTt3aGl0ZS1zcGFjZTpub3dyYXB9CiAgLnlwbiAueXtjb2xvcjp2YXIoLS1nb29kKX0gLnlwbiAucHtjb2xvcjp2YXIoLS13YXJuKX0gLnlwbiAubm97Y29sb3I6dmFyKC0tYmFkKX0KICAuc3RhZ2Vze2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KGF1dG8tZmlsbCxtaW5tYXgoMTUwcHgsMWZyKSk7Z2FwOjhweDttYXJnaW4tdG9wOjhweH0KICAuc3R7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1ydWxlKTtib3JkZXItcmFkaXVzOjhweDtwYWRkaW5nOjlweCAxMXB4O2JhY2tncm91bmQ6dmFyKC0tcGFuZWwpfQogIC5zdCAuc2N7Zm9udC1mYW1pbHk6dmFyKC0tbW9ubyk7Zm9udC1zaXplOjEuMjVyZW07Zm9udC13ZWlnaHQ6NzAwO2xpbmUtaGVpZ2h0OjF9CiAgLnN0IC5ubXtmb250LXNpemU6Ljc0cmVtO2NvbG9yOnZhcigtLW11dGVkKTttYXJnaW4tdG9wOjNweDtsaW5lLWhlaWdodDoxLjI1fQogIC5zdCAuZXh7Zm9udC1zaXplOi42NnJlbTtjb2xvcjp2YXIoLS1mYWludCk7bWFyZ2luLXRvcDo1cHg7Zm9udC1mYW1pbHk6dmFyKC0tbW9ubyl9CiAgLmdhbGxlcnl7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoYXV0by1maWxsLG1pbm1heCgxNjhweCwxZnIpKTtnYXA6MTJweDttYXJnaW4tdG9wOjEwcHh9CiAgLnNob3R7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1ydWxlLWJvbGQpO2JvcmRlci1yYWRpdXM6OXB4O292ZXJmbG93OmhpZGRlbjtiYWNrZ3JvdW5kOnZhcigtLXBhbmVsKTt0ZXh0LWRlY29yYXRpb246bm9uZTtjb2xvcjppbmhlcml0O2Rpc3BsYXk6YmxvY2s7dHJhbnNpdGlvbjp0cmFuc2Zvcm0gLjA4cyBlYXNlLCBib3gtc2hhZG93IC4wOHMgZWFzZX0KICAuc2hvdDpob3Zlcnt0cmFuc2Zvcm06dHJhbnNsYXRlWSgtMnB4KTtib3gtc2hhZG93OjAgNHB4IDE0cHggcmdiYSgwLDAsMCwuMTQpfQogIC5zaG90IGltZ3tkaXNwbGF5OmJsb2NrO3dpZHRoOjEwMCU7YXNwZWN0LXJhdGlvOjQvMztvYmplY3QtZml0OmNvdmVyO2JhY2tncm91bmQ6dmFyKC0tcGFuZWwyKX0KICAuc2hvdCAuY2Fwe3BhZGRpbmc6OHB4IDEwcHh9CiAgLnNob3QgLnBye2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2ZvbnQtc2l6ZTouNnJlbTtmb250LXdlaWdodDo3MDA7bGV0dGVyLXNwYWNpbmc6LjA2ZW07dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO2JvcmRlci1yYWRpdXM6OTk5cHg7cGFkZGluZzoxcHggN3B4fQogIC5zaG90IC5wci5nb29ke2JhY2tncm91bmQ6dmFyKC0tZ29vZC1zb2Z0KTtjb2xvcjp2YXIoLS1nb29kKX0KICAuc2hvdCAucHIuYmFke2JhY2tncm91bmQ6dmFyKC0tYmFkLXNvZnQpO2NvbG9yOnZhcigtLWJhZC1pbmspfQogIC5zaG90IC5jdHtmb250LXNpemU6Ljc4cmVtO21hcmdpbjo1cHggMCAycHg7bGluZS1oZWlnaHQ6MS4yNX0KICAuc2hvdCAubXR7Zm9udC1zaXplOi42OHJlbTtjb2xvcjp2YXIoLS1mYWludCk7Zm9udC1mYW1pbHk6dmFyKC0tbW9ubyk7ZGlzcGxheTpmbGV4O2p1c3RpZnktY29udGVudDpzcGFjZS1iZXR3ZWVuO2dhcDo2cHg7YWxpZ24taXRlbXM6Y2VudGVyfQogIC5zaG90IC5vcGVue2NvbG9yOnZhcigtLWZvcmVzdCl9CiAgLm5vdGV7Zm9udC1zaXplOi44MnJlbTtjb2xvcjp2YXIoLS1tdXRlZCk7YmFja2dyb3VuZDp2YXIoLS1wYW5lbCk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1ydWxlKTtib3JkZXItbGVmdDozcHggc29saWQgdmFyKC0tZm9yZXN0KTtib3JkZXItcmFkaXVzOjZweDtwYWRkaW5nOjExcHggMTRweDttYXJnaW4tdG9wOjE0cHh9CiAgLmZvb3R7bWFyZ2luLXRvcDozMHB4O3BhZGRpbmctdG9wOjE0cHg7Ym9yZGVyLXRvcDoxcHggc29saWQgdmFyKC0tcnVsZSk7Zm9udC1zaXplOi43OHJlbTtjb2xvcjp2YXIoLS1mYWludCk7ZGlzcGxheTpmbGV4O2p1c3RpZnktY29udGVudDpzcGFjZS1iZXR3ZWVuO2ZsZXgtd3JhcDp3cmFwO2dhcDo4cHh9CiAgLmNvbnRyb2xze2Rpc3BsYXk6ZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6MTJweCAxOHB4O2FsaWduLWl0ZW1zOmNlbnRlcjtqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2VlbjtiYWNrZ3JvdW5kOnZhcigtLXBhbmVsKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLXJ1bGUpO2JvcmRlci1yYWRpdXM6MTBweDtwYWRkaW5nOjExcHggMTRweDttYXJnaW46MjBweCAwIDRweH0KICAuY29udHJvbHMgLnByZXNldHN7ZGlzcGxheTpmbGV4O2dhcDo2cHg7ZmxleC13cmFwOndyYXB9CiAgLmNvbnRyb2xzIC5wcmVzZXRzIGJ1dHRvbntmb250LWZhbWlseTp2YXIoLS1zYW5zKTtmb250LXNpemU6Ljc4cmVtO2ZvbnQtd2VpZ2h0OjYwMDtib3JkZXI6MXB4IHNvbGlkIHZhcigtLXJ1bGUtYm9sZCk7YmFja2dyb3VuZDp2YXIoLS1wYWdlKTtjb2xvcjp2YXIoLS1tdXRlZCk7Ym9yZGVyLXJhZGl1czo5OTlweDtwYWRkaW5nOjVweCAxM3B4O2N1cnNvcjpwb2ludGVyfQogIC5jb250cm9scyAucHJlc2V0cyBidXR0b24ub257YmFja2dyb3VuZDp2YXIoLS1mb3Jlc3QpO2NvbG9yOiNmZmY7Ym9yZGVyLWNvbG9yOnZhcigtLWZvcmVzdCl9CiAgLmNvbnRyb2xzIC5yYW5nZXtkaXNwbGF5OmZsZXg7Z2FwOjEycHg7ZmxleC13cmFwOndyYXA7Zm9udC1zaXplOi43NnJlbTtjb2xvcjp2YXIoLS1tdXRlZCl9CiAgLmNvbnRyb2xzIC5yYW5nZSBsYWJlbHtkaXNwbGF5OmZsZXg7Z2FwOjZweDthbGlnbi1pdGVtczpjZW50ZXJ9CiAgLmNvbnRyb2xzIC5yYW5nZSBpbnB1dHtmb250LWZhbWlseTp2YXIoLS1tb25vKTtmb250LXNpemU6Ljc2cmVtO2JvcmRlcjoxcHggc29saWQgdmFyKC0tcnVsZS1ib2xkKTtib3JkZXItcmFkaXVzOjdweDtwYWRkaW5nOjRweCA3cHg7YmFja2dyb3VuZDp2YXIoLS1wYWdlKTtjb2xvcjp2YXIoLS1pbmspfQogIC5jaGFydHdyYXB7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1ydWxlKTtib3JkZXItcmFkaXVzOjEwcHg7cGFkZGluZzoxMHB4IDZweCAycHg7YmFja2dyb3VuZDp2YXIoLS1wYW5lbCk7bWFyZ2luLXRvcDo0cHh9CiAgLmNoYXJ0d3JhcCBzdmd7d2lkdGg6MTAwJTtoZWlnaHQ6YXV0bztkaXNwbGF5OmJsb2NrfQogIC5sZWdlbmR7ZGlzcGxheTpmbGV4O2ZsZXgtd3JhcDp3cmFwO2dhcDoxNHB4O2FsaWduLWl0ZW1zOmNlbnRlcjttYXJnaW46OHB4IDJweCAycHg7Zm9udC1zaXplOi43OHJlbTtjb2xvcjp2YXIoLS1tdXRlZCl9CiAgLmxlZ2VuZCAubGd7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4fQogIC5sZWdlbmQgLmRvdHt3aWR0aDoxMXB4O2hlaWdodDoxMXB4O2JvcmRlci1yYWRpdXM6M3B4O2Rpc3BsYXk6aW5saW5lLWJsb2NrfQogIC5sZWdlbmQgLmxnLW5vdGV7Zm9udC1zaXplOi43MnJlbTtjb2xvcjp2YXIoLS1mYWludCk7bWFyZ2luLWxlZnQ6YXV0b30KICB0aC50Yyx0ZC50Y3t0ZXh0LWFsaWduOmNlbnRlcjt3aWR0aDo0NnB4fQogIC50cntmb250LXNpemU6LjlyZW07Zm9udC13ZWlnaHQ6NzAwfQogIC50ci51cHtjb2xvcjp2YXIoLS1nb29kKX0gLnRyLmRvd257Y29sb3I6dmFyKC0tYmFkKX0gLnRyLmZsYXR7Y29sb3I6dmFyKC0tZmFpbnQpfSAudHIubm9uZXtjb2xvcjp2YXIoLS1ydWxlLWJvbGQpfQogIHRhYmxlLnRoZW1lIHRke3ZlcnRpY2FsLWFsaWduOm1pZGRsZX0KICAuY2Mtd3JhcHtkaXNwbGF5OmZsZXg7ZmxleC13cmFwOndyYXA7Z2FwOjZweCAxMnB4fQogIC5jY3tkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NXB4O2ZvbnQtc2l6ZTouNzhyZW07Y29sb3I6dmFyKC0tbXV0ZWQpO3doaXRlLXNwYWNlOm5vd3JhcH0KICAuY2MgLmNjZHt3aWR0aDo5cHg7aGVpZ2h0OjlweDtib3JkZXItcmFkaXVzOjJweDtkaXNwbGF5OmlubGluZS1ibG9ja30KICAuc2hhcmVke2ZvbnQtc2l6ZTouNThyZW07Zm9udC13ZWlnaHQ6NzAwO3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtsZXR0ZXItc3BhY2luZzouMDVlbTtjb2xvcjp2YXIoLS13YXJuKTtiYWNrZ3JvdW5kOnZhcigtLXdhcm4tc29mdCk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS13YXJuKTtib3JkZXItcmFkaXVzOjk5OXB4O3BhZGRpbmc6MXB4IDdweDttYXJnaW4tbGVmdDo0cHg7dmVydGljYWwtYWxpZ246bWlkZGxlfQogIC5jYyAuY2Nke3dpZHRoOjlweDtoZWlnaHQ6OXB4O2JvcmRlci1yYWRpdXM6MnB4O2Rpc3BsYXk6aW5saW5lLWJsb2NrfQogIC5oZy1zY3JvbGx7b3ZlcmZsb3cteDphdXRvfQogIC5oZWF0Z3JpZHtkaXNwbGF5OmdyaWQ7Z2FwOjRweDttaW4td2lkdGg6NDIwcHg7bWFyZ2luLXRvcDo0cHh9CiAgLmhnLXRoe30KICAuaGctY2h7Zm9udC1zaXplOi43MnJlbTtmb250LXdlaWdodDo2MDA7Y29sb3I6dmFyKC0tbXV0ZWQpO3RleHQtYWxpZ246Y2VudGVyO3BhZGRpbmc6NHB4IDJweDtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2p1c3RpZnktY29udGVudDpjZW50ZXI7Z2FwOjVweH0KICAuaGctY2guYWxse2NvbG9yOnZhcigtLWluayl9CiAgLmhnLWNoIC5jY2R7d2lkdGg6OXB4O2hlaWdodDo5cHg7Ym9yZGVyLXJhZGl1czoycHg7ZGlzcGxheTppbmxpbmUtYmxvY2t9CiAgLmhnLWxibHtmb250LXNpemU6LjgycmVtO2ZvbnQtd2VpZ2h0OjYwMDtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo2cHg7ZmxleC13cmFwOndyYXA7cGFkZGluZy1yaWdodDo4cHh9CiAgLmhnLWxibCAuaGctb2Jze2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2ZvbnQtc2l6ZTouNjRyZW07Y29sb3I6dmFyKC0tZmFpbnQpO2ZvbnQtd2VpZ2h0OjQwMDt3aWR0aDoxMDAlfQogIC5oZy1jZWxse2JvcmRlci1yYWRpdXM6N3B4O21pbi1oZWlnaHQ6NDZweDtkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2FsaWduLWl0ZW1zOmNlbnRlcjtqdXN0aWZ5LWNvbnRlbnQ6Y2VudGVyO2NvbG9yOiNmZmY7bGluZS1oZWlnaHQ6MX0KICAuaGctY2VsbCAuaGctdntmb250LWZhbWlseTp2YXIoLS1tb25vKTtmb250LXNpemU6MXJlbTtmb250LXdlaWdodDo3MDB9CiAgLmhnLWNlbGwgLmhnLW57Zm9udC1mYW1pbHk6dmFyKC0tbW9ubyk7Zm9udC1zaXplOi42cmVtO29wYWNpdHk6Ljg1O21hcmdpbi10b3A6MnB4fQogIC5oZy1jZWxsLmVtcHR5e2JhY2tncm91bmQ6dmFyKC0tcGFuZWwyKTtjb2xvcjp2YXIoLS1mYWludCk7Zm9udC1mYW1pbHk6dmFyKC0tbW9ubyl9CiAgLmhnLWxlZ2VuZHtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo4cHg7bWFyZ2luLXRvcDoxMHB4O2ZvbnQtc2l6ZTouNzRyZW07Y29sb3I6dmFyKC0tbXV0ZWQpfQogIC5oZy1zY2FsZXt3aWR0aDoxMjBweDtoZWlnaHQ6OXB4O2JvcmRlci1yYWRpdXM6OTk5cHg7YmFja2dyb3VuZDpsaW5lYXItZ3JhZGllbnQoOTBkZWcscmdiKDE3OCw1MiwzOCkscmdiKDIwMSwxMjQsMjYpLHJnYigxMjIsMTYwLDYzKSxyZ2IoNDIsMTE2LDQ3KSl9CiAgLmhnLWxub3Rle2NvbG9yOnZhcigtLWZhaW50KTttYXJnaW4tbGVmdDphdXRvfQogIC5zZWd7ZGlzcGxheTpmbGV4O2dhcDo2cHg7ZmxleC13cmFwOndyYXA7bWFyZ2luOjE0cHggMCAycHh9CiAgLnNlZyBidXR0b257Zm9udC1mYW1pbHk6dmFyKC0tc2Fucyk7Zm9udC1zaXplOi44cmVtO2ZvbnQtd2VpZ2h0OjYwMDtib3JkZXI6MXB4IHNvbGlkIHZhcigtLXJ1bGUtYm9sZCk7YmFja2dyb3VuZDp2YXIoLS1wYWdlKTtjb2xvcjp2YXIoLS1tdXRlZCk7Ym9yZGVyLXJhZGl1czo5OTlweDtwYWRkaW5nOjVweCAxNHB4O2N1cnNvcjpwb2ludGVyfQogIC5zZWcgYnV0dG9uLm9ue2JhY2tncm91bmQ6dmFyKC0tZm9yZXN0KTtjb2xvcjojZmZmO2JvcmRlci1jb2xvcjp2YXIoLS1mb3Jlc3QpfQogIEBtZWRpYSBwcmludHsgYm9keXtiYWNrZ3JvdW5kOiNmZmZ9IC5wYWdle2JveC1zaGFkb3c6bm9uZTtib3JkZXI6bm9uZTttYXJnaW46MDttYXgtd2lkdGg6bm9uZX0gLnNob3Q6aG92ZXJ7dHJhbnNmb3JtOm5vbmU7Ym94LXNoYWRvdzpub25lfSAuc2Vne2Rpc3BsYXk6bm9uZX0gLnRvb2xiYXJ7ZGlzcGxheTpub25lfSB9CiAgQHBhZ2V7c2l6ZTpBNDttYXJnaW46MTRtbX0KICAudG9vbGJhcnttYXgtd2lkdGg6MTAwMHB4O21hcmdpbjoxNHB4IGF1dG8gLThweDtkaXNwbGF5OmZsZXg7anVzdGlmeS1jb250ZW50OmZsZXgtZW5kO2dhcDo4cHg7cGFkZGluZzowIDEwcHh9CiAgLnRvb2xiYXIgYnV0dG9ue2ZvbnQtZmFtaWx5OnZhcigtLXNhbnMpO2ZvbnQtc2l6ZTouNzhyZW07Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1ydWxlLWJvbGQpO2JhY2tncm91bmQ6dmFyKC0tcGFnZSk7Y29sb3I6dmFyKC0tbXV0ZWQpO2JvcmRlci1yYWRpdXM6N3B4O3BhZGRpbmc6NnB4IDEycHg7Y3Vyc29yOnBvaW50ZXJ9Cjwvc3R5bGU+CjwvaGVhZD4KPGJvZHk+CjxkaXYgY2xhc3M9InRvb2xiYXIiPjxidXR0b24gb25jbGljaz0id2luZG93LnByaW50KCkiPlByaW50IC8gU2F2ZSBQREY8L2J1dHRvbj48L2Rpdj4KPGRpdiBjbGFzcz0icGFnZSIgaWQ9InBhZ2UiPjwvZGl2PgoKPHNjcmlwdD4KY29uc3QgQVVESVRTID0gLypfX0FVRElUU19fKi8gW107CgovKiAtLS0tIGhlbHBlcnMgLS0tLSAqLwpjb25zdCBDT01fT1JERVIgPSBbJ3ZhbmlsbGEnLCdjb2ZmZWUnLCdjb2NvYSddOwpjb25zdCBlc2MgPSBzID0+IFN0cmluZyhzPT1udWxsPycnOnMpLnJlcGxhY2UoL1smPD4iXS9nLGM9Pih7JyYnOicmYW1wOycsJzwnOicmbHQ7JywnPic6JyZndDsnLCciJzonJnF1b3Q7J31bY10pKTsKY29uc3QgcG5nRGF0ZSA9IGlzbyA9PiB7IGNvbnN0IGQ9bmV3IERhdGUoaXNvKTsgcmV0dXJuIGlzTmFOKGQpPycnOm5ldyBEYXRlKGQuZ2V0VGltZSgpKzEwKjM2MDAwMDApLnRvSVNPU3RyaW5nKCkuc2xpY2UoMCwxMCk7IH07CmNvbnN0IGZtdERhdGUgPSB5bWQgPT4geyBpZigheW1kKSByZXR1cm4gJyc7IGNvbnN0IFt5LG0sZGRdPXltZC5zcGxpdCgnLScpOyByZXR1cm4gZGQrJyAnK1snSmFuJywnRmViJywnTWFyJywnQXByJywnTWF5JywnSnVuJywnSnVsJywnQXVnJywnU2VwJywnT2N0JywnTm92JywnRGVjJ11bK20tMV0rJyAnK3k7IH07CmZ1bmN0aW9uIHNjb3JlQ29sb3Iodil7IC8qIHYgMC4uMSAqLyByZXR1cm4gdj49MC43NT8ndmFyKC0tZ29vZCknOnY+PTAuNT8ndmFyKC0td2FybiknOid2YXIoLS1iYWQpJzsgfQpmdW5jdGlvbiBfbGVycChhLGIsdCl7IHJldHVybiBNYXRoLnJvdW5kKGErKGItYSkqdCk7IH0KZnVuY3Rpb24gaGVhdENvbG9yKHYpeyAvKiBjb250aW51b3VzIHJlZOKGkmFtYmVy4oaSZ3JlZW4gZm9yIHRoZSBoZWF0IGdyaWQgKi8KICBpZih2PT1udWxsfHxpc05hTih2KSkgcmV0dXJuIG51bGw7CiAgY29uc3Qgc3RvcHM9W1swLFsxNzgsNTIsMzhdXSxbMC41LFsyMDEsMTI0LDI2XV0sWzAuNzUsWzEyMiwxNjAsNjNdXSxbMSxbNDIsMTE2LDQ3XV1dOwogIGxldCBjPXN0b3BzW3N0b3BzLmxlbmd0aC0xXVsxXTsKICBmb3IobGV0IGk9MDtpPHN0b3BzLmxlbmd0aC0xO2krKyl7IGlmKHY8PXN0b3BzW2krMV1bMF0peyBjb25zdCB0PSh2LXN0b3BzW2ldWzBdKS8oc3RvcHNbaSsxXVswXS1zdG9wc1tpXVswXSk7IGNvbnN0IEE9c3RvcHNbaV1bMV0sQj1zdG9wc1tpKzFdWzFdOyBjPVtfbGVycChBWzBdLEJbMF0sdCksX2xlcnAoQVsxXSxCWzFdLHQpLF9sZXJwKEFbMl0sQlsyXSx0KV07IGJyZWFrOyB9IH0KICByZXR1cm4gJ3JnYignK2NbMF0rJywnK2NbMV0rJywnK2NbMl0rJyknOwp9CgovKiAtLS0tIGFuYWx5c2lzIChzYW1lIGlucHV0cyB0aGUgcGhvbmVzIHVwbG9hZCkgLS0tLSAqLwpmdW5jdGlvbiBhbmFseXplKGF1ZGl0cyl7CiAgY29uc3QgYnlDb209e307CiAgbGV0IG1pbkQ9bnVsbCxtYXhEPW51bGw7IGNvbnN0IGFsbEF1ZGl0b3JzPW5ldyBTZXQoKTsgbGV0IHBob3RvTj0wOwogIGZvcihjb25zdCBhIG9mIGF1ZGl0cyl7CiAgICBjb25zdCBkPXBuZ0RhdGUoYS5yZWNvcmRlZF9hdCk7IGlmKGQpeyBpZighbWluRHx8ZDxtaW5EKW1pbkQ9ZDsgaWYoIW1heER8fGQ+bWF4RCltYXhEPWQ7IH0KICAgIGFsbEF1ZGl0b3JzLmFkZChhLmFzc2Vzc29yX2lkKTsKICAgIGNvbnN0IEMgPSBieUNvbVthLmNvbW1vZGl0eV0gfHwgKGJ5Q29tW2EuY29tbW9kaXR5XT17a2V5OmEuY29tbW9kaXR5LG5hbWU6YS5jb21tb2RpdHlfbmFtZSxkcmFmdDohIWEuY29tbW9kaXR5X2RyYWZ0LHZpc2l0czowLGl0ZW1zOnt9LHN0YWdlczp7fSxwaG90b3M6W10sYXVkaXRvcnM6bmV3IFNldCgpLHpvbmVzOm5ldyBTZXQoKX0pOwogICAgQy52aXNpdHMrKzsgQy5hdWRpdG9ycy5hZGQoYS5hc3Nlc3Nvcl9pZCk7IGlmKGEuYXNzZXNzb3Jfem9uZV9pZCkgQy56b25lcy5hZGQoYS5hc3Nlc3Nvcl96b25lX2lkKTsKICAgIGNvbnN0IHN0PUMuc3RhZ2VzW2EubW9kdWxlX2NvZGVdfHwoQy5zdGFnZXNbYS5tb2R1bGVfY29kZV09e2NvZGU6YS5tb2R1bGVfY29kZSxuYW1lOmEubW9kdWxlX25hbWUsbjowLHN1bTowLGNyaXRGYWlsOjAsdmlzaXRzOjB9KTsKICAgIHN0LnZpc2l0cysrOwogICAgZm9yKGNvbnN0IHIgb2YgKGEucmVzcG9uc2VzfHxbXSkpewogICAgICBpZihyLnZhbHVlPT1udWxsKSBjb250aW51ZTsKICAgICAgY29uc3Qgc2M9ci52YWx1ZS8yOwogICAgICBjb25zdCBpdD1DLml0ZW1zW3IuY29kZV18fChDLml0ZW1zW3IuY29kZV09e2NvZGU6ci5jb2RlLGl0ZW06ci5pdGVtLHN0YWdlOmEubW9kdWxlX2NvZGUsc3RhZ2VfbmFtZTphLm1vZHVsZV9uYW1lLGNyaXRpY2FsOiEhci5jcml0aWNhbCxuOjAsc3VtOjAseWVzOjAscGFydGlhbDowLG5vOjB9KTsKICAgICAgaXQubisrOyBpdC5zdW0rPXNjOyBpdFtyLnJlc3BvbnNlXT0oaXRbci5yZXNwb25zZV18fDApKzE7CiAgICAgIHN0Lm4rKzsgc3Quc3VtKz1zYzsgaWYoci5jcml0aWNhbCYmci5yZXNwb25zZT09PSdubycpIHN0LmNyaXRGYWlsKys7CiAgICB9CiAgICBmb3IoY29uc3QgcCBvZiAoYS5waG90b3N8fFtdKSl7IHBob3RvTisrOyBDLnBob3Rvcy5wdXNoKE9iamVjdC5hc3NpZ24oe30scCx7YXNzZXNzb3I6YS5hc3Nlc3Nvcl9uYW1lLGRhdGU6cG5nRGF0ZShhLnJlY29yZGVkX2F0KSxmYXJtZXJfdmlsbGFnZTphLmZhcm1lcl92aWxsYWdlfSkpOyB9CiAgfQogIGZvcihjb25zdCBrIGluIGJ5Q29tKXsgY29uc3QgQz1ieUNvbVtrXTsKICAgIEMuaXRlbUxpc3Q9T2JqZWN0LnZhbHVlcyhDLml0ZW1zKS5tYXAoaXQ9PntpdC5tZWFuPWl0Lm4/aXQuc3VtL2l0Lm46MDsgaXQuc2hvcnRmYWxsPTEtaXQubWVhbjsgcmV0dXJuIGl0O30pCiAgICAgIC5zb3J0KChhLGIpPT4gKGIuc2hvcnRmYWxsLWEuc2hvcnRmYWxsKSB8fCAoYi5uLWEubikpOwogICAgQy5zdGFnZUxpc3Q9T2JqZWN0LnZhbHVlcyhDLnN0YWdlcykubWFwKHM9PntzLm1lYW49cy5uP3Muc3VtL3MubjowOyByZXR1cm4gczt9KQogICAgICAuc29ydCgoYSxiKT0+IGEuY29kZS5sb2NhbGVDb21wYXJlKGIuY29kZSx1bmRlZmluZWQse251bWVyaWM6dHJ1ZX0pKTsKICAgIEMubWVhbiA9IEMuaXRlbUxpc3QubGVuZ3RoPyBDLml0ZW1MaXN0LnJlZHVjZSgoeCxpdCk9PngraXQubWVhbiwwKS9DLml0ZW1MaXN0Lmxlbmd0aCA6IDA7CiAgfQogIHJldHVybiB7YnlDb20sIG1pbkQsIG1heEQsIGF1ZGl0b3JzOmFsbEF1ZGl0b3JzLnNpemUsIHBob3RvTiwgdG90YWw6YXVkaXRzLmxlbmd0aH07Cn0KCi8qIC0tLS0gcGxhY2Vob2xkZXIgdGh1bWJuYWlsIChzdGFuZHMgaW4gZm9yIHRoZSByZWFsIERyaXZlIHBob3RvIGluIHRoaXMgZGVtbykgLS0tLSAqLwpmdW5jdGlvbiB0aHVtYihwcmFjdGljZSwgc3RhZ2VOYW1lLCBjYXB0aW9uKXsKICBjb25zdCBjPWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpOyBjLndpZHRoPTMyMDsgYy5oZWlnaHQ9MjQwOyBjb25zdCB4PWMuZ2V0Q29udGV4dCgnMmQnKTsKICBjb25zdCBnPXguY3JlYXRlTGluZWFyR3JhZGllbnQoMCwwLDAsMjQwKTsKICBpZihwcmFjdGljZT09PSdnb29kJyl7IGcuYWRkQ29sb3JTdG9wKDAsJyMzZjdkNDQnKTsgZy5hZGRDb2xvclN0b3AoMSwnIzFmNGEyNicpOyB9CiAgZWxzZSB7IGcuYWRkQ29sb3JTdG9wKDAsJyNiNDU1MWYnKTsgZy5hZGRDb2xvclN0b3AoMSwnIzdhMzQxMCcpOyB9CiAgeC5maWxsU3R5bGU9ZzsgeC5maWxsUmVjdCgwLDAsMzIwLDI0MCk7CiAgeC5nbG9iYWxBbHBoYT0uMTY7IHguZmlsbFN0eWxlPScjZmZmJzsKICBmb3IobGV0IGk9MDtpPDQwO2krKyl7IHguYmVnaW5QYXRoKCk7IHguYXJjKE1hdGgucmFuZG9tKCkqMzIwLE1hdGgucmFuZG9tKCkqMjQwLDQrTWF0aC5yYW5kb20oKSoyNiwwLDcpOyB4LmZpbGwoKTsgfQogIHguZ2xvYmFsQWxwaGE9MTsKICB4LmZpbGxTdHlsZT0ncmdiYSgwLDAsMCwuMjgpJzsgeC5maWxsUmVjdCgwLDE2OCwzMjAsNzIpOwogIHguZmlsbFN0eWxlPScjZmZmJzsgeC5mb250PSc2MDAgMTVweCAiSUJNIFBsZXggU2FucyIsc2Fucy1zZXJpZic7CiAgeC5maWxsVGV4dChzdGFnZU5hbWUubGVuZ3RoPjM0P3N0YWdlTmFtZS5zbGljZSgwLDMzKSsn4oCmJzpzdGFnZU5hbWUsIDE0LCAxOTIpOwogIHguZm9udD0nNDAwIDEycHggIklCTSBQbGV4IFNhbnMiLHNhbnMtc2VyaWYnOyB4LmZpbGxTdHlsZT0ncmdiYSgyNTUsMjU1LDI1NSwuODUpJzsKICB4LmZpbGxUZXh0KGNhcHRpb24ubGVuZ3RoPjQwP2NhcHRpb24uc2xpY2UoMCwzOSkrJ+KApic6Y2FwdGlvbiwgMTQsIDIxMik7CiAgeC5mb250PSdpdGFsaWMgMTBweCAiSUJNIFBsZXggU2FucyIsc2Fucy1zZXJpZic7IHguZmlsbFN0eWxlPSdyZ2JhKDI1NSwyNTUsMjU1LC42KSc7CiAgeC5maWxsVGV4dCgnc2FtcGxlIGltYWdlIOKAlCByZWFsIGNhcHR1cmUgb24gRHJpdmUnLCAxNCwgMjMwKTsKICByZXR1cm4gYy50b0RhdGFVUkwoJ2ltYWdlL2pwZWcnLDAuNzIpOwp9CgovKiAtLS0tIHJlbmRlciAtLS0tICovCi8qIC0tLS0gZGF0ZSBmaWx0ZXJpbmcgKGFsbCBkYXRhIGlzIGluIHRoZSBwYWdlLCBzbyBmaWx0ZXJpbmcgaXMgaW5zdGFudCkgLS0tLSAqLwpjb25zdCBTVEFURT17ZnJvbTonJyx0bzonJyxwcmVzZXQ6J2FsbCd9Owpjb25zdCBhdWRpdERhdGU9YT0+cG5nRGF0ZShhLnJlY29yZGVkX2F0KTsKY29uc3QgREFURVM9QVVESVRTLm1hcChhdWRpdERhdGUpLmZpbHRlcihCb29sZWFuKS5zb3J0KCk7CmNvbnN0IE1JTl9EPURBVEVTWzBdfHwnJywgTUFYX0Q9REFURVNbREFURVMubGVuZ3RoLTFdfHwnJzsKZnVuY3Rpb24gaW5SYW5nZShhKXsgY29uc3QgZD1hdWRpdERhdGUoYSk7IGlmKCFkKSByZXR1cm4gZmFsc2U7IGlmKFNUQVRFLmZyb20mJmQ8U1RBVEUuZnJvbSkgcmV0dXJuIGZhbHNlOyBpZihTVEFURS50byYmZD5TVEFURS50bykgcmV0dXJuIGZhbHNlOyByZXR1cm4gdHJ1ZTsgfQpmdW5jdGlvbiBjdXJyZW50QXVkaXRzKCl7IHJldHVybiBBVURJVFMuZmlsdGVyKGluUmFuZ2UpOyB9CmZ1bmN0aW9uIHNldFByZXNldChwKXsKICBTVEFURS5wcmVzZXQ9cDsgU1RBVEUudG89Jyc7CiAgaWYocD09PSdhbGwnKXsgU1RBVEUuZnJvbT0nJzsgfQogIGVsc2UgaWYocD09PSd5dGQnKXsgU1RBVEUuZnJvbT0oTUFYX0R8fCcnKS5zbGljZSgwLDQpKyctMDEtMDEnOyB9CiAgZWxzZSB7IGNvbnN0IG09eyczbSc6MywnNm0nOjYsJzEybSc6MTJ9W3BdfHwzOyBjb25zdCBkPW5ldyBEYXRlKChNQVhfRHx8bmV3IERhdGUoKS50b0lTT1N0cmluZygpLnNsaWNlKDAsMTApKSsnVDAwOjAwOjAwJyk7IGQuc2V0TW9udGgoZC5nZXRNb250aCgpLW0pOyBTVEFURS5mcm9tPWQudG9JU09TdHJpbmcoKS5zbGljZSgwLDEwKTsgfQogIHJlbmRlcigpOwp9CmZ1bmN0aW9uIHNldFJhbmdlKCl7IGNvbnN0IGY9ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2Zyb21EJyksIHQ9ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3RvRCcpOyBTVEFURS5mcm9tPWY/Zi52YWx1ZTonJzsgU1RBVEUudG89dD90LnZhbHVlOicnOyBTVEFURS5wcmVzZXQ9J2N1c3RvbSc7IHJlbmRlcigpOyB9CgovKiAtLS0tIGNoYW5nZSBvdmVyIHRpbWU6IG1vbnRobHkgbWVhbiBzY29yZSBwZXIgY29tbW9kaXR5IC0tLS0gKi8KY29uc3QgQ09NX0NPTE9SPXt2YW5pbGxhOid2YXIoLS1jLXZhbiknLGNvZmZlZTondmFyKC0tYy1jb2YpJyxjb2NvYTondmFyKC0tYy1jb2MpJ307CmZ1bmN0aW9uIHltKGQpeyByZXR1cm4gZC5zbGljZSgwLDcpOyB9CmZ1bmN0aW9uIG1vbnRobHlTZXJpZXMoYXVkaXRzKXsKICBjb25zdCBieT17fSwgbW9udGhzU2V0PW5ldyBTZXQoKSwgbmFtZXM9e307CiAgZm9yKGNvbnN0IGEgb2YgYXVkaXRzKXsgY29uc3Qgaz15bShhdWRpdERhdGUoYSkpOyBpZighaykgY29udGludWU7IG1vbnRoc1NldC5hZGQoayk7IG5hbWVzW2EuY29tbW9kaXR5XT1hLmNvbW1vZGl0eV9uYW1lOwogICAgY29uc3QgY209YnlbYS5jb21tb2RpdHldfHwoYnlbYS5jb21tb2RpdHldPXt9KTsgY29uc3Qgcz1jbVtrXXx8KGNtW2tdPXtzdW06MCxuOjB9KTsKICAgIGZvcihjb25zdCByIG9mIChhLnJlc3BvbnNlc3x8W10pKXsgaWYoci52YWx1ZT09bnVsbCkgY29udGludWU7IHMuc3VtKz1yLnZhbHVlLzI7IHMubisrOyB9IH0KICBjb25zdCBtb250aHM9Wy4uLm1vbnRoc1NldF0uc29ydCgpOwogIGNvbnN0IHNlcmllcz1DT01fT1JERVIuZmlsdGVyKGs9PmJ5W2tdKS5tYXAoaz0+KHtrZXk6ayxuYW1lOm5hbWVzW2tdfHxrLAogICAgcG9pbnRzOm1vbnRocy5tYXAobT0+KHt5bTptLG1lYW46KGJ5W2tdW21dJiZieVtrXVttXS5uKT9ieVtrXVttXS5zdW0vYnlba11bbV0ubjpudWxsLG46Ynlba11bbV0/Ynlba11bbV0ubjowfSkpfSkpOwogIHJldHVybiB7bW9udGhzLHNlcmllc307Cn0KZnVuY3Rpb24gdHJlbmRTVkcoYXVkaXRzKXsKICBjb25zdCB7bW9udGhzLHNlcmllc309bW9udGhseVNlcmllcyhhdWRpdHMpOwogIGlmKG1vbnRocy5sZW5ndGg8MikgcmV0dXJuIGA8ZGl2IGNsYXNzPSJub3RlIiBzdHlsZT0iYm9yZGVyLWxlZnQtY29sb3I6dmFyKC0tcnVsZS1ib2xkKSI+Tm90IGVub3VnaCBtb250aHMgaW4gdGhpcyByYW5nZSB5ZXQgdG8gc2hvdyBhIHRyZW5kIOKAlCB0aGUgbGluZSBidWlsZHMgYXMgdmlzaXRzIGFjY3VtdWxhdGUgYWNyb3NzIG1vbnRocy48L2Rpdj5gOwogIGNvbnN0IFc9NzYwLEg9MzAwLEw9MzgsUj0xNCxUPTE2LEI9NDYsIGl3PVctTC1SLCBpaD1ILVQtQjsKICBjb25zdCB4PWk9PiBMICsgKG1vbnRocy5sZW5ndGg9PT0xP2l3LzI6aXcqaS8obW9udGhzLmxlbmd0aC0xKSk7CiAgY29uc3QgeT12PT4gVCArIGloKigxLXYpOwogIGxldCBnPScnOwogIFswLC4yNSwuNSwuNzUsMV0uZm9yRWFjaCh2PT57IGcrPWA8bGluZSB4MT0iJHtMfSIgeTE9IiR7eSh2KX0iIHgyPSIke1ctUn0iIHkyPSIke3kodil9IiBzdHJva2U9InZhcigtLXJ1bGUpIiBzdHJva2Utd2lkdGg9IjEiLz48dGV4dCB4PSIke0wtNn0iIHk9IiR7eSh2KSszfSIgdGV4dC1hbmNob3I9ImVuZCIgZm9udC1zaXplPSIxMCIgZmlsbD0idmFyKC0tZmFpbnQpIiBmb250LWZhbWlseT0idmFyKC0tbW9ubykiPiR7TWF0aC5yb3VuZCh2KjEwMCl9PC90ZXh0PmA7IH0pOwogIGNvbnN0IHN0ZXA9TWF0aC5tYXgoMSxNYXRoLmNlaWwobW9udGhzLmxlbmd0aC84KSk7CiAgbW9udGhzLmZvckVhY2goKG0saSk9PnsgaWYoaSVzdGVwPT09MHx8aT09PW1vbnRocy5sZW5ndGgtMSl7IGNvbnN0IFt5eSxtbV09bS5zcGxpdCgnLScpOyBnKz1gPHRleHQgeD0iJHt4KGkpfSIgeT0iJHtILUIrMTh9IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXNpemU9IjEwIiBmaWxsPSJ2YXIoLS1tdXRlZCkiIGZvbnQtZmFtaWx5PSJ2YXIoLS1tb25vKSI+JHtbJ0phbicsJ0ZlYicsJ01hcicsJ0FwcicsJ01heScsJ0p1bicsJ0p1bCcsJ0F1ZycsJ1NlcCcsJ09jdCcsJ05vdicsJ0RlYyddWyttbS0xXX08dHNwYW4gZmlsbD0idmFyKC0tZmFpbnQpIj4gJyR7eXkuc2xpY2UoMil9PC90c3Bhbj48L3RleHQ+YDsgfSB9KTsKICBzZXJpZXMuZm9yRWFjaChzPT57CiAgICBjb25zdCBjb2w9Q09NX0NPTE9SW3Mua2V5XXx8J3ZhcigtLWZvcmVzdCknOyBsZXQgZD0nJyxzdGFydGVkPWZhbHNlOwogICAgcy5wb2ludHMuZm9yRWFjaCgocCxpKT0+eyBpZihwLm1lYW49PW51bGwpeyBzdGFydGVkPWZhbHNlOyByZXR1cm47IH0gZCs9KHN0YXJ0ZWQ/J0wnOidNJykreChpKSsnICcreShwLm1lYW4pKycgJzsgc3RhcnRlZD10cnVlOyB9KTsKICAgIGcrPWA8cGF0aCBkPSIke2R9IiBmaWxsPSJub25lIiBzdHJva2U9IiR7Y29sfSIgc3Ryb2tlLXdpZHRoPSIyLjQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPmA7CiAgICBzLnBvaW50cy5mb3JFYWNoKChwLGkpPT57IGlmKHAubWVhbj09bnVsbCkgcmV0dXJuOyBnKz1gPGNpcmNsZSBjeD0iJHt4KGkpfSIgY3k9IiR7eShwLm1lYW4pfSIgcj0iJHtwLm4+PTM/My42OjIuNn0iIGZpbGw9IiR7Y29sfSIvPmA7IH0pOwogIH0pOwogIGNvbnN0IGxlZ2VuZD1zZXJpZXMubWFwKHM9PmA8c3BhbiBjbGFzcz0ibGciPjxzcGFuIGNsYXNzPSJkb3QiIHN0eWxlPSJiYWNrZ3JvdW5kOiR7Q09NX0NPTE9SW3Mua2V5XX0iPjwvc3Bhbj4ke2VzYyhzLm5hbWUpfTwvc3Bhbj5gKS5qb2luKCcnKTsKICByZXR1cm4gYDxkaXYgY2xhc3M9ImNoYXJ0d3JhcCI+PHN2ZyB2aWV3Qm94PSIwIDAgJHtXfSAke0h9IiBwcmVzZXJ2ZUFzcGVjdFJhdGlvPSJ4TWlkWU1pZCBtZWV0IiByb2xlPSJpbWciIGFyaWEtbGFiZWw9Ik1vbnRobHkgbWVhbiBzY29yZSBieSBjb21tb2RpdHkiPiR7Z308L3N2Zz48L2Rpdj48ZGl2IGNsYXNzPSJsZWdlbmQiPiR7bGVnZW5kfTxzcGFuIGNsYXNzPSJsZy1ub3RlIj5tZWFuIGl0ZW0gc2NvcmUgKCUpIHBlciBtb250aCDCtyBsYXJnZXIgZG90cyA9IG1vcmUgb2JzZXJ2YXRpb25zPC9zcGFuPjwvZGl2PmA7Cn0KLyogLS0tLSBjcm9zcy1jaGFpbiB0aGVtZXM6IGdyb3VwIGV2ZXJ5IGl0ZW0gaW50byBhIHNoYXJlZCB0aGVtZSBzbyBhIHdlYWtuZXNzCiAgIGNvbW1vbiB0byBhbGwgY3JvcHMgc3RhbmRzIGFwYXJ0IGZyb20gYSBjcm9wLXNwZWNpZmljIG9uZS4gSHlnaWVuZSBhbmQgc2FsZXMKICAgYXJlIGNyb3NzLWN1dHRpbmcgKHRoZXkgbGl2ZSBpbnNpZGUgc2V2ZXJhbCBzdGFnZXMpLCBzbyB0aGV5IGFyZSBtYXRjaGVkIG9uCiAgIHRoZSBpdGVtIHRleHQgZmlyc3Q7IGV2ZXJ5dGhpbmcgZWxzZSBmYWxscyB0byBpdHMgcHJvY2VzcyBzdGFnZS4gLS0tLSAqLwpjb25zdCBUSEVNRV9PUkRFUj1bJ0Fncm9ub215ICYgZmllbGQnLCdIYXJ2ZXN0JywnUHJvY2Vzc2luZyAmIGRyeWluZycsJ0h5Z2llbmUgJiBjb250YW1pbmF0aW9uJywnUXVhbGl0eSAmIGdyYWRpbmcnLCdTdG9yYWdlJywnU2FsZXMgJiBtYXJrZXQnLCdPdGhlciddOwpmdW5jdGlvbiB0aGVtZU9mKGl0ZW0sIHN0YWdlKXsKICBjb25zdCBpdD0oaXRlbXx8JycpLnRvTG93ZXJDYXNlKCksIHN0PShzdGFnZXx8JycpLnRvTG93ZXJDYXNlKCk7CiAgaWYoL3Ntb2tlfGNvbnRhbWluYXR8bW91bGR8bW9sZHxwZXN0fHNvdXIgc21lbGx8b2RvdXJ8b2Rvci8udGVzdChpdCkpIHJldHVybiAnSHlnaWVuZSAmIGNvbnRhbWluYXRpb24nOwogIGlmKC9udXJzZXJ5fHBsYW50aW5nfHlvdW5nfG1hdHVyZXx2aW5lIHBsb3R8cG9sbGluYXQvLnRlc3Qoc3QpKSByZXR1cm4gJ0Fncm9ub215ICYgZmllbGQnOwogIGlmKC9oYXJ2ZXN0fHBvZHMgb24gdGhlIHZpbmV8cG9kIGJyZWFrLy50ZXN0KHN0KSkgcmV0dXJuICdIYXJ2ZXN0JzsKICBpZigva2lsbGluZ3xzd2VhdGluZ3xmZXJtZW50fHdhc2h8cHVscHxkcnkvLnRlc3Qoc3QpKSByZXR1cm4gJ1Byb2Nlc3NpbmcgJiBkcnlpbmcnOwogIGlmKC9xdWFsaXR5Ly50ZXN0KHN0KSkgcmV0dXJuICdRdWFsaXR5ICYgZ3JhZGluZyc7CiAgaWYoL2NvbmRpdGlvbmluZ3xzdG9yYWdlLy50ZXN0KHN0KSkgcmV0dXJuICdTdG9yYWdlJzsKICBpZigvXGJzYWxlXGIvLnRlc3Qoc3QpKSByZXR1cm4gJ1NhbGVzICYgbWFya2V0JzsKICByZXR1cm4gJ090aGVyJzsKfQpmdW5jdGlvbiBjcm9zc1RoZW1lcyhhdWRpdHMpewogIGNvbnN0IFQ9e307CiAgZm9yKGNvbnN0IGEgb2YgYXVkaXRzKXsgZm9yKGNvbnN0IHIgb2YgKGEucmVzcG9uc2VzfHxbXSkpeyBpZihyLnZhbHVlPT1udWxsKSBjb250aW51ZTsKICAgIGNvbnN0IHRoPXRoZW1lT2Yoci5pdGVtLCBhLm1vZHVsZV9uYW1lKSwgc2M9ci52YWx1ZS8yOwogICAgY29uc3QgdD1UW3RoXXx8KFRbdGhdPXt0aGVtZTp0aCxuOjAsc3VtOjAsY29tOnt9fSk7CiAgICB0Lm4rKzsgdC5zdW0rPXNjOwogICAgY29uc3QgYz10LmNvbVthLmNvbW1vZGl0eV18fCh0LmNvbVthLmNvbW1vZGl0eV09e246MCxzdW06MCxuYW1lOmEuY29tbW9kaXR5X25hbWV9KTsKICAgIGMubisrOyBjLnN1bSs9c2M7CiAgfX0KICByZXR1cm4gT2JqZWN0LnZhbHVlcyhUKS5tYXAodD0+e3QubWVhbj10Lm4/dC5zdW0vdC5uOjA7IHQuc2hvcnRmYWxsPTEtdC5tZWFuOyB0LnNwcmVhZD0wOwogICAgY29uc3QgbXM9Q09NX09SREVSLmZpbHRlcihrPT50LmNvbVtrXSkubWFwKGs9PnQuY29tW2tdLnN1bS90LmNvbVtrXS5uKTsgaWYobXMubGVuZ3RoPjEpeyB0LnNwcmVhZD1NYXRoLm1heCguLi5tcyktTWF0aC5taW4oLi4ubXMpOyB9CiAgICByZXR1cm4gdDt9KS5zb3J0KChhLGIpPT4gYi5zaG9ydGZhbGwtYS5zaG9ydGZhbGwpOwp9CmZ1bmN0aW9uIGl0ZW1UcmVuZHMoYXVkaXRzKXsKICBjb25zdCBkcz1hdWRpdHMubWFwKGF1ZGl0RGF0ZSkuZmlsdGVyKEJvb2xlYW4pLnNvcnQoKTsgaWYoZHMubGVuZ3RoPDQpIHJldHVybiB7fTsKICBjb25zdCBtaWQ9ZHNbTWF0aC5mbG9vcihkcy5sZW5ndGgvMildOyBjb25zdCBhZ2c9e307CiAgZm9yKGNvbnN0IGEgb2YgYXVkaXRzKXsgY29uc3QgaGFsZj1hdWRpdERhdGUoYSk8bWlkPydlJzonbCc7IGNvbnN0IGNtPWFnZ1thLmNvbW1vZGl0eV18fChhZ2dbYS5jb21tb2RpdHldPXt9KTsKICAgIGZvcihjb25zdCByIG9mIChhLnJlc3BvbnNlc3x8W10pKXsgaWYoci52YWx1ZT09bnVsbCkgY29udGludWU7IGNvbnN0IGl0PWNtW3IuY29kZV18fChjbVtyLmNvZGVdPXtlOlswLDBdLGw6WzAsMF19KTsgaXRbaGFsZl1bMF0rPXIudmFsdWUvMjsgaXRbaGFsZl1bMV0rKzsgfSB9CiAgY29uc3Qgb3V0PXt9OwogIGZvcihjb25zdCBjb20gaW4gYWdnKXsgb3V0W2NvbV09e307IGZvcihjb25zdCBjb2RlIGluIGFnZ1tjb21dKXsgY29uc3Qgbz1hZ2dbY29tXVtjb2RlXTsKICAgIGlmKG8uZVsxXT49MiYmby5sWzFdPj0yKXsgY29uc3QgZGlmZj0oby5sWzBdL28ubFsxXSktKG8uZVswXS9vLmVbMV0pOyBvdXRbY29tXVtjb2RlXT0gZGlmZj4wLjA4Pyd1cCc6ZGlmZjwtMC4wOD8nZG93bic6J2ZsYXQnOyB9IH0gfQogIHJldHVybiBvdXQ7Cn0KZnVuY3Rpb24gdHJlbmRBcnJvdyhkaXIpewogIGlmKGRpcj09PSd1cCcpIHJldHVybiAnPHNwYW4gY2xhc3M9InRyIHVwIiB0aXRsZT0iaW1wcm92aW5nIHZzIGVhcmxpZXIgaW4gcmFuZ2UiPuKWsjwvc3Bhbj4nOwogIGlmKGRpcj09PSdkb3duJykgcmV0dXJuICc8c3BhbiBjbGFzcz0idHIgZG93biIgdGl0bGU9IndvcnNlbmluZyB2cyBlYXJsaWVyIGluIHJhbmdlIj7ilrw8L3NwYW4+JzsKICBpZihkaXI9PT0nZmxhdCcpIHJldHVybiAnPHNwYW4gY2xhc3M9InRyIGZsYXQiIHRpdGxlPSJsaXR0bGUgY2hhbmdlIj7ihpI8L3NwYW4+JzsKICByZXR1cm4gJzxzcGFuIGNsYXNzPSJ0ciBub25lIiB0aXRsZT0ibm90IGVub3VnaCBkYXRhIHRvIGNvbXBhcmUiPsK3PC9zcGFuPic7Cn0KCmZ1bmN0aW9uIHJlbmRlcigpewogIGNvbnN0IGF1ZGl0cz1jdXJyZW50QXVkaXRzKCk7CiAgY29uc3QgQT1hbmFseXplKGF1ZGl0cyk7IGNvbnN0IFA9ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3BhZ2UnKTsgbGV0IEg9Jyc7CiAgY29uc3QgdHJlbmRzPWl0ZW1UcmVuZHMoYXVkaXRzKTsKICBjb25zdCBzdGFnZXNDb3ZlcmVkPU9iamVjdC52YWx1ZXMoQS5ieUNvbSkucmVkdWNlKChuLEMpPT5uK0Muc3RhZ2VMaXN0Lmxlbmd0aCwwKTsKICBIKz1gPGRpdiBjbGFzcz0ibWFzdCI+CiAgICA8cCBjbGFzcz0iZXllYnJvdyI+TWFuYWdhbGFzIENvbnNlcnZhdGlvbiBBcmVhIMK3IE1DQXBwIMK3IFZhbHVlIENoYWluczwvcD4KICAgIDxoMT5WYWx1ZSBDaGFpbiBBdWRpdCDigJQgVHJhaW5pbmcgTmVlZHM8L2gxPgogICAgPGRpdiBjbGFzcz0ic3ViIj5XaGVyZSBwcmFjdGljZSBpcyB3ZWFrZXN0IGFjcm9zcyB0aGUgdmFuaWxsYSwgY29mZmVlIGFuZCBjb2NvYSB2YWx1ZSBjaGFpbnMg4oCUIHNvIHRyYWluaW5nIGdvZXMgd2hlcmUgaXQgaXMgbmVlZGVkIG1vc3QuPC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJtZXRhIj48c3Bhbj5TaG93aW5nIDxiPiR7Zm10RGF0ZShBLm1pbkQpfHwn4oCUJ30g4oCTICR7Zm10RGF0ZShBLm1heEQpfHwn4oCUJ308L2I+IChQTkcpPC9zcGFuPjxzcGFuPjxiPiR7QS50b3RhbH08L2I+IGF1ZGl0IHZpc2l0czwvc3Bhbj48c3Bhbj5HZW5lcmF0ZWQgPGI+JHtmbXREYXRlKHBuZ0RhdGUobmV3IERhdGUoKS50b0lTT1N0cmluZygpKSl9PC9iPjwvc3Bhbj48L2Rpdj4KICA8L2Rpdj5gOwogIGNvbnN0IHByZT0ocCxsYmwpPT5gPGJ1dHRvbiBjbGFzcz0iJHtTVEFURS5wcmVzZXQ9PT1wPydvbic6Jyd9IiBvbmNsaWNrPSJzZXRQcmVzZXQoJyR7cH0nKSI+JHtsYmx9PC9idXR0b24+YDsKICBIKz1gPGRpdiBjbGFzcz0iY29udHJvbHMiPgogICAgPGRpdiBjbGFzcz0icHJlc2V0cyI+JHtwcmUoJ2FsbCcsJ0FsbCcpfSR7cHJlKCcxMm0nLCdMYXN0IDEyIG1vJyl9JHtwcmUoJzZtJywnTGFzdCA2IG1vJyl9JHtwcmUoJzNtJywnTGFzdCAzIG1vJyl9JHtwcmUoJ3l0ZCcsJ1RoaXMgeWVhcicpfTwvZGl2PgogICAgPGRpdiBjbGFzcz0icmFuZ2UiPgogICAgICA8bGFiZWw+RnJvbSA8aW5wdXQgdHlwZT0iZGF0ZSIgaWQ9ImZyb21EIiB2YWx1ZT0iJHtTVEFURS5mcm9tfSIgbWluPSIke01JTl9EfSIgbWF4PSIke01BWF9EfSIgb25jaGFuZ2U9InNldFJhbmdlKCkiPjwvbGFiZWw+CiAgICAgIDxsYWJlbD5UbyA8aW5wdXQgdHlwZT0iZGF0ZSIgaWQ9InRvRCIgdmFsdWU9IiR7U1RBVEUudG99IiBtaW49IiR7TUlOX0R9IiBtYXg9IiR7TUFYX0R9IiBvbmNoYW5nZT0ic2V0UmFuZ2UoKSI+PC9sYWJlbD4KICAgIDwvZGl2PgogIDwvZGl2PmA7CiAgaWYoQS50b3RhbD09PTApeyBQLmlubmVySFRNTD1IK2A8ZGl2IGNsYXNzPSJub3RlIiBzdHlsZT0iYm9yZGVyLWxlZnQtY29sb3I6dmFyKC0tYmFkKSI+Tm8gYXVkaXRzIGluIHRoaXMgZGF0ZSByYW5nZS48L2Rpdj5gOyByZXR1cm47IH0KICBIKz1gPGRpdiBjbGFzcz0ia3BpcyI+CiAgICA8ZGl2IGNsYXNzPSJrcGkiPjxkaXYgY2xhc3M9InYiPiR7QS50b3RhbH08L2Rpdj48ZGl2IGNsYXNzPSJsIj5BdWRpdCB2aXNpdHM8L2Rpdj48L2Rpdj4KICAgIDxkaXYgY2xhc3M9ImtwaSI+PGRpdiBjbGFzcz0idiI+JHtPYmplY3Qua2V5cyhBLmJ5Q29tKS5sZW5ndGh9PC9kaXY+PGRpdiBjbGFzcz0ibCI+VmFsdWUgY2hhaW5zPC9kaXY+PC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJrcGkiPjxkaXYgY2xhc3M9InYiPiR7c3RhZ2VzQ292ZXJlZH08L2Rpdj48ZGl2IGNsYXNzPSJsIj5TdGFnZXMgd2l0aCBkYXRhPC9kaXY+PC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJrcGkiPjxkaXYgY2xhc3M9InYiPiR7QS5hdWRpdG9yc308L2Rpdj48ZGl2IGNsYXNzPSJsIj5BdWRpdG9yczwvZGl2PjwvZGl2PgogICAgPGRpdiBjbGFzcz0ia3BpIj48ZGl2IGNsYXNzPSJ2Ij4ke0EucGhvdG9OfTwvZGl2PjxkaXYgY2xhc3M9ImwiPlByYWN0aWNlIHBob3RvczwvZGl2PjwvZGl2PgogIDwvZGl2PmA7CiAgSCs9YDxoMj5DaGFuZ2Ugb3ZlciB0aW1lPC9oMj5gOwogIEgrPWA8ZGl2IGNsYXNzPSJjbWV0YSIgc3R5bGU9Im1hcmdpbi1ib3R0b206OHB4Ij5PdmVyYWxsIHByYWN0aWNlIHNjb3JlIGJ5IG1vbnRoLCBwZXIgdmFsdWUgY2hhaW4g4oCUIHRoZSBzaWduYWwgZm9yIHdoZXRoZXIgdHJhaW5pbmcgaXMgbW92aW5nIHRoZSBuZWVkbGUuIFVzZSB0aGUgZGF0ZSBmaWx0ZXIgYWJvdmUgdG8gZm9jdXMgYSBwZXJpb2QuPC9kaXY+YDsKICBIKz10cmVuZFNWRyhhdWRpdHMpOwogIEgrPWA8ZGl2IGNsYXNzPSJub3RlIj5PbmUgdmlzaXQgc2NvcmVzIG9uZSBzdGFnZSwgc28gdGhlIHBpY3R1cmUgYnVpbGRzIHVwIG92ZXIgc2Vhc29ucy4gRWFjaCBpdGVtIGlzIHNjb3JlZCBvbiB0aGUgc2FtZSBiYXNpcyAoWWVzIDEwMCUgwrcgUGFydGlhbCA1MCUgwrcgTm8gMCUsIHRoZSBjcml0aWNhbCBkb3VibGUtd2VpZ2h0IHNldCBhc2lkZSBzbyBpdGVtcyBjb21wYXJlKSwgdGhlbiByYW5rZWQgYnkgPGI+c2hvcnRmYWxsPC9iPiDigJQgdGhlIGdhcCB0byBmdWxsIG1hcmtzLiBUaGUgPGI+dHJlbmQgYXJyb3c8L2I+IGNvbXBhcmVzIHRoZSBsYXRlciBoYWxmIG9mIHRoZSBzZWxlY3RlZCByYW5nZSB3aXRoIHRoZSBlYXJsaWVyIGhhbGYuPC9kaXY+YDsKCiAgLyogY3Jvc3MtY2hhaW46IGNvbW1vbiB3ZWFrbmVzc2VzIGJ5IHRoZW1lICovCiAgY29uc3QgdGhlbWVzPWNyb3NzVGhlbWVzKGF1ZGl0cyk7CiAgaWYodGhlbWVzLmxlbmd0aCl7CiAgICBIKz1gPGgyPkNvbW1vbiB3ZWFrbmVzc2VzIOKAlCBhbGwgdmFsdWUgY2hhaW5zPC9oMj5gOwogICAgSCs9YDxkaXYgY2xhc3M9ImNtZXRhIiBzdHlsZT0ibWFyZ2luLWJvdHRvbToxMHB4Ij5UaGUgc2FtZSBwcmFjdGljZXMgZ3JvdXBlZCBpbnRvIHNoYXJlZCB0aGVtZXMsIHNvIGEgd2Vha25lc3MgY29tbW9uIHRvIGV2ZXJ5IGNyb3AgKHRyYWluIGl0IG9uY2UsIGhlbHAgdGhyZWUgY2hhaW5zKSBzdGFuZHMgYXBhcnQgZnJvbSBhIGNyb3Atc3BlY2lmaWMgb25lLiBBIHJlZCByb3cgaXMgYSA8Yj5zaGFyZWQgd2Vha25lc3M8L2I+OyBhIHNpbmdsZSByZWQgY2VsbCBpcyA8Yj5jb25jZW50cmF0ZWQ8L2I+IGluIG9uZSBjcm9wLiBSYW5rZWQgd2Vha2VzdC1maXJzdC48L2Rpdj5gOwogICAgY29uc3Qgcm93cz10aGVtZXMuZmlsdGVyKHQ9PnQudGhlbWUhPT0nT3RoZXInKTsKICAgIGNvbnN0IGNyb3BzUHJlc2VudD1DT01fT1JERVIuZmlsdGVyKGs9PnJvd3Muc29tZSh0PT50LmNvbVtrXSkpOwogICAgY29uc3QgY2VsbD0odixuKT0+eyBjb25zdCBiZz1oZWF0Q29sb3Iodik7IGlmKGJnPT1udWxsKSByZXR1cm4gYDxkaXYgY2xhc3M9ImhnLWNlbGwgZW1wdHkiPuKAlDwvZGl2PmA7CiAgICAgIHJldHVybiBgPGRpdiBjbGFzcz0iaGctY2VsbCIgc3R5bGU9ImJhY2tncm91bmQ6JHtiZ30iPjxzcGFuIGNsYXNzPSJoZy12Ij4ke01hdGgucm91bmQodioxMDApfSU8L3NwYW4+PHNwYW4gY2xhc3M9ImhnLW4iPiR7bn08L3NwYW4+PC9kaXY+YDsgfTsKICAgIGxldCBHPWA8ZGl2IGNsYXNzPSJoZy1zY3JvbGwiPjxkaXYgY2xhc3M9ImhlYXRncmlkIiBzdHlsZT0iZ3JpZC10ZW1wbGF0ZS1jb2x1bW5zOm1pbm1heCgxNDhweCwxLjVmcikgcmVwZWF0KCR7Y3JvcHNQcmVzZW50Lmxlbmd0aCsxfSxtaW5tYXgoNzBweCwxZnIpKSI+YDsKICAgIEcrPWA8ZGl2IGNsYXNzPSJoZy10aCI+PC9kaXY+PGRpdiBjbGFzcz0iaGctY2ggYWxsIj5BbGwgY3JvcHM8L2Rpdj5gK2Nyb3BzUHJlc2VudC5tYXAoaz0+YDxkaXYgY2xhc3M9ImhnLWNoIj48aSBjbGFzcz0iY2NkIiBzdHlsZT0iYmFja2dyb3VuZDoke0NPTV9DT0xPUltrXX0iPjwvaT4ke2VzYygocm93cy5maW5kKHQ9PnQuY29tW2tdKXx8e2NvbTp7fX0pLmNvbVtrXT9yb3dzLmZpbmQodD0+dC5jb21ba10pLmNvbVtrXS5uYW1lOmspfTwvZGl2PmApLmpvaW4oJycpOwogICAgcm93cy5mb3JFYWNoKHQ9PnsKICAgICAgY29uc3Qgc2hhcmVkPSh0LnNwcmVhZD4wICYmIHQuc3ByZWFkPDAuMTUgJiYgY3JvcHNQcmVzZW50LmZpbHRlcihrPT50LmNvbVtrXSkubGVuZ3RoPj0yKT8nPHNwYW4gY2xhc3M9InNoYXJlZCIgdGl0bGU9InNpbWlsYXIgYWNyb3NzIGNyb3BzIj5zaGFyZWQ8L3NwYW4+JzonJzsKICAgICAgRys9YDxkaXYgY2xhc3M9ImhnLWxibCI+JHtlc2ModC50aGVtZSl9ICR7c2hhcmVkfTxzcGFuIGNsYXNzPSJoZy1vYnMiPiR7dC5ufSBvYnM8L3NwYW4+PC9kaXY+YDsKICAgICAgRys9Y2VsbCh0Lm1lYW4sdC5uKTsKICAgICAgY3JvcHNQcmVzZW50LmZvckVhY2goaz0+eyBjb25zdCBjPXQuY29tW2tdOyBHKz0gYz9jZWxsKGMuc3VtL2MubixjLm4pOmA8ZGl2IGNsYXNzPSJoZy1jZWxsIGVtcHR5Ij7igJQ8L2Rpdj5gOyB9KTsKICAgIH0pOwogICAgRys9YDwvZGl2PjwvZGl2PmA7CiAgICBHKz1gPGRpdiBjbGFzcz0iaGctbGVnZW5kIj48c3Bhbj5XZWFrPC9zcGFuPjxzcGFuIGNsYXNzPSJoZy1zY2FsZSI+PC9zcGFuPjxzcGFuPlN0cm9uZzwvc3Bhbj48c3BhbiBjbGFzcz0iaGctbG5vdGUiPmNlbGwgPSBtZWFuIHByYWN0aWNlIHNjb3JlIMK3IHNtYWxsIG51bWJlciA9IG9ic2VydmF0aW9uczwvc3Bhbj48L2Rpdj5gOwogICAgSCs9RzsKICB9CgogIENPTV9PUkRFUi5maWx0ZXIoaz0+QS5ieUNvbVtrXSkuZm9yRWFjaChrPT57CiAgICBjb25zdCBDPUEuYnlDb21ba107CiAgICBIKz1gPGgyPiR7ZXNjKEMubmFtZSl9ICR7Qy5kcmFmdD8nPHNwYW4gY2xhc3M9ImRyYWZ0Ij5kcmFmdCBjaGVja2xpc3Q8L3NwYW4+JzonJ308L2gyPmA7CiAgICBIKz1gPGRpdiBjbGFzcz0iY21ldGEiPjxzcGFuIGNsYXNzPSJjaGlwIj4ke0MudmlzaXRzfSB2aXNpdHM8L3NwYW4+PHNwYW4gY2xhc3M9ImNoaXAiPm92ZXJhbGwgJHtNYXRoLnJvdW5kKEMubWVhbioxMDApfSU8L3NwYW4+PHNwYW4gY2xhc3M9ImNoaXAiPiR7Qy5hdWRpdG9ycy5zaXplfSBhdWRpdG9yJHtDLmF1ZGl0b3JzLnNpemUhPT0xPydzJzonJ308L3NwYW4+PHNwYW4gY2xhc3M9ImNoaXAiPiR7Qy56b25lcy5zaXplfSB6b25lJHtDLnpvbmVzLnNpemUhPT0xPydzJzonJ308L3NwYW4+PC9kaXY+YDsKCiAgICBIKz1gPGgzPlRvcCB0cmFpbmluZyBwcmlvcml0aWVzPC9oMz5gOwogICAgSCs9YDx0YWJsZT48dGhlYWQ+PHRyPjx0aCBjbGFzcz0ibiI+IzwvdGg+PHRoPlByYWN0aWNlPC90aD48dGg+U3RhZ2U8L3RoPjx0aCBjbGFzcz0ibiI+T2JzPC90aD48dGg+WSAvIFAgLyBOPC90aD48dGg+U2hvcnRmYWxsPC90aD48dGggY2xhc3M9InRjIj5UcmVuZDwvdGg+PC90cj48L3RoZWFkPjx0Ym9keT5gOwogICAgY29uc3QgY3RyPXRyZW5kc1trXXx8e307CiAgICBDLml0ZW1MaXN0LnNsaWNlKDAsMTIpLmZvckVhY2goKGl0LGkpPT57CiAgICAgIGNvbnN0IHNmUGN0PU1hdGgucm91bmQoaXQuc2hvcnRmYWxsKjEwMCk7CiAgICAgIEgrPWA8dHI+CiAgICAgICAgPHRkIGNsYXNzPSJuIHJhbmsiPiR7aSsxfTwvdGQ+CiAgICAgICAgPHRkPiR7ZXNjKGl0Lml0ZW0pfSR7aXQuY3JpdGljYWw/JzxzcGFuIGNsYXNzPSJjcml0Ij5jcml0aWNhbDwvc3Bhbj4nOicnfTxkaXYgc3R5bGU9ImZvbnQtc2l6ZTouNjZyZW07Y29sb3I6dmFyKC0tZmFpbnQpO2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pIj4ke2VzYyhpdC5jb2RlKX08L2Rpdj48L3RkPgogICAgICAgIDx0ZCBzdHlsZT0iZm9udC1zaXplOi43OHJlbTtjb2xvcjp2YXIoLS1tdXRlZCkiPiR7ZXNjKGl0LnN0YWdlKX0gwrcgJHtlc2MoaXQuc3RhZ2VfbmFtZSl9PC90ZD4KICAgICAgICA8dGQgY2xhc3M9Im4iPiR7aXQubn08L3RkPgogICAgICAgIDx0ZCBjbGFzcz0ieXBuIj48c3BhbiBjbGFzcz0ieSI+JHtpdC55ZXN8fDB9PC9zcGFuPiAvIDxzcGFuIGNsYXNzPSJwIj4ke2l0LnBhcnRpYWx8fDB9PC9zcGFuPiAvIDxzcGFuIGNsYXNzPSJubyI+JHtpdC5ub3x8MH08L3NwYW4+PC90ZD4KICAgICAgICA8dGQ+PGRpdiBjbGFzcz0ic2YiPjxkaXYgY2xhc3M9InNmLWJhciI+PGRpdiBjbGFzcz0ic2YtZmlsbCIgc3R5bGU9IndpZHRoOiR7c2ZQY3R9JTtiYWNrZ3JvdW5kOiR7c2NvcmVDb2xvcihpdC5tZWFuKX0iPjwvZGl2PjwvZGl2PjxzcGFuIGNsYXNzPSJzZi12Ij4ke3NmUGN0fSU8L3NwYW4+PC9kaXY+PC90ZD4KICAgICAgICA8dGQgY2xhc3M9InRjIj4ke3RyZW5kQXJyb3coY3RyW2l0LmNvZGVdKX08L3RkPgogICAgICA8L3RyPmA7CiAgICB9KTsKICAgIEgrPWA8L3Rib2R5PjwvdGFibGU+YDsKCiAgICBIKz1gPGgzPkJ5IHN0YWdlPC9oMz48ZGl2IGNsYXNzPSJzdGFnZXMiPmA7CiAgICBDLnN0YWdlTGlzdC5mb3JFYWNoKHM9PnsKICAgICAgSCs9YDxkaXYgY2xhc3M9InN0Ij48ZGl2IGNsYXNzPSJzYyIgc3R5bGU9ImNvbG9yOiR7c2NvcmVDb2xvcihzLm1lYW4pfSI+JHtzLm4/TWF0aC5yb3VuZChzLm1lYW4qMTAwKSsnJSc6J+KAlCd9PC9kaXY+CiAgICAgICAgPGRpdiBjbGFzcz0ibm0iPjxiPiR7ZXNjKHMuY29kZSl9PC9iPiAke2VzYyhzLm5hbWUpfTwvZGl2PgogICAgICAgIDxkaXYgY2xhc3M9ImV4Ij4ke3MudmlzaXRzfSB2aXNpdCR7cy52aXNpdHMhPT0xPydzJzonJ30ke3MuY3JpdEZhaWw/JyDCtyAnK3MuY3JpdEZhaWwrJyBjcml0aWNhbCBObyc6Jyd9PC9kaXY+PC9kaXY+YDsKICAgIH0pOwogICAgSCs9YDwvZGl2PmA7CiAgfSk7CgogIC8qIHByYWN0aWNlIGdhbGxlcnkgKi8KICBjb25zdCBhbGxQaG90b3M9W107IENPTV9PUkRFUi5maWx0ZXIoaz0+QS5ieUNvbVtrXSkuZm9yRWFjaChrPT5BLmJ5Q29tW2tdLnBob3Rvcy5mb3JFYWNoKHA9PmFsbFBob3Rvcy5wdXNoKE9iamVjdC5hc3NpZ24oe2NvbW1vZGl0eTpBLmJ5Q29tW2tdLm5hbWV9LHApKSkpOwogIGNvbnN0IGdvb2Q9YWxsUGhvdG9zLmZpbHRlcihwPT5wLnByYWN0aWNlPT09J2dvb2QnKS5sZW5ndGgsIGJhZD1hbGxQaG90b3MuZmlsdGVyKHA9PnAucHJhY3RpY2U9PT0nYmFkJykubGVuZ3RoOwogIEgrPWA8aDI+R29vZCAmYW1wOyBiYWQgcHJhY3RpY2Ug4oCUIHBob3RvIGxpYnJhcnk8L2gyPmA7CiAgSCs9YDxkaXYgY2xhc3M9Im5vdGUiPlBob3RvcyB0aGUgYXVkaXRvcnMgZmxhZ2dlZCwgdGFnZ2VkIGJ5IHN0YWdlIGFuZCBhcyBnb29kIG9yIGJhZCBwcmFjdGljZSDigJQgcmVhZHkgdG8gcmV1c2UgYXMgdHJhaW5pbmcgbWF0ZXJpYWwuIFRoZSByZXBvcnQga2VlcHMgYSBsaWdodCB0aHVtYm5haWwgYW5kIDxiPmxpbmtzIGVhY2ggb25lIHRvIHRoZSBmdWxsLXJlc29sdXRpb24gb3JpZ2luYWwgb24gRHJpdmU8L2I+IChjbGljayBhbnkgcGhvdG8pOyBub3RoaW5nIGlzIHJlLXN0b3JlZCBoZXJlLiA8Yj4ke2dvb2R9IGdvb2Q8L2I+IMK3IDxiPiR7YmFkfSBiYWQ8L2I+LjwvZGl2PmA7CiAgSCs9YDxkaXYgY2xhc3M9InNlZyIgaWQ9ImdhbFNlZyI+CiAgICAgPGJ1dHRvbiBjbGFzcz0ib24iIGRhdGEtZj0iYWxsIiBvbmNsaWNrPSJnYWxGaWx0ZXIoJ2FsbCcsdGhpcykiPkFsbCAoJHthbGxQaG90b3MubGVuZ3RofSk8L2J1dHRvbj4KICAgICA8YnV0dG9uIGRhdGEtZj0iZ29vZCIgb25jbGljaz0iZ2FsRmlsdGVyKCdnb29kJyx0aGlzKSI+R29vZCAoJHtnb29kfSk8L2J1dHRvbj4KICAgICA8YnV0dG9uIGRhdGEtZj0iYmFkIiBvbmNsaWNrPSJnYWxGaWx0ZXIoJ2JhZCcsdGhpcykiPkJhZCAoJHtiYWR9KTwvYnV0dG9uPjwvZGl2PmA7CiAgSCs9YDxkaXYgY2xhc3M9ImdhbGxlcnkiIGlkPSJnYWxsZXJ5Ij48L2Rpdj5gOwoKICBQLmlubmVySFRNTD1IOwogIHdpbmRvdy5fX3Bob3Rvcz1hbGxQaG90b3M7IGdhbEZpbHRlcignYWxsJyk7Cn0KCmZ1bmN0aW9uIGdhbEZpbHRlcihmLCBidG4pewogIGlmKGJ0bil7IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJyNnYWxTZWcgYnV0dG9uJykuZm9yRWFjaChiPT5iLmNsYXNzTGlzdC50b2dnbGUoJ29uJyxiPT09YnRuKSk7IH0KICBjb25zdCBsaXN0PSh3aW5kb3cuX19waG90b3N8fFtdKS5maWx0ZXIocD0+IGY9PT0nYWxsJ3x8cC5wcmFjdGljZT09PWYpOwogIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnYWxsZXJ5JykuaW5uZXJIVE1MID0gbGlzdC5tYXAocD0+ewogICAgY29uc3QgdCA9IHAudGh1bWJfdXJsIHx8IHRodW1iKHAucHJhY3RpY2UsIHAuc3RhZ2VfbmFtZXx8cC5zdGFnZXx8JycsIHAuY2FwdGlvbnx8JycpOwogICAgcmV0dXJuIGA8YSBjbGFzcz0ic2hvdCIgaHJlZj0iJHtlc2MocC5vcmlnaW5hbF91cmx8fCcjJyl9IiB0YXJnZXQ9Il9ibGFuayIgcmVsPSJub29wZW5lciI+CiAgICAgIDxpbWcgc3JjPSIke3R9IiBhbHQ9IiR7ZXNjKHAuY2FwdGlvbnx8JycpfSIgbG9hZGluZz0ibGF6eSI+CiAgICAgIDxkaXYgY2xhc3M9ImNhcCI+CiAgICAgICAgPHNwYW4gY2xhc3M9InByICR7cC5wcmFjdGljZX0iPiR7cC5wcmFjdGljZX0gcHJhY3RpY2U8L3NwYW4+CiAgICAgICAgPGRpdiBjbGFzcz0iY3QiPiR7ZXNjKHAuY2FwdGlvbnx8JycpfTwvZGl2PgogICAgICAgIDxkaXYgY2xhc3M9Im10Ij48c3Bhbj4ke2VzYyhwLmNvbW1vZGl0eXx8JycpfSDCtyAke2VzYyhwLnN0YWdlfHwnJyl9PC9zcGFuPjxzcGFuIGNsYXNzPSJvcGVuIj7ihpcgb3JpZ2luYWw8L3NwYW4+PC9kaXY+CiAgICAgIDwvZGl2PjwvYT5gOwogIH0pLmpvaW4oJycpOwp9CnJlbmRlcigpOwo8L3NjcmlwdD4KPC9ib2R5Pgo8L2h0bWw+Cg==";
function vcReportTemplate(){ return Utilities.newBlob(Utilities.base64Decode(VC_REPORT_TPL_B64)).getDataAsString(); }

function vcBuildMediaMap(sf){
  var map={}; var mf=sf.getFoldersByName('media');
  if(mf.hasNext()){ var files=mf.next().getFiles(); while(files.hasNext()){ var f=files.next(); map[f.getName()]=f.getId(); } }
  return map;
}

/* Collect vc_audit records and resolve each photo's {_media:name} to its Drive
 * original + thumbnail, trimmed to the shape the template consumes. Optional
 * cutoff (months, default 18) keeps the report bounded as data grows. */
function vcCollectForReport(months){
  var cutoff = 0;
  if (months && months > 0) { var d=new Date(); d.setMonth(d.getMonth()-months); cutoff=d.getTime(); }
  var out=[]; var root=getDataFolder(); var zones=root.getFolders();
  while(zones.hasNext()){
    var zf=zones.next(); if(zf.getName().charAt(0)==='_') continue;
    var stewards=zf.getFolders();
    while(stewards.hasNext()){
      var sf=stewards.next(); var mediaMap=null;
      var recs=sf.getFiles();
      while(recs.hasNext()){
        var file=recs.next(); var nm=file.getName();
        if(nm.indexOf('MCA_')!==0 || nm.slice(-5)!=='.json') continue;
        var body; try{ body=JSON.parse(file.getBlob().getDataAsString()); }catch(e){ continue; }
        var arr=body && body.modules && body.modules.vc_audit; if(!arr||!arr.length) continue;
        for(var i=0;i<arr.length;i++){
          var a=arr[i];
          if(cutoff){ var ts=Date.parse(a.recorded_at||''); if(!isNaN(ts) && ts<cutoff) continue; }
          var photos=[];
          var ap=a.photos||[];
          for(var k=0;k<ap.length;k++){
            var p=ap[k]||{};
            var fn = p._media ? p._media : (typeof p.media==='string'?p.media:'');
            var orig='', thumb='';
            if(fn){ if(mediaMap===null) mediaMap=vcBuildMediaMap(sf); var id=mediaMap[fn];
              if(id){ orig='https://drive.google.com/file/d/'+id+'/view'; thumb='https://drive.google.com/thumbnail?id='+id+'&sz=w320'; } }
            photos.push({ stage:p.stage||a.module_code, stage_name:p.stage_name||a.module_name, item_code:p.item_code||'', practice:p.practice||'', caption:p.caption||'', original_url:orig, thumb_url:thumb });
          }
          var resp=[]; var ar=a.responses||[];
          for(var j=0;j<ar.length;j++){ var r=ar[j]; resp.push({code:r.code,item:r.item,critical:!!r.critical,weight:r.weight||1,response:r.response,value:r.value}); }
          out.push({ commodity:a.commodity, commodity_name:a.commodity_name, commodity_draft:!!a.commodity_draft,
            module_code:a.module_code, module_name:a.module_name,
            assessor_id:a.assessor_id, assessor_name:a.assessor_name, assessor_zone:a.assessor_zone, assessor_zone_id:a.assessor_zone_id,
            recorded_at:a.recorded_at, responses:resp, photos:photos });
        }
      }
    }
  }
  return out;
}

function vcRenderReportHtml(months){
  var audits=vcCollectForReport(months||18);
  var json=JSON.stringify(audits).replace(/<\//g,'<\\/');   /* keep </script> out of the inline data */
  return vcReportTemplate().replace('const AUDITS = /*__AUDITS__*/ []', 'const AUDITS = /*__AUDITS__*/ '+json);
}
function vcReportUrl(){ try{ return ScriptApp.getService().getUrl() + '?action=vc_report'; }catch(e){ return ''; } }

function vcTrainingNeedsReport() {
  var audits = collectVcAudits();
  var ss = SpreadsheetApp.create('MCApp Value-chain training needs — ' + _pngDate(new Date(),'yyyy-MM-dd'));
  var byCommodity = {};
  audits.forEach(function(a){
    var com = a.commodity || 'unknown';
    var C = byCommodity[com] || (byCommodity[com] = { visits:0, items:{}, modules:{}, photos:{good:0,bad:0} });
    C.visits++;
    (a.responses||[]).forEach(function(r){
      if (r.value == null) return;                           /* skip N/A / unset */
      var sc = r.value/2;                                    /* 0, .5, 1 — unweighted */
      var it = C.items[r.code] || (C.items[r.code] = { code:r.code, item:r.item, module:a.module_code, module_name:a.module_name, critical:!!r.critical, n:0, sum:0, yes:0, partial:0, no:0 });
      it.n++; it.sum += sc;
      if (r.response==='yes') it.yes++; else if (r.response==='partial') it.partial++; else if (r.response==='no') it.no++;
      var M = C.modules[a.module_code] || (C.modules[a.module_code] = { code:a.module_code, name:a.module_name, n:0, sum:0, critFail:0, visits:0 });
      M.n++; M.sum += sc; if (r.critical && r.response==='no') M.critFail++;
    });
    var seen = {}; (a.responses||[]).forEach(function(r){ if(!seen[a.module_code]){ seen[a.module_code]=1; var M=C.modules[a.module_code]; if(M) M.visits++; } });
    (a.photos||[]).forEach(function(p){ if(p.practice==='good') C.photos.good++; else if(p.practice==='bad') C.photos.bad++; });
  });

  Object.keys(byCommodity).forEach(function(com){
    var C = byCommodity[com];
    /* Training-priority sheet: items ranked by shortfall */
    var sh = ss.insertSheet(com + ' — priorities');
    sh.appendRow(['Rank','Item code','Stage','Item','Critical','Observations','Yes','Partial','No','Mean %','Shortfall']);
    var items = Object.keys(C.items).map(function(k){ var it=C.items[k]; it.mean=it.n?it.sum/it.n:0; it.shortfall=1-it.mean; return it; });
    items.sort(function(a,b){ return (b.shortfall-a.shortfall) || (b.n-a.n); });
    items.forEach(function(it,i){
      sh.appendRow([i+1, it.code, it.module+' '+(it.module_name||''), it.item, it.critical?'Yes':'', it.n, it.yes, it.partial, it.no, Math.round(it.mean*100), Math.round(it.shortfall*100)]);
    });
    if (!items.length) sh.appendRow(['(no audits logged yet)','','','','','','','','','','']);
    /* Stage summary */
    var ms = ss.insertSheet(com + ' — by stage');
    ms.appendRow(['Stage','Name','Responses','Mean %','Critical No','Visits']);
    Object.keys(C.modules).sort().forEach(function(k){ var M=C.modules[k]; ms.appendRow([M.code, M.name, M.n, M.n?Math.round(M.sum/M.n*100):'', M.critFail, M.visits]); });
    ms.appendRow([]); ms.appendRow(['Visits (audits)', C.visits, 'Practice photos', 'good '+C.photos.good, 'bad '+C.photos.bad, '']);
  });
  try { ss.deleteSheet(ss.getSheetByName('Sheet1')); } catch(e){}

  var reportsFolder = getOrCreateFolder('Reports', getDataFolder());
  var ssFile = DriveApp.getFileById(ss.getId());
  try { reportsFolder.addFile(ssFile); DriveApp.getRootFolder().removeFile(ssFile); } catch(e){}

  var rcp = loadRecipients() || {};
  var to = rcp.field_reports_to || (REPORT_EMAILS && REPORT_EMAILS[0]) || '';
  if (to) {
    var L = ['MCApp — value-chain training needs', '', 'Audits analysed: ' + audits.length, ''];
    var _vcUrl = vcReportUrl();
    if (_vcUrl) { L.push('View the live report (ranked priorities + good/bad practice photos):'); L.push('  ' + _vcUrl); L.push(''); }
    Object.keys(byCommodity).forEach(function(com){
      var C = byCommodity[com];
      var items = Object.keys(C.items).map(function(k){ var it=C.items[k]; it.mean=it.n?it.sum/it.n:0; it.shortfall=1-it.mean; return it; })
                    .sort(function(a,b){ return (b.shortfall-a.shortfall)||(b.n-a.n); });
      L.push(com.toUpperCase() + ' — ' + C.visits + ' audits. Top training priorities:');
      items.slice(0,8).forEach(function(it,i){ L.push('  ' + (i+1) + '. ' + it.code + ' ' + it.item + ' — ' + Math.round(it.mean*100) + '% (' + it.n + ' obs)'); });
      if (!items.length) L.push('  (no items scored yet)');
      L.push('');
    });
    L.push('A spreadsheet appendix (per item + per stage) is in the Reports folder on Drive.');
    try { MailApp.sendEmail(to, 'MCApp — value-chain training needs (' + _pngDate(new Date(),'d MMM yyyy') + ')', L.join('\n')); } catch(e){}
  }
  return { status:'ok', audits: audits.length };
}
function installVcTrainingNeedsTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t){ if (t.getHandlerFunction()==='vcTrainingNeedsReport') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('vcTrainingNeedsReport').timeBased().onMonthDay(1).atHour(8).create();
}

function installAllReportTriggers() {
  var jobs = [
    ['Distribution',     installMonthlyDistributionTrigger],
    ['Livelihood',       installLivelihoodReportsTrigger],
    ['Local prices',     installLocalPricesTrigger],
    ['Consultant',       installConsultantReportsTrigger],
    ['Field officer',    installFieldOfficerReportsTrigger],
    ['Clan compliance',  installClanComplianceTrigger],
    ['Annual compliance',installAnnualComplianceTrigger],
    ['Water quality',    installWaterQualityTrigger],
    ['Upload activity',  installUploadActivityTrigger],
    ['Field maps',       installFreemapExportTrigger],
    ['No-attendance digest', installVerificationDigestTrigger],
    ['VC training needs', installVcTrainingNeedsTrigger]
  ];
  var done = [], failed = [];
  jobs.forEach(function(j){
    try { j[1](); done.push(j[0]); }
    catch (e) { failed.push(j[0] + ' (' + e + ')'); }
  });
  Logger.log('Report triggers installed: ' + done.length + ' ok' + (failed.length ? (', ' + failed.length + ' failed: ' + failed.join(', ')) : ''));
  return { status:'ok', installed: done, failed: failed };
}
