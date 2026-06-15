// ============================================================
// MCA Activity Tracker — Google Apps Script
// ============================================================
// Paste this entire file into your Google Apps Script editor
// (Extensions > Apps Script) and follow the setup guide.
// ============================================================

// ── Configuration ────────────────────────────────────────────
// Edit these values before running setupSheets() for the first time.

const CONFIG = {
  // Email address of the person who verifies progress entries
  VERIFIER_EMAIL: 'verifier@example.com',

  // Optional: CC address for verification emails (leave blank if not needed)
  NOTIFICATION_CC: '',

  // Web App URL — leave blank now; paste the URL here after you deploy
  // (Deploy > New deployment > Web app)
  WEB_APP_URL: '',

  // Sheet tab names — change only if you rename the tabs
  SHEET_FRAMEWORK: 'Framework',
  SHEET_ENTRIES: 'Progress_Entries',
  SHEET_VERIFIED: 'Verified',
};

// ── Column layout for Progress_Entries ───────────────────────
// These must match the headers created by setupSheets().
// Do not change these numbers unless you also change setupSheets().
const E = {
  ENTRY_ID:       1,
  TIMESTAMP:      2,
  SUBMITTED_BY:   3,
  SUBMITTED_EMAIL:4,
  ACTIVITY_CODE:  5,
  ACTIVITY_DESC:  6,
  PERIOD:         7,
  PROGRESS_VALUE: 8,
  UNIT:           9,
  NOTES:          10,
  STATUS:         11,   // PENDING | APPROVED | REJECTED
  VERIFIER_NOTES: 12,
  VERIFIED_BY:    13,
  VERIFIED_AT:    14,
};

// ── Column layout for Verified ────────────────────────────────
// Mirrors Progress_Entries (all 14 columns) so Looker Studio
// sees a clean, stable schema.
const V = { ...E };

// ── Column layout for Framework ───────────────────────────────
const F = {
  CODE:        1,
  LEVEL:       2,   // Goal | Outcome | Output | Activity
  DESCRIPTION: 3,
  INDICATOR:   4,
  BASELINE:    5,
  TARGET:      6,
  UNIT:        7,
  RESPONSIBLE: 8,
  TIMELINE:    9,
};


// ============================================================
// 1. FIRST-TIME SETUP
// Run this once from the Apps Script editor to create all tabs.
// ============================================================

function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  _createOrClearSheet(ss, CONFIG.SHEET_FRAMEWORK, [
    'Code', 'Level', 'Description', 'Indicator',
    'Baseline', 'Target', 'Unit', 'Responsible', 'Timeline',
  ]);

  _createOrClearSheet(ss, CONFIG.SHEET_ENTRIES, [
    'Entry ID', 'Timestamp', 'Submitted By', 'Submitted Email',
    'Activity Code', 'Activity Description', 'Period',
    'Progress Value', 'Unit', 'Notes / Evidence',
    'Status', 'Verifier Notes', 'Verified By', 'Verified At',
  ]);

  _createOrClearSheet(ss, CONFIG.SHEET_VERIFIED, [
    'Entry ID', 'Timestamp', 'Submitted By', 'Submitted Email',
    'Activity Code', 'Activity Description', 'Period',
    'Progress Value', 'Unit', 'Notes / Evidence',
    'Status', 'Verifier Notes', 'Verified By', 'Verified At',
  ]);

  // Freeze header row on all three sheets
  ['Framework', 'Progress_Entries', 'Verified'].forEach(name => {
    const sh = ss.getSheetByName(name);
    if (sh) sh.setFrozenRows(1);
  });

  // Protect the Verified sheet so only the script can write to it
  const verifiedSheet = ss.getSheetByName(CONFIG.SHEET_VERIFIED);
  if (verifiedSheet) {
    const protection = verifiedSheet.protect().setDescription('Managed by Apps Script');
    protection.removeEditors(protection.getEditors());
    protection.addEditor(Session.getEffectiveUser());
  }

  SpreadsheetApp.getUi().alert(
    'Setup complete.\n\n' +
    '1. Fill in the Framework tab with your activity hierarchy.\n' +
    '2. Deploy this script as a Web App (Deploy > New deployment).\n' +
    '3. Paste the Web App URL into CONFIG.WEB_APP_URL and save.\n' +
    '4. Install the onEdit trigger (see installTrigger function).'
  );
}

function _createOrClearSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  } else {
    sheet.clearContents();
  }
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#1B5E20')
    .setFontColor('#ffffff');
  return sheet;
}


// ============================================================
// 2. INSTALL TRIGGER
// Run this once to install the onEdit trigger.
// ============================================================

function installTrigger() {
  // Remove any existing onEdit triggers to avoid duplicates
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'onNewEntry')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('onNewEntry')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit()
    .create();

  SpreadsheetApp.getUi().alert('Trigger installed. New entries will now trigger verification emails.');
}


// ============================================================
// 3. ENTRY TRIGGER — fires when someone edits the spreadsheet
// ============================================================

function onNewEntry(e) {
  if (!e) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== CONFIG.SHEET_ENTRIES) return;

  const row = e.range.getRow();
  if (row <= 1) return; // header row

  // Only act when the Status column is blank (new, unprocessed entry)
  const statusCell = sheet.getRange(row, E.STATUS);
  if (statusCell.getValue() !== '') return;

  // Auto-fill entry metadata
  const entryId = _generateEntryId(row);
  sheet.getRange(row, E.ENTRY_ID).setValue(entryId);
  sheet.getRange(row, E.TIMESTAMP).setValue(new Date());
  sheet.getRange(row, E.STATUS).setValue('PENDING');

  // Look up the activity description from the Framework tab
  const activityCode = sheet.getRange(row, E.ACTIVITY_CODE).getValue();
  if (activityCode) {
    const desc = _lookupFrameworkDescription(activityCode);
    if (desc) sheet.getRange(row, E.ACTIVITY_DESC).setValue(desc);
  }

  // Send verification email
  _sendVerificationEmail(sheet, row, entryId);
}

function _generateEntryId(row) {
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmm');
  return `MCA-${timestamp}-R${row}`;
}

function _lookupFrameworkDescription(code) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const fwSheet = ss.getSheetByName(CONFIG.SHEET_FRAMEWORK);
  if (!fwSheet) return '';
  const data = fwSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][F.CODE - 1]).trim() === String(code).trim()) {
      return data[i][F.DESCRIPTION - 1];
    }
  }
  return '';
}


// ============================================================
// 4. EMAIL — sends approve / reject links to the verifier
// ============================================================

function _sendVerificationEmail(sheet, row, entryId) {
  if (!CONFIG.WEB_APP_URL) {
    Logger.log('WEB_APP_URL not set — skipping email. Configure CONFIG.WEB_APP_URL.');
    return;
  }

  const submittedBy   = sheet.getRange(row, E.SUBMITTED_BY).getValue();
  const submittedEmail= sheet.getRange(row, E.SUBMITTED_EMAIL).getValue();
  const activityCode  = sheet.getRange(row, E.ACTIVITY_CODE).getValue();
  const activityDesc  = sheet.getRange(row, E.ACTIVITY_DESC).getValue();
  const period        = sheet.getRange(row, E.PERIOD).getValue();
  const progressValue = sheet.getRange(row, E.PROGRESS_VALUE).getValue();
  const unit          = sheet.getRange(row, E.UNIT).getValue();
  const notes         = sheet.getRange(row, E.NOTES).getValue();

  const approveUrl = `${CONFIG.WEB_APP_URL}?action=approve&entryId=${encodeURIComponent(entryId)}`;
  const rejectUrl  = `${CONFIG.WEB_APP_URL}?action=reject&entryId=${encodeURIComponent(entryId)}`;

  const subject = `[MCA Tracker] New entry pending verification — ${activityCode} (${period})`;

  const body = `
A new progress entry has been submitted and requires your verification.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ENTRY DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Entry ID:        ${entryId}
Submitted by:    ${submittedBy} (${submittedEmail})
Activity code:   ${activityCode}
Activity:        ${activityDesc}
Reporting period:${period}
Progress:        ${progressValue} ${unit}
Notes / Evidence:
${notes || '(none provided)'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERIFY THIS ENTRY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ APPROVE:  ${approveUrl}

❌ REJECT:   ${rejectUrl}

If you are rejecting this entry, please reply to this email with
the reason so the submitter can be informed.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MCA Activity Tracker — automated message
`;

  const htmlBody = `
<div style="font-family:Arial,sans-serif;max-width:600px;color:#212121">
  <div style="background:#1B5E20;padding:16px 24px;border-radius:6px 6px 0 0">
    <h2 style="color:#fff;margin:0;font-size:18px">MCA Activity Tracker</h2>
    <p style="color:#C8E6C9;margin:4px 0 0;font-size:13px">New entry pending verification</p>
  </div>
  <div style="border:1px solid #ddd;border-top:none;padding:24px;border-radius:0 0 6px 6px">
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr><td style="padding:6px 0;color:#555;width:160px"><strong>Entry ID</strong></td><td>${entryId}</td></tr>
      <tr><td style="padding:6px 0;color:#555"><strong>Submitted by</strong></td><td>${submittedBy} (${submittedEmail})</td></tr>
      <tr><td style="padding:6px 0;color:#555"><strong>Activity code</strong></td><td>${activityCode}</td></tr>
      <tr><td style="padding:6px 0;color:#555"><strong>Activity</strong></td><td>${activityDesc}</td></tr>
      <tr><td style="padding:6px 0;color:#555"><strong>Period</strong></td><td>${period}</td></tr>
      <tr><td style="padding:6px 0;color:#555"><strong>Progress</strong></td><td>${progressValue} ${unit}</td></tr>
      <tr><td style="padding:6px 0;color:#555;vertical-align:top"><strong>Notes</strong></td><td>${notes || '<em>None provided</em>'}</td></tr>
    </table>
    <div style="margin-top:28px;display:flex;gap:16px">
      <a href="${approveUrl}" style="background:#2E7D32;color:#fff;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;display:inline-block;margin-right:12px">✅ Approve</a>
      <a href="${rejectUrl}" style="background:#C62828;color:#fff;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;display:inline-block">❌ Reject</a>
    </div>
    <p style="margin-top:20px;font-size:12px;color:#888">
      If rejecting, please also reply to this email with the reason so the submitter can be informed.
    </p>
  </div>
</div>`;

  const mailOptions = { htmlBody };
  if (CONFIG.NOTIFICATION_CC) mailOptions.cc = CONFIG.NOTIFICATION_CC;

  GmailApp.sendEmail(CONFIG.VERIFIER_EMAIL, subject, body, mailOptions);

  // Also notify the submitter that their entry is under review
  if (submittedEmail) {
    GmailApp.sendEmail(
      submittedEmail,
      `[MCA Tracker] Your entry is under review — ${activityCode} (${period})`,
      `Hi ${submittedBy},\n\nYour progress entry for ${activityCode} (${period}) has been received and sent to the verifier.\n\nEntry ID: ${entryId}\n\nYou will be notified once it has been reviewed.\n\nMCA Activity Tracker`
    );
  }
}


// ============================================================
// 5. WEB APP — handles approve / reject links from email
// ============================================================

function doGet(e) {
  const action  = e.parameter.action;
  const entryId = e.parameter.entryId;

  if (!action || !entryId) {
    return _htmlPage('Invalid request', 'Missing action or entry ID.');
  }

  if (action === 'approve') {
    return _handleApprove(entryId);
  }

  if (action === 'reject') {
    return _showRejectForm(entryId);
  }

  if (action === 'submitReject') {
    const reason = e.parameter.reason || '';
    return _handleReject(entryId, reason);
  }

  return _htmlPage('Unknown action', `Action "${action}" is not recognised.`);
}

function _handleApprove(entryId) {
  const result = _findEntryRow(entryId);
  if (!result) return _htmlPage('Not found', `Entry ${entryId} could not be found.`);

  const { sheet, row } = result;
  const currentStatus = sheet.getRange(row, E.STATUS).getValue();

  if (currentStatus !== 'PENDING') {
    return _htmlPage(
      'Already processed',
      `Entry ${entryId} has already been ${currentStatus.toLowerCase()}.`
    );
  }

  const verifierEmail = Session.getActiveUser().getEmail();
  sheet.getRange(row, E.STATUS).setValue('APPROVED');
  sheet.getRange(row, E.VERIFIED_BY).setValue(verifierEmail);
  sheet.getRange(row, E.VERIFIED_AT).setValue(new Date());
  sheet.getRange(row, E.STATUS).setBackground('#C8E6C9');

  _copyToVerified(sheet, row);
  _notifySubmitter(sheet, row, 'APPROVED', '');

  return _htmlPage(
    '✅ Entry approved',
    `Entry <strong>${entryId}</strong> has been approved and added to the dashboard.`
  );
}

function _showRejectForm(entryId) {
  const webAppUrl = ScriptApp.getService().getUrl();
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Reject Entry — MCA Tracker</title>
  <style>
    body{font-family:Arial,sans-serif;max-width:520px;margin:40px auto;padding:0 20px;color:#212121}
    h2{color:#C62828}
    label{display:block;font-weight:bold;margin-top:16px;margin-bottom:4px}
    textarea{width:100%;padding:10px;border:1px solid #ccc;border-radius:4px;font-size:14px;resize:vertical}
    button{background:#C62828;color:#fff;border:none;padding:12px 28px;border-radius:4px;font-size:14px;font-weight:bold;cursor:pointer;margin-top:16px}
    .entry-id{font-family:monospace;background:#f5f5f5;padding:4px 8px;border-radius:3px}
  </style>
</head>
<body>
  <h2>Reject Entry</h2>
  <p>Entry: <span class="entry-id">${entryId}</span></p>
  <form method="GET" action="${webAppUrl}">
    <input type="hidden" name="action" value="submitReject">
    <input type="hidden" name="entryId" value="${entryId}">
    <label for="reason">Reason for rejection (required — sent to the submitter):</label>
    <textarea id="reason" name="reason" rows="5" placeholder="e.g. Evidence not sufficient — please attach supporting documentation." required></textarea>
    <button type="submit">❌ Confirm Rejection</button>
  </form>
</body>
</html>`;
  return HtmlService.createHtmlOutput(html).setTitle('Reject Entry — MCA Tracker');
}

function _handleReject(entryId, reason) {
  const result = _findEntryRow(entryId);
  if (!result) return _htmlPage('Not found', `Entry ${entryId} could not be found.`);

  const { sheet, row } = result;
  const currentStatus = sheet.getRange(row, E.STATUS).getValue();

  if (currentStatus !== 'PENDING') {
    return _htmlPage(
      'Already processed',
      `Entry ${entryId} has already been ${currentStatus.toLowerCase()}.`
    );
  }

  const verifierEmail = Session.getActiveUser().getEmail();
  sheet.getRange(row, E.STATUS).setValue('REJECTED');
  sheet.getRange(row, E.VERIFIER_NOTES).setValue(reason);
  sheet.getRange(row, E.VERIFIED_BY).setValue(verifierEmail);
  sheet.getRange(row, E.VERIFIED_AT).setValue(new Date());
  sheet.getRange(row, E.STATUS).setBackground('#FFCDD2');

  _notifySubmitter(sheet, row, 'REJECTED', reason);

  return _htmlPage(
    '❌ Entry rejected',
    `Entry <strong>${entryId}</strong> has been rejected. The submitter has been notified.`
  );
}

function _findEntryRow(entryId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_ENTRIES);
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][E.ENTRY_ID - 1]) === String(entryId)) {
      return { sheet, row: i + 1 };
    }
  }
  return null;
}

function _copyToVerified(entriesSheet, row) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const verifiedSheet = ss.getSheetByName(CONFIG.SHEET_VERIFIED);
  if (!verifiedSheet) return;
  const rowData = entriesSheet.getRange(row, 1, 1, 14).getValues();
  verifiedSheet.appendRow(rowData[0]);
}

function _notifySubmitter(sheet, row, status, reason) {
  const submittedEmail = sheet.getRange(row, E.SUBMITTED_EMAIL).getValue();
  const submittedBy    = sheet.getRange(row, E.SUBMITTED_BY).getValue();
  const activityCode   = sheet.getRange(row, E.ACTIVITY_CODE).getValue();
  const period         = sheet.getRange(row, E.PERIOD).getValue();
  const entryId        = sheet.getRange(row, E.ENTRY_ID).getValue();

  if (!submittedEmail) return;

  if (status === 'APPROVED') {
    GmailApp.sendEmail(
      submittedEmail,
      `[MCA Tracker] Entry approved — ${activityCode} (${period})`,
      `Hi ${submittedBy},\n\nYour progress entry has been approved and now appears on the dashboard.\n\nEntry ID: ${entryId}\nActivity: ${activityCode}\nPeriod: ${period}\n\nMCA Activity Tracker`
    );
  } else {
    GmailApp.sendEmail(
      submittedEmail,
      `[MCA Tracker] Entry returned for revision — ${activityCode} (${period})`,
      `Hi ${submittedBy},\n\nYour progress entry could not be approved at this time.\n\nEntry ID: ${entryId}\nActivity: ${activityCode}\nPeriod: ${period}\n\nReason:\n${reason}\n\nPlease update your entry and resubmit.\n\nMCA Activity Tracker`
    );
  }
}

function _htmlPage(title, message) {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} — MCA Tracker</title>
  <style>
    body{font-family:Arial,sans-serif;max-width:520px;margin:60px auto;padding:0 20px;color:#212121;text-align:center}
    h2{color:#1B5E20;margin-bottom:12px}
    .card{border:1px solid #ddd;border-radius:8px;padding:32px;background:#fafafa}
  </style>
</head>
<body>
  <div class="card">
    <h2>${title}</h2>
    <p>${message}</p>
  </div>
</body>
</html>`;
  return HtmlService.createHtmlOutput(html).setTitle(title);
}


// ============================================================
// 6. UTILITIES
// ============================================================

// Run this from the editor to resync any approved entries that
// may be missing from the Verified sheet (e.g. after a reset).
function resyncVerified() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const entriesSheet  = ss.getSheetByName(CONFIG.SHEET_ENTRIES);
  const verifiedSheet = ss.getSheetByName(CONFIG.SHEET_VERIFIED);
  if (!entriesSheet || !verifiedSheet) return;

  // Clear Verified data rows (keep header)
  const lastRow = verifiedSheet.getLastRow();
  if (lastRow > 1) verifiedSheet.getRange(2, 1, lastRow - 1, 14).clearContent();

  const data = entriesSheet.getDataRange().getValues();
  const approvedRows = data.filter((row, i) => i > 0 && row[E.STATUS - 1] === 'APPROVED');
  if (approvedRows.length > 0) {
    verifiedSheet.getRange(2, 1, approvedRows.length, 14).setValues(approvedRows);
  }

  SpreadsheetApp.getUi().alert(`Resync complete. ${approvedRows.length} approved entries written to Verified tab.`);
}

// Returns a summary count for quick status check
function getStatusSummary() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_ENTRIES);
  if (!sheet) return;
  const data = sheet.getDataRange().getValues().slice(1);
  const counts = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
  data.forEach(row => {
    const status = row[E.STATUS - 1];
    if (counts[status] !== undefined) counts[status]++;
  });
  SpreadsheetApp.getUi().alert(
    `Status summary:\n✅ Approved: ${counts.APPROVED}\n⏳ Pending: ${counts.PENDING}\n❌ Rejected: ${counts.REJECTED}`
  );
}
