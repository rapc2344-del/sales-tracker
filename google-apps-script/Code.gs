/**
 * ============================================================================
 * GOOGLE APPS SCRIPT RECEIVER: Attendance & Salary Tracker
 * ============================================================================
 * 
 * DESCRIPTION:
 * This script runs as a Google Sheets Web App. It receives attendance and sales
 * data sent from your system via JSON POST and writes it into this sheet.
 * 
 * FEATURES:
 * 1. Secret Key authentication to protect your sheet from unauthorized access.
 * 2. Updates the Cutoff Header block (Chatter, Client, Schedule, Dates, Payment).
 * 3. Optional "reset" flag to clear previous cutoff entries (A7:F100 only).
 * 4. Appends rows starting at row 7 into columns A through F.
 * 5. PRESERVES FORMULAS in Columns G and H (Daily Salary & Expected Salary).
 * 6. Target Tab Selection: Write to a specific tab name (e.g. "9/21/2026").
 * 7. DUPLICATE TAB CREATION: If a duplicate is detected, automatically creates
 *    another tab named after the date (e.g. mm/dd/yyyy) with the exact same
 *    layout and formulas, and writes the data there!
 * 
 * ============================================================================
 * DEPLOYMENT INSTRUCTIONS (STEP-BY-STEP):
 * ============================================================================
 * 1. Open your Google Sheet ("Attendance and Salary Tracker").
 * 2. In the top menu, click: Extensions > Apps Script.
 * 3. Delete any code already in the editor and paste THIS ENTIRE FILE.
 * 4. Update the "WEB_APP_SECRET" in the CONFIG below to your own secret password.
 * 5. Click the floppy disk icon ("Save project") or press Ctrl + S.
 * 6. Click the blue "Deploy" button at the top right > "Manage deployments"
 *    (or "New deployment" if first time).
 * 7. If updating an existing deployment:
 *      - Click the ✏️ Edit icon next to Web app.
 *      - Under Version, select "New version".
 *      - Click "Deploy".
 * ============================================================================
 */

// ── CONFIGURATION ───────────────────────────────────────────────────────────
const CONFIG = {
  // Shared secret password (must match GSHEET_SECRET in your system)
  WEB_APP_SECRET: "aqaedauaavninbngeewiproahbtlatar",

  // Default sheet tab name. Leave as "" to use the first/active sheet.
  SHEET_NAME: "",

  // Cell addresses for the header block (Rows 1 to 3)
  HEADER_CELLS: {
    chatter: "D1",    // Chatter Name
    client: "D2",     // Client(s)
    schedule: "D3",   // Schedule(s) (e.g. 0:00 AM CET - 8:00 AM CET)
    startDate: "G2",  // Cutoff Start Date (e.g. August 23, 2026)
    endDate: "G3",    // Cutoff End Date (e.g. September 7, 2026)
    payment: "H2"     // Payment Method (e.g. union bank)
  },

  // Range boundaries for data rows
  DATA_START_ROW: 7,   // Data entries start at row 7
  DATA_MAX_ROW: 100,   // Maximum row to write data into
  NUM_DATA_COLS: 6,    // Columns A to F only (A=1, B=2, C=3, D=4, E=5, F=6)
};

/**
 * Main Web App entry point for POST requests.
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    return createJsonResponse(false, "Server is busy. Please retry in a few seconds.", { code: "SERVER_BUSY" });
  }

  try {
    // 1. Parse incoming JSON request
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse(false, "Bad Request: Missing request body. JSON payload expected.", { code: "EMPTY_BODY" });
    }

    let payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return createJsonResponse(false, "Bad Request: Malformed JSON payload.", { code: "INVALID_JSON" });
    }

    // 2. Secret authentication check
    if (!payload.secret || payload.secret !== CONFIG.WEB_APP_SECRET) {
      return createJsonResponse(false, "Unauthorized: Invalid or missing secret key.", { code: "UNAUTHORIZED" });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // 3. Resolve Target Sheet Tab (e.g. "9/21/2026")
    // If no tab is specified, automatically use the date from the rows or today's date!
    let targetTabName = "";
    if (payload.targetTab && String(payload.targetTab).trim() !== "") {
      targetTabName = String(payload.targetTab).trim();
    } else if (CONFIG.SHEET_NAME && CONFIG.SHEET_NAME.trim() !== "") {
      targetTabName = CONFIG.SHEET_NAME.trim();
    } else if (Array.isArray(payload.rows) && payload.rows.length > 0 && payload.rows[0].date) {
      targetTabName = formatCellDate(payload.rows[0].date);
    } else {
      targetTabName = formatCellDate(new Date());
    }

    let sheet = ss.getSheetByName(targetTabName);
    let tabCreatedForDate = false;

    // If the tab for the target date DOES NOT EXIST, automatically create it by duplicating the template!
    if (!sheet) {
      const templateSheet = (CONFIG.SHEET_NAME ? ss.getSheetByName(CONFIG.SHEET_NAME) : null) || ss.getSheets()[0];
      sheet = templateSheet.copyTo(ss);
      sheet.setName(targetTabName);
      ss.setActiveSheet(sheet);
      tabCreatedForDate = true;

      // Clear previous data in A7:F100 on the newly created tab
      // Columns G & H formulas and rows 1-6 are perfectly preserved!
      const numRowsToClear = CONFIG.DATA_MAX_ROW - CONFIG.DATA_START_ROW + 1;
      sheet.getRange(CONFIG.DATA_START_ROW, 1, numRowsToClear, CONFIG.NUM_DATA_COLS).clearContent();
    }


    // 4. Optional: Reset data range for a new cutoff period
    // WARNING: Clears ONLY columns A through F from row 7 to 100.
    // Rows 1-6 and Columns G-H (formulas) are NEVER touched!
    if (payload.reset === true) {
      const numRowsToClear = CONFIG.DATA_MAX_ROW - CONFIG.DATA_START_ROW + 1;
      sheet.getRange(CONFIG.DATA_START_ROW, 1, numRowsToClear, CONFIG.NUM_DATA_COLS).clearContent();
    }

    // 5. Optional: Update Cutoff Header block
    if (payload.header && typeof payload.header === "object") {
      updateHeaderCells(sheet, payload.header);
    }

    // 6. Check for duplicates in incoming rows
    let addedCount = 0;
    let skippedCount = 0;
    const skippedReasons = [];

    if (Array.isArray(payload.rows) && payload.rows.length > 0) {
      const numRows = CONFIG.DATA_MAX_ROW - CONFIG.DATA_START_ROW + 1;
      const existingRangeValues = sheet.getRange(CONFIG.DATA_START_ROW, 1, numRows, CONFIG.NUM_DATA_COLS).getValues();

      const existingKeys = new Set();
      let firstEmptyIndex = -1;

      for (let i = 0; i < existingRangeValues.length; i++) {
        const rowVal = existingRangeValues[i];
        const dateVal = formatCellDate(rowVal[0]);
        const clientVal = String(rowVal[1] || "").trim().toLowerCase();

        const isRowEmpty = isBlank(rowVal[0]) && isBlank(rowVal[1]) && isBlank(rowVal[2]);

        if (!isRowEmpty) {
          if (dateVal && clientVal) {
            existingKeys.add(dateVal + "___" + clientVal);
          }
        } else if (firstEmptyIndex === -1) {
          firstEmptyIndex = i;
        }
      }

      if (firstEmptyIndex === -1) {
        firstEmptyIndex = existingRangeValues.length;
      }

      // Check if any incoming row is a duplicate
      let hasDuplicates = false;
      let firstDuplicateDate = "";
      for (let r = 0; r < payload.rows.length; r++) {
        const item = payload.rows[r];
        const dateStr = formatCellDate(item.date);
        const clientKey = String(item.client || "").trim().toLowerCase();
        if (dateStr && clientKey && existingKeys.has(dateStr + "___" + clientKey)) {
          hasDuplicates = true;
          firstDuplicateDate = dateStr;
          break;
        }
      }

      // ── DUPLICATE TAB CREATION LOGIC ──
      // If duplicates are detected and new tab creation is enabled (default true):
      const createNewTabOnDup = payload.createTabIfDuplicate !== false;

      if (hasDuplicates && createNewTabOnDup) {
        // Determine the new tab name (e.g. mm/dd/yyyy)
        let baseTabName = payload.newTabName || firstDuplicateDate || formatCellDate(new Date());
        let finalTabName = getUniqueSheetName(ss, baseTabName);

        // Duplicate the current sheet to preserve all layouts, styles, and formulas in G & H!
        const newSheet = sheet.copyTo(ss);
        newSheet.setName(finalTabName);

        // Clear data rows A7:F100 on the new tab
        const numRowsToClear = CONFIG.DATA_MAX_ROW - CONFIG.DATA_START_ROW + 1;
        newSheet.getRange(CONFIG.DATA_START_ROW, 1, numRowsToClear, CONFIG.NUM_DATA_COLS).clearContent();

        // Update header on new tab if provided
        if (payload.header && typeof payload.header === "object") {
          updateHeaderCells(newSheet, payload.header);
        }

        // Write all rows to the new tab
        let targetRow = CONFIG.DATA_START_ROW;
        for (let r = 0; r < payload.rows.length; r++) {
          if (targetRow > CONFIG.DATA_MAX_ROW) break;

          const item = payload.rows[r];
          const rowData = [
            item.date !== undefined && item.date !== null ? item.date : "",
            String(item.client || "").trim(),
            item.clockIn !== undefined && item.clockIn !== null ? String(item.clockIn).trim() : "",
            item.clockOut !== undefined && item.clockOut !== null ? String(item.clockOut).trim() : "",
            item.hours !== undefined && item.hours !== null ? Number(item.hours) : "",
            item.sales !== undefined && item.sales !== null ? Number(item.sales) : 0
          ];

          newSheet.getRange(targetRow, 1, 1, CONFIG.NUM_DATA_COLS).setValues([rowData]);
          addedCount++;
          targetRow++;
        }

        return createJsonResponse(true, "Duplicate detected. Created new tab '" + finalTabName + "' and added rows there.", {
          createdNewTab: true,
          tabName: finalTabName,
          added: addedCount,
          skipped: 0,
          reset: false,
          headerUpdated: Boolean(payload.header)
        });
      }

      // Standard row append logic (when not creating a new duplicate tab)
      let currentTargetRow = CONFIG.DATA_START_ROW + firstEmptyIndex;

      for (let r = 0; r < payload.rows.length; r++) {
        const item = payload.rows[r];

        const dateStr = formatCellDate(item.date);
        const clientStr = String(item.client || "").trim();
        const clientKey = clientStr.toLowerCase();
        const dedupeKey = dateStr + "___" + clientKey;

        if (dateStr && clientKey && existingKeys.has(dedupeKey)) {
          skippedCount++;
          skippedReasons.push("Duplicate date & client: " + dateStr + " (" + clientStr + ")");
          continue;
        }

        if (currentTargetRow > CONFIG.DATA_MAX_ROW) {
          return createJsonResponse(false, "Sheet is full: Reached maximum row " + CONFIG.DATA_MAX_ROW + ".", {
            code: "SHEET_FULL",
            tabName: sheet.getName(),
            added: addedCount,
            skipped: skippedCount + (payload.rows.length - r),
            skippedReasons: skippedReasons
          });
        }

        const rowData = [
          item.date !== undefined && item.date !== null ? item.date : "",
          clientStr,
          item.clockIn !== undefined && item.clockIn !== null ? String(item.clockIn).trim() : "",
          item.clockOut !== undefined && item.clockOut !== null ? String(item.clockOut).trim() : "",
          item.hours !== undefined && item.hours !== null ? Number(item.hours) : "",
          item.sales !== undefined && item.sales !== null ? Number(item.sales) : 0
        ];

        sheet.getRange(currentTargetRow, 1, 1, CONFIG.NUM_DATA_COLS).setValues([rowData]);

        if (dateStr && clientKey) {
          existingKeys.add(dedupeKey);
        }

        addedCount++;
        currentTargetRow++;
      }
    }

    return createJsonResponse(true, "Successfully processed request.", {
      tabName: sheet.getName(),
      createdNewTab: tabCreatedForDate,
      added: addedCount,
      skipped: skippedCount,
      skippedReasons: skippedReasons,
      reset: payload.reset === true,
      headerUpdated: Boolean(payload.header)
    });


  } catch (error) {
    return createJsonResponse(false, "Internal Error: " + error.toString(), { code: "SERVER_ERROR" });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Updates the header cells according to CONFIG.HEADER_CELLS.
 */
function updateHeaderCells(sheet, header) {
  const map = CONFIG.HEADER_CELLS;
  if (header.chatter !== undefined && map.chatter) sheet.getRange(map.chatter).setValue(header.chatter);
  if (header.client !== undefined && map.client) sheet.getRange(map.client).setValue(header.client);
  if (header.schedule !== undefined && map.schedule) sheet.getRange(map.schedule).setValue(header.schedule);
  if (header.startDate !== undefined && map.startDate) sheet.getRange(map.startDate).setValue(header.startDate);
  if (header.endDate !== undefined && map.endDate) sheet.getRange(map.endDate).setValue(header.endDate);
  if (header.payment !== undefined && map.payment) sheet.getRange(map.payment).setValue(header.payment);
}

/**
 * Ensures unique tab name in the spreadsheet.
 */
function getUniqueSheetName(ss, baseName) {
  let name = baseName;
  let counter = 1;
  while (ss.getSheetByName(name)) {
    counter++;
    name = baseName + " (" + counter + ")";
  }
  return name;
}

/**
 * Standardized JSON response helper.
 */
function createJsonResponse(ok, message, extra) {
  const result = Object.assign({ ok: ok, message: message }, extra || {});
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Normalizes date values for clean comparisons.
 */
function formatCellDate(val) {
  if (!val) return "";
  if (val instanceof Date) {
    return (val.getMonth() + 1) + "/" + val.getDate() + "/" + val.getFullYear();
  }
  const str = String(val).trim();
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return (d.getMonth() + 1) + "/" + d.getDate() + "/" + d.getFullYear();
  }
  return str;
}

/**
 * Checks if a cell value is considered blank/empty.
 */
function isBlank(val) {
  return val === null || val === undefined || String(val).trim() === "";
}

/**
 * Handle GET requests to test if web app is online.
 */
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({
      ok: true,
      message: "Attendance and Salary Tracker Web App is online! Use HTTP POST with your secret key to send data."
    }))
    .setMimeType(ContentService.MimeType.JSON);
}
