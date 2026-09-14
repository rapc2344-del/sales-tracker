import { getSales, createSale, deleteAllSales } from "@/lib/db";
import type { SaleInput } from "@/lib/types";

export async function GET() {
  try {
    const sales = await getSales();
    return Response.json(sales);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Supports both a single sale object or an array of sale rows
    if (Array.isArray(body)) {
      if (body.length === 0) {
        return Response.json({ error: "Array of sales cannot be empty" }, { status: 400 });
      }
      const sales = await createSale(body as SaleInput[]);
      return Response.json(sales, { status: 201 });
    }

    if (!body?.name || !body?.model) {
      return Response.json(
        { error: "name and model are required" },
        { status: 400 }
      );
    }

    const saleInputs: SaleInput = {
      name: body.name,
      username: body.username || "",
      amount: Number(body.amount) || 0,
      sale_type: body.sale_type || "message",
      model: body.model,
      tier: body.tier || "none",
      date: body.date || new Date().toISOString().slice(0, 10),
      raw_text: body.raw_text ?? null,
    };

    const result = await createSale(saleInputs);
    return Response.json(result[0], { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await deleteAllSales();
    return Response.json({ success: true, message: "All sales data cleared from database" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
