import { parsePurchaseText } from "@/lib/parser";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const text = body?.text;
    if (!text || typeof text !== "string") {
      return Response.json(
        { error: "Text field is required" },
        { status: 400 }
      );
    }
    const result = parsePurchaseText(text);
    return Response.json({ parsed: result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
