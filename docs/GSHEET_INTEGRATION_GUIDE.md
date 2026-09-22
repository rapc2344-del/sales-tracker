# Attendance & Salary Tracker: Google Sheet Integration Guide

This guide walks you through setting up automated sync between your sales tracker system and your Google Sheet **"Attendance and Salary Tracker"**.

---

## 📋 Overview

```
[ Your Shift Tracker ] 
       │
       ▼ (End of Shift / Save Summary)
[ Automated Sender Code ] 
       │
       ▼ (Secure JSON POST with Secret Key & Retries)
[ Google Apps Script Receiver (Web App) ]
       │
       ├── Updates Header (D1, D2, D3, G2, G3, H2) [Only on new cutoff]
       ├── Checks for duplicates (skips if Date + Client already exist)
       ├── Appends row to Columns A–F (Row 7 to 100)
       └── PRESERVES FORMULAS in Columns G & H (never touched)
```

---

## 🚀 Step 1: Install the Receiver in Google Sheets

1. Open your Google Sheet: **Attendance and Salary Tracker**
2. In the top menu bar, click **Extensions** > **Apps Script**.
3. A new tab will open with a code editor. If there is any existing code (like `function myFunction() {}`), delete it so the editor is blank.
4. Open the file [`google-apps-script/Code.gs`](../google-apps-script/Code.gs) in this project.
5. Copy the entire content of `Code.gs` and paste it into the Google Apps Script editor.
6. At the top of the code, find the `CONFIG` section and choose your secret passphrase:
   ```javascript
   const CONFIG = {
     WEB_APP_SECRET: "your-secret-password-here", // <-- Change to your own password
     ...
   ```
7. Press `Ctrl + S` (or click the floppy disk icon) to save the project. You can rename the project to **"Attendance Receiver"** at the top left.

---

## 🌐 Step 2: Deploy as a Web App

1. In the upper right corner of the Apps Script editor, click the blue **Deploy** button > **New deployment**.
2. Click the gear icon ⚙️ next to "Select type" and choose **Web app**.
3. Configure the deployment settings:
   - **Description**: `Attendance & Sales Receiver v1`
   - **Execute as**: `Me (your-email@gmail.com)` *(Important!)*
   - **Who has access**: `Anyone` *(Important! This allows your local system to push data without OAuth prompts)*
4. Click **Deploy**.
5. Google will ask you to authorize permissions:
   - Click **Authorize access**.
   - Select your Google account.
   - If Google displays *"Google hasn't verified this app"*, click **Advanced** (small text in bottom left) > click **Go to Untitled project (unsafe)**.
   - Click **Allow**.
6. Once authorized, Google will show you a dialog with your **Web app URL**:
   - It will look like: `https://script.google.com/macros/s/AKfycb.../exec`
   - Click **Copy** to copy this URL.

> [!TIP]
> Whenever you edit the script in Google Sheets in the future, you must update the deployment:
> Click **Deploy** > **Manage deployments** > click the ✏️ edit icon > select **New version** in the dropdown > click **Deploy**.

---

## ⚙️ Step 3: Configure Your System Environment

Open your `.env.local` file in this project and paste your Web App URL and the secret you set in Step 1:

```env
# Google Sheet Attendance & Salary Tracker Integration
GSHEET_WEBAPP_URL=https://script.google.com/macros/s/AKfycb.../exec
GSHEET_SECRET=your-secret-password-here

# Shift Defaults
CHATTER_NAME=Raphael
CHATTER_CLIENT=Nadya
CHATTER_SCHEDULE=0:00 AM CET - 8:00 AM CET
CHATTER_CLOCK_IN=0:00 AM CET
CHATTER_CLOCK_OUT=8:00 AM CET
CHATTER_HOURS=8
CHATTER_PAYMENT=union bank
```

---

## 🧪 Step 4: Test with 1 Sample Row Before Going Live

We have built a dedicated test script that tests pushing 1 single sample row to your Google Sheet without touching production data:

### Run the test:
```powershell
node scripts/test-sheet-sync.mjs
```

### What you will see:
- If everything is configured correctly, the terminal will show:
  ```
  HTTP Status: 200 OK
  🎉 TEST SUCCEEDED!
  - Rows added:   1
  - Rows skipped: 0
  ```
- Now switch to your Google Sheet! You will see the sample row added at row 7:
  - **Col A (Date)**: `8/30/2026`
  - **Col B (Client)**: `Nadya`
  - **Col C (Clock-In)**: `0:00 AM CET`
  - **Col D (Clock-Out)**: `8:00 AM CET`
  - **Col E (Hours)**: `8`
  - **Col F (Sales)**: `$349.66`
  - **Col G & H (Formulas)**: Automatically calculated your Daily Salary and Expected Salary without being overwritten!

### Testing Duplicate Prevention:
Run the same command again:
```powershell
node scripts/test-sheet-sync.mjs
```
The script will detect that `8/30/2026` for `Nadya` already exists, and will safely report:
```
- Rows added:   0
- Rows skipped: 1 (Duplicate detected!)
```

### Testing Security / Wrong Secret Rejection:
To verify that unauthorized requests cannot write to your sheet:
```powershell
node scripts/test-sheet-sync.mjs --test-auth
```
Result:
```
✅ SUCCESS: The web app correctly rejected the invalid secret!
```

---

## 🔄 Step 5: How Automatic Daily Shift Sync Works

Once `.env.local` is set up with your `GSHEET_WEBAPP_URL`, sync is completely automatic:

1. During your shift, log purchases and sales as usual in the Sales Tracker.
2. At the end of your shift, click **Save (.xlsx)** on the dashboard.
3. The system automatically:
   - Exports your `.xlsx` backup.
   - Saves the shift summary snapshot to your database.
   - **Immediately sends today's date, client, hours, and total sales into your Google Sheet!**
   - If a network blip occurs, the system automatically retries up to 3 times with exponential backoff.
4. If it is the first day of a cutoff period (e.g. Aug 24 or Sep 8), the system also automatically updates the Cutoff Header block (Raphael, Nadya, Schedule, Dates, Payment).

---

## 🛠️ What to Change if Your Sheet Layout Differs

All sheet layout configurations are centralized at the top of [`google-apps-script/Code.gs`](../google-apps-script/Code.gs):

```javascript
const CONFIG = {
  // If your sheet tab is named something specific, put it here (or leave empty for active sheet):
  SHEET_NAME: "",

  // Cell addresses for the header block:
  HEADER_CELLS: {
    chatter: "D1",    // Chatter Name
    client: "D2",     // Client(s)
    schedule: "D3",   // Schedule
    startDate: "G2",  // Cutoff Start Date
    endDate: "G3",    // Cutoff End Date
    payment: "H2"     // Payment Method
  },

  // Range boundaries for entries:
  DATA_START_ROW: 7,   // Data rows start at row 7
  DATA_MAX_ROW: 100,   // Maximum allowed row
  NUM_DATA_COLS: 6,    // Writes strictly to Columns A through F
};
```

If your header labels are in different cells, just change the cell letters (e.g. `"D1"`, `"G2"`, etc.) in `CONFIG.HEADER_CELLS`.

---

## ❓ Troubleshooting

| Issue | Cause | Fix |
|---|---|---|
| `Unauthorized: Invalid secret key` | The secret in `.env.local` does not match `WEB_APP_SECRET` in `Code.gs`. | Ensure `GSHEET_SECRET` in `.env.local` matches `WEB_APP_SECRET` in `Code.gs` exactly. |
| `HTTP 404 / Script not found` | The URL was copied incorrectly or deployment was deleted. | Copy the Web App URL from Apps Script: **Deploy > Manage deployments**. |
| `Authorization required / HTML login page returned` | "Who has access" was set to "Only myself" instead of "Anyone". | Go to Apps Script > **Deploy > Manage deployments > Edit > Who has access > Anyone > Deploy**. |
| `Sheet is full` | Rows 7 to 100 have reached maximum capacity (100 rows). | Clear rows or send with `"reset": true` for a new cutoff period. |
| Formulas disappeared | Someone manually cleared columns G or H in Google Sheets. | The script never touches columns G and H. If someone cleared them, re-drag the formula down from row 6 or 7. |
