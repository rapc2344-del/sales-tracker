import { getModels, createModel } from "@/lib/db";

export async function GET() {
  try {
    const models = await getModels();
    return Response.json(models);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = body?.name?.trim();
    if (!name) {
      return Response.json({ error: "Name is required" }, { status: 400 });
    }
    const model = await createModel(name);
    return Response.json(model, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
