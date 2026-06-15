# MCA Activity Tracker — Setup Guide

A lightweight progress-tracking system built on Google Sheets + Apps Script + Looker Studio.

**How it works:**
1. Your activity hierarchy lives in a Google Sheet (`Framework` tab)
2. Team members enter progress updates in the `Progress_Entries` tab
3. Each entry triggers a verification email to the designated verifier
4. Verifier clicks **Approve** or **Reject** in the email
5. Approved entries automatically flow to the `Verified` tab
6. Google Looker Studio reads from `Verified` to power the dashboard

---

## Step 1 — Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new blank spreadsheet
2. Name it **MCA Activity Tracker**
3. Share it with all team members who will enter progress (give them **Editor** access)

---

## Step 2 — Add the Apps Script

1. In the spreadsheet, click **Extensions → Apps Script**
2. Delete any placeholder code in the editor
3. Paste the entire contents of `Code.gs` (from this folder) into the editor
4. Click **Save** (floppy disk icon)

---

## Step 3 — Configure

At the top of `Code.gs`, edit the `CONFIG` block:

```javascript
const CONFIG = {
  VERIFIER_EMAIL: 'your-verifier@example.com',  // ← change this
  NOTIFICATION_CC: '',                            // optional CC address
  WEB_APP_URL: '',                               // leave blank for now
  SHEET_FRAMEWORK: 'Framework',
  SHEET_ENTRIES: 'Progress_Entries',
  SHEET_VERIFIED: 'Verified',
};
```

---

## Step 4 — Run first-time setup

1. In the Apps Script editor, select `setupSheets` from the function dropdown
2. Click **Run**
3. Approve the permissions prompt (the script needs access to Gmail and the Sheet)
4. Three tabs are created: `Framework`, `Progress_Entries`, `Verified`

---

## Step 5 — Import your activity framework

Two options:

**Option A — Use the template CSV**
1. Open `framework_template.csv` (in this folder) in a text editor or Excel
2. Copy the data rows and paste them into the `Framework` tab starting at row 2
3. Edit to match your actual project framework

**Option B — Paste directly**
Fill the `Framework` tab manually using these columns:

| Column | Description |
|---|---|
| Code | Hierarchical code (e.g. `1.2.1.1`) |
| Level | `Goal`, `Outcome`, `Output`, or `Activity` |
| Description | Full text description |
| Indicator | How progress is measured |
| Baseline | Starting value |
| Target | End-of-project target |
| Unit | Unit of measure (e.g. `%`, `workshops`, `records`) |
| Responsible | Person or role responsible |
| Timeline | Deadline or frequency |

**Tip:** Only `Activity`-level rows need regular progress entries. `Goal`, `Outcome`, and `Output` rows are used as reference and for Looker Studio grouping.

---

## Step 6 — Deploy the Web App (for email approve/reject links)

1. In Apps Script, click **Deploy → New deployment**
2. Click the gear icon next to "Select type" and choose **Web app**
3. Set:
   - **Description:** MCA Tracker Verifier
   - **Execute as:** Me
   - **Who has access:** Anyone with Google Account *(or "Anyone" if verifiers don't have Google accounts — see note below)*
4. Click **Deploy** and copy the Web App URL
5. Paste the URL into `CONFIG.WEB_APP_URL` in the script
6. Click **Save**, then **Deploy → Manage deployments → Update** (to apply the config change)

> **Note on access:** If your verifier(s) have Google accounts, choose "Anyone with Google Account" for better security. If not, choose "Anyone" — the entry ID in the URL provides basic protection against guessing.

---

## Step 7 — Install the trigger

1. In Apps Script, select `installTrigger` from the function dropdown
2. Click **Run**
3. The trigger is now installed — new rows in `Progress_Entries` will automatically fire the verification email

---

## Step 8 — How team members enter progress

Share this with your team:

1. Open the spreadsheet (they need Editor access)
2. Go to the **Progress_Entries** tab
3. Add a new row — fill in:

| Column | What to enter |
|---|---|
| Submitted By | Your full name |
| Submitted Email | Your email address (for notifications) |
| Activity Code | The code from the Framework tab (e.g. `1.2.1.2`) |
| Period | Reporting period (e.g. `Q2 2026` or `June 2026`) |
| Progress Value | The number (e.g. `47`) |
| Unit | The unit (e.g. `assessments` — should match the Framework) |
| Notes / Evidence | Brief description + any supporting detail |

- Leave all other columns blank — the script fills them in automatically
- You'll receive an email confirming your entry is under review
- You'll receive another email when it is approved or returned

---

## Step 9 — Connect Google Looker Studio

1. Go to [lookerstudio.google.com](https://lookerstudio.google.com)
2. Click **Create → Report**
3. Choose **Google Sheets** as the data source
4. Select your **MCA Activity Tracker** spreadsheet → **Verified** tab
5. Enable "Use first row as headers" → click **Connect**
6. Build your dashboard:

### Recommended charts

| Chart type | Fields | Use |
|---|---|---|
| Scorecard | Count of rows | Total verified entries |
| Bar chart | Activity Code (dimension) / Progress Value (metric) | Progress per activity |
| Table | All fields | Full entry log |
| Pie / Donut | Level (Goal/Outcome/Output/Activity) | Breakdown by level |
| Time series | Verified At (date) / Count | Submission rate over time |

### Recommended filters

Add filter controls for:
- **Period** (e.g. Q1, Q2)
- **Level** (filter to Activities only for detail view)
- **Responsible** (filter by team member or zone)

### Connecting the Framework tab as a second data source

To show targets alongside actuals:
1. Add another data source in Looker Studio → same spreadsheet → **Framework** tab
2. Blend the two sources on the `Activity Code` field
3. Add **Target** as a comparison metric in your bar charts

---

## Maintenance

### Resyncing the Verified tab

If the `Verified` tab ever gets out of sync, run `resyncVerified()` from the Apps Script editor to rebuild it from all approved entries in `Progress_Entries`.

### Updating the Web App after config changes

Any time you change `CONFIG` in the script, go to **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**.

### Checking entry status

Run `getStatusSummary()` from the Apps Script editor to see a count of Pending / Approved / Rejected entries.

---

## File index

| File | Purpose |
|---|---|
| `Code.gs` | Google Apps Script — paste into Extensions > Apps Script |
| `framework_template.csv` | Sample activity hierarchy — paste into the Framework tab |
| `README.md` | This setup guide |
