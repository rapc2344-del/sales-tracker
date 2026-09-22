import { getSavedSummaries, saveSummarySnapshot } from "@/lib/db";
import { syncShiftToGoogleSheet } from "@/lib/gsheet";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const data = await getSavedSummaries();
    return Response.json(data, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ error: msg }, { status: 500 });
  }
}


export async function POST(request: Request) {
  try {
    let filename = `sales-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
    let requestBody: { export_filename?: string; is_new_cutoff?: boolean } | null = null;
    try {
      requestBody = await request.json();
      if (requestBody?.export_filename) {
        filename = requestBody.export_filename;
      }
    } catch {
      // Body is optional
    }

    const saved = await saveSummarySnapshot(filename);

    // Automatically push attendance & shift sales to Google Sheet (if configured)
    if (process.env.GSHEET_WEBAPP_URL) {
      try {
        // Extract date from filename if available (e.g. sales-export-2026-08-30.xlsx)
        const dateMatch = filename.match(/(\d{4}-\d{2}-\d{2})/);
        const shiftDate = dateMatch ? dateMatch[1] : new Date().toISOString().slice(0, 10);

        // Determine primary model/client from shift sales, fallback to Nadya or env
        const primaryModel =
          saved.by_model && saved.by_model.length > 0
            ? saved.by_model[0].model
            : undefined;

        console.log(`[ShiftEndSync] Automatically syncing shift for ${shiftDate} to Google Sheet...`);
        // Non-blocking background sync attempt with retries
        syncShiftToGoogleSheet({
          date: shiftDate,
          client: primaryModel,
          sales: saved.total_revenue,
          forceReset: requestBody?.is_new_cutoff,
        }).catch((syncErr) => {
          console.error("[ShiftEndSync] Automatic Google Sheet sync error:", syncErr);
        });
      } catch (triggerErr) {
        console.error("[ShiftEndSync] Failed to initiate Google Sheet sync:", triggerErr);
      }
    }

    return Response.json(saved, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ error: msg }, { status: 500 });
  }
}

