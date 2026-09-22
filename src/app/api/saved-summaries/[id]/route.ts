import {
  deleteSavedSummary,
  updateSavedSummary,
  getSavedSummaryById,
} from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;


export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const summary = await getSavedSummaryById(id);
    if (!summary) {
      return Response.json({ error: "Saved summary not found" }, { status: 404 });
    }
    return Response.json(summary);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const updated = await updateSavedSummary(id, body);
    if (!updated) {
      return Response.json({ error: "Saved summary not found or could not be updated" }, { status: 404 });
    }
    return Response.json(updated);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return PUT(request, { params });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteSavedSummary(id);
    return Response.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ error: msg }, { status: 500 });
  }
}

