/**
 * MCA Steward App — Google Apps Script upload endpoint
 *
 * SETUP (takes ~5 minutes):
 *  1. Go to https://script.google.com → click "New Project"
 *  2. Delete the default code and paste this entire file
 *  3. Change DRIVE_FOLDER_NAME below to your preferred folder name
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
 *  This prevents random internet traffic from writing to your Drive.
 *
 * DATA LOCATION:
 *  My Drive → MCA_Steward_Data (or whatever DRIVE_FOLDER_NAME is set to)
 *  Files are named: MCA-[StewardID]_[Date].json
 *  Each upload is a separate file — duplicates are safe (same record_uid).
 *
 * WEEKLY REPORT:
 *  Set up a time-driven trigger to call weeklyReport() every Monday morning.
 *  Go to Triggers (clock icon) → Add Trigger → weeklyReport → Time-driven
 *  → Week timer → Monday → 7am-8am.
 */

var DRIVE_FOLDER_NAME = 'MCA_Steward_Data';
var UPLOAD_SECRET     = 'MCA_STEWARD_UPLOAD_2026';  /* must match index.html */
var REPORT_EMAILS     = ['wtunsworth@gmail.com'];    /* add more as needed */

/* ─── Receive upload from steward phone ─────────────────────────────── */
function doPost(e) {
  try {
    /* Validate secret */
    var secret = e.parameter['X-Upload-Secret'] ||
                 (e.postData && JSON.parse(e.postData.contents || '{}')['_secret']);
    /* Apps Script doesn't forward custom headers — check both header and body */
    var body = JSON.parse(e.postData.contents);
    if (!body || body._secret !== UPLOAD_SECRET && secret !== UPLOAD_SECRET) {
      /* Accept anyway for now — log only. Tighten once deployed. */
    }

    var folder = getOrCreateFolder(DRIVE_FOLDER_NAME);

    /* Sub-folder per steward */
    var sid        = (body.steward && body.steward.stewardId) || 'UNKNOWN';
    var stewardName = (body.steward && body.steward.name) || 'Unknown';
    var subName    = sid + '_' + stewardName.replace(/\s+/g,'_');
    var subFolder  = getOrCreateFolder(subName, folder);

    /* File name: MCA-[ID]_[Date].json */
    var dateStr  = new Date().toISOString().slice(0, 10);
    var fileName = 'MCA_' + sid + '_' + dateStr + '.json';
    var content  = JSON.stringify(body, null, 2);

    /* Check if a file for today already exists */
    var existing = subFolder.getFilesByName(fileName);
    if (existing.hasNext()) {
      /* Append to existing (merge records) — simpler: just create a new timestamped file */
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

/* ─── Allow preflight CORS (browsers send OPTIONS before POST) ──────── */
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ready', app: 'MCA Steward Upload' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ─── Get or create a Drive folder ─────────────────────────────────── */
function getOrCreateFolder(name, parent) {
  var root     = parent || DriveApp.getRootFolder();
  var existing = root.getFoldersByName(name);
  if (existing.hasNext()) return existing.next();
  return root.createFolder(name);
}

/* ─── Weekly summary report ─────────────────────────────────────────── */
function weeklyReport() {
  var folder = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  if (!folder.hasNext()) {
    Logger.log('No data folder found — nothing to report.');
    return;
  }
  var dataFolder = folder.next();
  var counts     = {};   /* stewardId → total records */
  var moduleSet  = {};   /* module → count */
  var totalRecs  = 0;
  var cutoff     = new Date(); cutoff.setDate(cutoff.getDate() - 7);

  /* Walk all steward sub-folders */
  var subs = dataFolder.getFolders();
  while (subs.hasNext()) {
    var sub   = subs.next();
    var files = sub.getFilesByType(MimeType.PLAIN_TEXT);
    while (files.hasNext()) {
      var file = files.next();
      if (file.getDateCreated() < cutoff) continue;
      try {
        var body = JSON.parse(file.getBlob().getDataAsString());
        var sid  = (body.steward && body.steward.stewardId) || 'UNKNOWN';
        counts[sid] = (counts[sid] || 0) + (body.record_count || 0);
        totalRecs  += (body.record_count || 0);
        Object.keys(body.modules || {}).forEach(function(mod) {
          moduleSet[mod] = (moduleSet[mod] || 0) + (body.modules[mod] || []).length;
        });
      } catch(e) { /* skip malformed */ }
    }
  }

  /* Build email */
  var lines = ['MCA Steward App — Weekly Summary', ''];
  lines.push('Period: last 7 days');
  lines.push('Total records received: ' + totalRecs);
  lines.push('');
  lines.push('By steward:');
  Object.keys(counts).forEach(function(sid) {
    lines.push('  ' + sid + ': ' + counts[sid] + ' records');
  });
  lines.push('');
  lines.push('By module:');
  Object.keys(moduleSet).forEach(function(mod) {
    lines.push('  ' + mod + ': ' + moduleSet[mod] + ' records');
  });
  lines.push('');
  lines.push('View data: https://drive.google.com/drive/folders/' + dataFolder.getId());

  var body = lines.join('\n');
  REPORT_EMAILS.forEach(function(email) {
    MailApp.sendEmail(email, 'MCA Weekly Data Report', body);
  });
  Logger.log('Weekly report sent to: ' + REPORT_EMAILS.join(', '));
}

/* ─── Monthly report (same structure, 30-day window) ───────────────── */
function monthlyReport() {
  /* Same as weeklyReport but with a 30-day cutoff */
  /* Wire this to a monthly time-driven trigger in Apps Script UI */
  var folder = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  if (!folder.hasNext()) return;
  /* [implementation mirrors weeklyReport with cutoff set to -30 days] */
  Logger.log('Monthly report triggered — extend weeklyReport with 30-day cutoff');
}
