import { getSavedSummaries, saveSummarySnapshot } from "@/lib/db";

export async function GET() {
  try {
    const data = await getSavedSummaries();
    return Response.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    let filename = `sales-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
    try {
      const body = await request.json();
      if (body?.export_filename) {
        filename = body.export_filename;
      }
    } catch {
      // Body is optional
    }

    const saved = await saveSummarySnapshot(filename);
    return Response.json(saved, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
