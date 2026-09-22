/**
 * Google Sheet Attendance & Salary Tracker Integration
 * 
 * Sends chatter attendance and daily sales data to the Google Apps Script Web App.
 */

export interface GSheetRow {
  date: string;       // e.g. "8/30/2026" or "2026-08-30"
  client: string;     // e.g. "Nadya"
  clockIn: string;    // e.g. "0:00 AM CET"
  clockOut: string;   // e.g. "8:00 AM CET"
  hours: number;      // e.g. 8
  sales: number;      // e.g. 349.66
}

export interface GSheetHeader {
  chatter: string;    // e.g. "Raphael"
  client: string;     // e.g. "Nadya"
  schedule: string;   // e.g. "0:00 AM CET - 8:00 AM CET"
  startDate: string;  // e.g. "August 23, 2026"
  endDate: string;    // e.g. "September 7, 2026"
  payment: string;    // e.g. "union bank"
}

export interface GSheetPayload {
  secret: string;
  reset?: boolean;
  header?: GSheetHeader;
  rows?: GSheetRow[];
  targetTab?: string;
  createTabIfDuplicate?: boolean;
  newTabName?: string;
}

export interface GSheetResponse {
  ok: boolean;
  message?: string;
  added?: number;
  skipped?: number;
  skippedReasons?: string[];
  reset?: boolean;
  headerUpdated?: boolean;
  tabName?: string;
  createdNewTab?: boolean;
  error?: string;
  code?: string;
}


/**
 * Format a date as M/D/YYYY (e.g. 8/30/2026) for Column A in Google Sheets
 */
export function formatMDY(dateInput: Date | string): string {
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) {
    return String(dateInput);
  }
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

/**
 * Format a date as "Month Day, Year" (e.g. "August 23, 2026") for Header block
 */
export function formatLongDate(dateInput: Date | string): string {
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) {
    return String(dateInput);
  }
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/**
 * Calculate Cutoff Period info for a given date (Rules: 8-23 and 24-7)
 */
export function getCutoffInfo(date: Date = new Date()) {
  const y = date.getFullYear();
  const m = date.getMonth();
  const day = date.getDate();

  let start: Date;
  let end: Date;
  let type: "8-23" | "24-7";

  if (day >= 8 && day <= 23) {
    // 8th to 23rd of current month
    start = new Date(y, m, 8);
    end = new Date(y, m, 23);
    type = "8-23";
  } else if (day >= 24) {
    // 24th of current month to 7th of next month
    start = new Date(y, m, 24);
    const nextM = (m + 1) % 12;
    const nextY = m === 11 ? y + 1 : y;
    end = new Date(nextY, nextM, 7);
    type = "24-7";
  } else {
    // 1st to 7th of current month (started 24th of previous month)
    const prevM = (m + 11) % 12;
    const prevY = m === 0 ? y - 1 : y;
    start = new Date(prevY, prevM, 24);
    end = new Date(y, m, 7);
    type = "24-7";
  }

  // Check if current date is the very first day of the cutoff period
  const isCutoffStart = (date.getFullYear() === start.getFullYear() &&
                         date.getMonth() === start.getMonth() &&
                         date.getDate() === start.getDate());

  return {
    type,
    startDate: start,
    endDate: end,
    displayStartDate: formatLongDate(start),
    displayEndDate: formatLongDate(end),
    isCutoffStart,
  };
}

/**
 * Sleep helper for retry backoff
 */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sends a payload to the Google Apps Script Web App with automatic retry logic.
 */
export async function sendToGoogleSheet(
  payload: GSheetPayload,
  options: { maxRetries?: number; retryDelayMs?: number } = {}
): Promise<GSheetResponse> {
  const webAppUrl = process.env.GSHEET_WEBAPP_URL;
  const secret = payload.secret || process.env.GSHEET_SECRET;

  if (!webAppUrl) {
    const errorMsg = "GSHEET_WEBAPP_URL is not defined in environment variables.";
    console.error(`[GoogleSheetSync] ${errorMsg}`);
    return { ok: false, error: errorMsg, code: "MISSING_ENV_URL" };
  }

  if (!secret) {
    const errorMsg = "GSHEET_SECRET is not defined in environment variables.";
    console.error(`[GoogleSheetSync] ${errorMsg}`);
    return { ok: false, error: errorMsg, code: "MISSING_ENV_SECRET" };
  }

  const finalPayload: GSheetPayload = {
    ...payload,
    secret,
  };

  const maxRetries = options.maxRetries ?? 3;
  const initialDelay = options.retryDelayMs ?? 1500;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[GoogleSheetSync] Attempt ${attempt}/${maxRetries} sending payload to Google Sheet...`);

      // Google Apps Script requires follow redirects
      const res = await fetch(webAppUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(finalPayload),
        redirect: "follow",
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
      }

      const data = (await res.json()) as GSheetResponse;

      if (!data.ok) {
        console.warn(`[GoogleSheetSync] Google Sheet returned error: ${data.message || data.error}`);
        return data;
      }

      console.log(
        `[GoogleSheetSync] Success! Added: ${data.added ?? 0}, Skipped: ${data.skipped ?? 0}${
          data.reset ? ", Reset: true" : ""
        }`
      );
      return data;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`[GoogleSheetSync] Attempt ${attempt} failed: ${lastError.message}`);

      if (attempt < maxRetries) {
        const waitTime = initialDelay * Math.pow(2, attempt - 1);
        console.log(`[GoogleSheetSync] Retrying in ${waitTime}ms...`);
        await sleep(waitTime);
      }
    }
  }

  const errMsg = lastError ? lastError.message : "Failed after all retries";
  console.error(`[GoogleSheetSync] Request ultimately failed: ${errMsg}`);
  return {
    ok: false,
    error: `Failed to sync to Google Sheet: ${errMsg}`,
    code: "REQUEST_FAILED",
  };
}

/**
 * High-level helper to sync a completed shift to Google Sheet automatically.
 * Reads environment variables for chatter defaults.
 */
export async function syncShiftToGoogleSheet(params: {
  date?: string;          // YYYY-MM-DD or M/D/YYYY (defaults to today)
  client?: string;        // Model/client name (defaults to Nadya or CHATTER_CLIENT)
  sales?: number;         // Total shift sales (defaults to 0)
  hours?: number;         // Defaults to 8 or CHATTER_HOURS
  clockIn?: string;       // Defaults to "0:00 AM CET" or CHATTER_CLOCK_IN
  clockOut?: string;      // Defaults to "8:00 AM CET" or CHATTER_CLOCK_OUT
  forceReset?: boolean;   // If true, forces clearing A7:F100 for a new cutoff
  forceHeader?: boolean;  // If true, forces updating the Cutoff Header block
  targetTab?: string;     // Specific tab name to write to
  createTabIfDuplicate?: boolean; // If duplicate exists, create new tab
  newTabName?: string;    // Name of new tab if duplicate detected (e.g. mm/dd/yyyy)
}): Promise<GSheetResponse> {
  const now = new Date();
  const shiftDate = params.date ? new Date(params.date) : now;
  const cutoff = getCutoffInfo(shiftDate);

  // Defaults from environment or standard values
  const chatterName = process.env.CHATTER_NAME || "Raphael";
  const clientName = params.client || process.env.CHATTER_CLIENT || "Nadya";
  const clockIn = params.clockIn || process.env.CHATTER_CLOCK_IN || "0:00 AM CET";
  const clockOut = params.clockOut || process.env.CHATTER_CLOCK_OUT || "8:00 AM CET";
  const schedule = process.env.CHATTER_SCHEDULE || `${clockIn} - ${clockOut}`;
  const hours = params.hours ?? (Number(process.env.CHATTER_HOURS) || 8);
  const payment = process.env.CHATTER_PAYMENT || "union bank";
  const sales = Number(params.sales) || 0;

  // Detect if this is the start of a new cutoff
  const isNewCutoff = params.forceReset ?? cutoff.isCutoffStart;
  const includeHeader = params.forceHeader ?? isNewCutoff;

  const payload: GSheetPayload = {
    secret: process.env.GSHEET_SECRET || "",
    reset: isNewCutoff,
    targetTab: params.targetTab,
    createTabIfDuplicate: params.createTabIfDuplicate,
    newTabName: params.newTabName,
    header: includeHeader
      ? {
          chatter: chatterName,
          client: clientName,
          schedule,
          startDate: cutoff.displayStartDate,
          endDate: cutoff.displayEndDate,
          payment,
        }
      : undefined,
    rows: [
      {
        date: formatMDY(shiftDate),
        client: clientName,
        clockIn,
        clockOut,
        hours,
        sales: Math.round(sales * 100) / 100,
      },
    ],
  };

  return sendToGoogleSheet(payload);
}

