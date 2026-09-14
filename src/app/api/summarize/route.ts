import { getSummary } from "@/lib/db";

export async function POST() {
  try {
    const summary = await getSummary();
    return Response.json(summary);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
