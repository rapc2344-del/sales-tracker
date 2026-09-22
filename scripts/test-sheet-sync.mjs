/**
 * ============================================================================
 * TEST SCRIPT: Test Google Sheet Sync with 1 Sample Row
 * ============================================================================
 * 
 * Usage:
 *   node scripts/test-sheet-sync.mjs
 * 
 * Options:
 *   --header       Include cutoff header update (chatter, dates, schedule)
 *   --reset        Include reset flag (clears A7:F100 before adding sample row)
 *   --test-auth    Test security rejection with a fake wrong secret
 *   --url <URL>    Override Web App URL directly
 *   --secret <SEC> Override Secret directly
 * ============================================================================
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

// 1. Load .env.local manually if running via node directly
function loadEnv() {
  const envPath = path.join(rootDir, ".env.local");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx > -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

// Parse CLI flags
const args = process.argv.slice(2);
const includeHeader = args.includes("--header");
const includeReset = args.includes("--reset");
const testAuth = args.includes("--test-auth");

const urlIdx = args.indexOf("--url");
const customUrl = urlIdx !== -1 ? args[urlIdx + 1] : null;

const secretIdx = args.indexOf("--secret");
const customSecret = secretIdx !== -1 ? args[secretIdx + 1] : null;

const tabIdx = args.indexOf("--tab");
const targetTab = tabIdx !== -1 ? args[tabIdx + 1] : null;

const newTabIdx = args.indexOf("--new-tab");
const newTabName = newTabIdx !== -1 ? args[newTabIdx + 1] : null;

const webAppUrl = customUrl || process.env.GSHEET_WEBAPP_URL;
let secret = customSecret || process.env.GSHEET_SECRET;

console.log("\n=======================================================");
console.log(" Google Sheet Attendance & Salary Tracker - Test Sync");
console.log("=======================================================\n");

if (!webAppUrl) {
  console.error("❌ ERROR: GSHEET_WEBAPP_URL is not set.");
  console.log("\nTo fix this:");
  console.log("1. Deploy your Google Apps Script as a Web App.");
  console.log("2. Add the URL to your .env.local file: GSHEET_WEBAPP_URL=https://script.google.com/macros/s/.../exec");
  console.log("   OR run this command with: node scripts/test-sheet-sync.mjs --url <YOUR_URL>\n");
  process.exit(1);
}

if (!secret) {
  console.error("❌ ERROR: GSHEET_SECRET is not set.");
  console.log("\nTo fix this:");
  console.log("1. Set GSHEET_SECRET in your .env.local (must match WEB_APP_SECRET in Code.gs).");
  console.log("   OR run with: node scripts/test-sheet-sync.mjs --secret <YOUR_SECRET>\n");
  process.exit(1);
}

if (testAuth) {
  console.log("🔒 [AUTH TEST MODE] Intentionally using an invalid secret to verify rejection...");
  secret = "definitely-wrong-secret-key-xyz";
}

// Prepare 1 sample row matching the example in user request
const sampleRow = {
  date: "8/30/2026",
  client: "Nadya",
  clockIn: "0:00 AM CET",
  clockOut: "8:00 AM CET",
  hours: 8,
  sales: 349.66,
};

const payload = {
  secret,
  reset: includeReset,
  targetTab: targetTab || undefined,
  createTabIfDuplicate: true,
  newTabName: newTabName || undefined,
  rows: [sampleRow],
};

if (includeHeader) {
  payload.header = {
    chatter: process.env.CHATTER_NAME || "Raphael",
    client: "Nadya",
    schedule: "0:00 AM CET - 8:00 AM CET",
    startDate: "August 23, 2026",
    endDate: "September 7, 2026",
    payment: process.env.CHATTER_PAYMENT || "union bank",
  };
}

console.log("Target URL:", webAppUrl);
console.log("Payload to send:\n", JSON.stringify(payload, null, 2));
console.log("\nSending POST request (with redirect follow)...");

async function runTest() {
  try {
    const startTime = Date.now();
    const response = await fetch(webAppUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      redirect: "follow",
    });

    const elapsed = Date.now() - startTime;
    console.log(`HTTP Status: ${response.status} ${response.statusText} (${elapsed}ms)`);

    const result = await response.json();
    console.log("\nServer Response:\n", JSON.stringify(result, null, 2));

    if (testAuth) {
      if (!result.ok && result.code === "UNAUTHORIZED") {
        console.log("\n✅ SUCCESS: The web app correctly rejected the invalid secret!");
      } else {
        console.log("\n⚠️ WARNING: The web app did not reject the invalid secret as expected.");
      }
      return;
    }

    if (result.ok) {
      console.log("\n=======================================================");
      console.log("🎉 TEST SUCCEEDED!");
      console.log(`- Tab used:     ${result.tabName || "default"}`);
      if (result.createdNewTab) {
        console.log(`- New tab:      ✨ Created duplicate tab '${result.tabName}' reflecting the date!`);
      }
      console.log(`- Rows added:   ${result.added}`);
      console.log(`- Rows skipped: ${result.skipped} ${result.skipped > 0 ? "(Duplicate detected!)" : ""}`);
      if (result.skippedReasons && result.skippedReasons.length > 0) {
        console.log(`- Skip reason:  ${result.skippedReasons.join(", ")}`);
      }
      if (result.reset) {
        console.log("- Data reset:   Cleaned A7:F100 before adding.");
      }
      if (result.headerUpdated) {
        console.log("- Header block: Updated cells D1, D2, D3, G2, G3, H2.");
      }
      console.log("\n👉 Open your Google Sheet to verify the result!");
      console.log("=======================================================\n");
    } else {
      console.log("\n=======================================================");
      console.error("❌ TEST RETURNED AN ERROR FROM GOOGLE APPS SCRIPT:");
      console.error(`- Error: ${result.error || result.message || "Unknown error"}`);
      console.error(`- Code:  ${result.code || "None"}`);
      console.log("=======================================================\n");
    }
  } catch (err) {
    console.error("\n❌ NETWORK / FETCH ERROR:", err.message);
    console.log("\nTroubleshooting tips:");
    console.log("1. Check that you deployed the Apps Script as a 'Web app'.");
    console.log("2. Check that 'Who has access' was set to 'Anyone'.");
    console.log("3. Check that your Google Sheet Apps Script was authorized.");
  }
}

runTest();

