import { NextRequest } from "next/server";
import {
  syncShiftToGoogleSheet,
  sendToGoogleSheet,
  getCutoffInfo,
  GSheetPayload,
} from "@/lib/gsheet";

/**
 * GET /api/sync-sheet
 * Health-check & status endpoint to verify configuration without sending live data.
 */
export async function GET() {
  const isUrlConfigured = Boolean(process.env.GSHEET_WEBAPP_URL);
  const isSecretConfigured = Boolean(process.env.GSHEET_SECRET);
  const cutoff = getCutoffInfo();

  return Response.json({
    status: isUrlConfigured && isSecretConfigured ? "configured" : "incomplete_config",
    config: {
      hasUrl: isUrlConfigured,
      hasSecret: isSecretConfigured,
      chatter: process.env.CHATTER_NAME || "Raphael (default)",
      client: process.env.CHATTER_CLIENT || "Nadya (default)",
      schedule: process.env.CHATTER_SCHEDULE || "0:00 AM CET - 8:00 AM CET (default)",
      hours: Number(process.env.CHATTER_HOURS) || 8,
      payment: process.env.CHATTER_PAYMENT || "union bank (default)",
    },
    currentCutoff: {
      type: cutoff.type,
      startDate: cutoff.displayStartDate,
      endDate: cutoff.displayEndDate,
      isCutoffStart: cutoff.isCutoffStart,
    },
  });
}

/**
 * POST /api/sync-sheet
 * Triggers a push to Google Sheets.
 * 
 * Supports two modes:
 * 1. Simple Shift Sync:
 *    { "date": "2026-08-30", "client": "Nadya", "sales": 349.66, "forceReset": false }
 * 
 * 2. Raw Custom Payload:
 *    { "payload": { "reset": true, "header": {...}, "rows": [...] } }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    // Mode 1: Direct raw payload or multi-row deployment payload
    if (body.payload && typeof body.payload === "object") {
      const result = await sendToGoogleSheet(body.payload as GSheetPayload);
      const status = result.ok ? 200 : 400;
      return Response.json(result, { status });
    }

    // Mode 2: Multi-row or custom deployment from preview page
    if (Array.isArray(body.rows)) {
      const payload: GSheetPayload = {
        secret: process.env.GSHEET_SECRET || "",
        reset: Boolean(body.reset),
        targetTab: body.targetTab,
        createTabIfDuplicate: body.createTabIfDuplicate !== false,
        newTabName: body.newTabName,
        header: body.header,
        rows: body.rows,
      };

      const result = await sendToGoogleSheet(payload);
      const status = result.ok ? 200 : 400;
      return Response.json(result, { status });
    }

    // Mode 3: Single shift sync
    const result = await syncShiftToGoogleSheet({
      date: body.date,
      client: body.client,
      sales: body.sales,
      hours: body.hours,
      clockIn: body.clockIn,
      clockOut: body.clockOut,
      forceReset: body.forceReset,
      forceHeader: body.forceHeader,
      targetTab: body.targetTab,
      createTabIfDuplicate: body.createTabIfDuplicate,
      newTabName: body.newTabName,
    });

    const status = result.ok ? 200 : 400;
    return Response.json(result, { status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to sync to Google Sheet";
    console.error("[/api/sync-sheet] Error:", msg);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}

