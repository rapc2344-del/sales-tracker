import { getSupabase } from "./supabase";
import type { Model, Sale, SaleInput, SummaryData, SavedSummary } from "./types";


// ── In-Memory Fallback Store (when Supabase credentials are not provided) ──

let memModels: Model[] = [
  { id: 1, name: "Nadya", created_at: new Date().toISOString() },
];

let memSales: Sale[] = [
  {
    id: 5555,
    name: "Kody",
    username: "@u80636081",
    amount: 30.99,
    sale_type: "message",
    model: "Nadya",
    tier: "none",
    date: "2025-10-14",
    raw_text: "🐳(Kody)\n@u80636081\nXXXtreme Spenders-V8Ctalking rn 10/14/25\nhas purchased your message for $30.99!",
    created_at: new Date("2025-10-14T10:00:00Z").toISOString(),
  },
];

let nextSaleId = 5556;
let nextModelId = 2;

// ── Models ────────────────────────────────────────────────────────────

export async function getModels(): Promise<Model[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("models")
      .select("*")
      .order("id", { ascending: true });
    if (error) {
      console.error("Supabase getModels error, using fallback:", error.message);
      return memModels;
    }
    return data ?? [];
  }
  return [...memModels];
}

export async function createModel(name: string): Promise<Model> {
  const trimmed = name.trim();
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("models")
      .insert({ name: trimmed })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const existing = memModels.find(
    (m) => m.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (existing) return existing;

  const newModel: Model = {
    id: nextModelId++,
    name: trimmed,
    created_at: new Date().toISOString(),
  };
  memModels.push(newModel);
  return newModel;
}

// ── Sales ─────────────────────────────────────────────────────────────

export async function getSales(): Promise<Sale[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("sales")
      .select("*")
      .order("id", { ascending: false });
    if (error) {
      console.error("Supabase getSales error, using fallback:", error.message);
      return memSales;
    }
    return data ?? [];
  }
  return [...memSales].sort((a, b) => Number(b.id) - Number(a.id));
}

export async function createSale(
  input: SaleInput | SaleInput[]
): Promise<Sale[]> {
  const items = Array.isArray(input) ? input : [input];
  const sb = getSupabase();

  if (sb) {
    const { data, error } = await sb
      .from("sales")
      .insert(
        items.map((item) => ({
          name: item.name,
          username: item.username,
          amount: item.amount,
          sale_type: item.sale_type,
          model: item.model,
          tier: item.tier.toLowerCase(),
          date: item.date || new Date().toISOString().slice(0, 10),
          raw_text: item.raw_text ?? null,
        }))
      )
      .select();
    if (error) throw new Error(error.message);
    return data as Sale[];
  }

  const created: Sale[] = items.map((item) => ({
    id: nextSaleId++,
    name: item.name,
    username: item.username,
    amount: item.amount,
    sale_type: item.sale_type,
    model: item.model,
    tier: item.tier.toLowerCase() as Sale["tier"],
    date: item.date || new Date().toISOString().slice(0, 10),
    raw_text: item.raw_text ?? null,
    created_at: new Date().toISOString(),
  }));

  memSales.unshift(...created);
  return created;
}

export async function updateSale(
  id: number | string,
  updates: Partial<SaleInput>
): Promise<Sale> {
  const numericId = Number(id);
  const sb = getSupabase();

  if (sb) {
    const updatePayload: Record<string, unknown> = { ...updates };
    if (updates.tier) {
      updatePayload.tier = updates.tier.toLowerCase();
    }
    const { data, error } = await sb
      .from("sales")
      .update(updatePayload)
      .eq("id", numericId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Sale;
  }

  const idx = memSales.findIndex((s) => Number(s.id) === numericId);
  if (idx === -1) throw new Error(`Sale with ID ${id} not found`);

  memSales[idx] = {
    ...memSales[idx],
    ...updates,
    tier: (updates.tier ? updates.tier.toLowerCase() : memSales[idx].tier) as Sale["tier"],
  };
  return memSales[idx];
}

export async function deleteSale(id: number | string): Promise<void> {
  const numericId = Number(id);
  const sb = getSupabase();

  if (sb) {
    const { error } = await sb.from("sales").delete().eq("id", numericId);
    if (error) throw new Error(error.message);
    return;
  }

  memSales = memSales.filter((s) => Number(s.id) !== numericId);
}

export async function deleteAllSales(): Promise<void> {
  const sb = getSupabase();

  if (sb) {
    const { error } = await sb.from("sales").delete().neq("id", -1);
    if (error) {
      console.error("Supabase deleteAllSales error, clearing memory fallback:", error.message);
    }
    memSales = [];
    return;
  }

  memSales = [];
}

// ── Summarize ─────────────────────────────────────────────────────────

export async function getSummary(): Promise<SummaryData> {
  const sales = await getSales();

  const total_revenue = sales.reduce((sum, s) => sum + Number(s.amount), 0);
  const sales_count = sales.length;

  const vip_subtotal = sales
    .filter((s) => s.tier?.toLowerCase() === "vip")
    .reduce((sum, s) => sum + Number(s.amount), 0);

  const free_subtotal = sales
    .filter((s) => s.tier?.toLowerCase() === "free")
    .reduce((sum, s) => sum + Number(s.amount), 0);

  const none_subtotal = sales
    .filter((s) => s.tier?.toLowerCase() === "none" || !s.tier)
    .reduce((sum, s) => sum + Number(s.amount), 0);

  // Group by model
  const modelMap = new Map<string, { revenue: number; count: number }>();
  for (const s of sales) {
    const m = s.model || "Unknown";
    const cur = modelMap.get(m) ?? { revenue: 0, count: 0 };
    cur.revenue += Number(s.amount);
    cur.count += 1;
    modelMap.set(m, cur);
  }
  const by_model = Array.from(modelMap.entries()).map(([model, data]) => ({
    model,
    revenue: Math.round(data.revenue * 100) / 100,
    count: data.count,
  }));

  // Group by sale_type
  const typeMap = new Map<string, { revenue: number; count: number }>();
  for (const s of sales) {
    const t = s.sale_type || "other";
    const cur = typeMap.get(t) ?? { revenue: 0, count: 0 };
    cur.revenue += Number(s.amount);
    cur.count += 1;
    typeMap.set(t, cur);
  }
  const by_sale_type = Array.from(typeMap.entries()).map(([sale_type, data]) => ({
    sale_type,
    revenue: Math.round(data.revenue * 100) / 100,
    count: data.count,
  }));

  // Top buyer
  const buyerMap = new Map<
    string,
    { name: string; username: string; total_spend: number; count: number }
  >();
  for (const s of sales) {
    const key = (s.username || s.name).toLowerCase();
    const cur = buyerMap.get(key) ?? {
      name: s.name,
      username: s.username,
      total_spend: 0,
      count: 0,
    };
    cur.total_spend += Number(s.amount);
    cur.count += 1;
    buyerMap.set(key, cur);
  }

  let top_buyer: SummaryData["top_buyer"] = null;
  for (const buyer of buyerMap.values()) {
    if (!top_buyer || buyer.total_spend > top_buyer.total_spend) {
      top_buyer = {
        name: buyer.name,
        username: buyer.username,
        total_spend: Math.round(buyer.total_spend * 100) / 100,
        count: buyer.count,
      };
    }
  }

  // Date range
  const dates = sales
    .map((s) => s.date)
    .filter(Boolean)
    .map((d) => (typeof d === "string" ? d.slice(0, 10) : ""))
    .filter(Boolean)
    .sort();

  return {
    total_revenue: Math.round(total_revenue * 100) / 100,
    sales_count,
    vip_subtotal: Math.round(vip_subtotal * 100) / 100,
    free_subtotal: Math.round(free_subtotal * 100) / 100,
    none_subtotal: Math.round(none_subtotal * 100) / 100,
    by_model,
    by_sale_type,
    top_buyer,
    date_range: {
      min_date: dates[0] ?? null,
      max_date: dates[dates.length - 1] ?? null,
    },
  };
}

// ── Saved Summaries (Snapshots created upon Export/Save) ───────────────

let memSavedSummaries: SavedSummary[] = [];
let nextSummaryId = 1;

export async function saveSummarySnapshot(
  exportFilename: string
): Promise<SavedSummary> {
  const summary = await getSummary();
  const payload = {
    export_filename: exportFilename,
    total_revenue: summary.total_revenue,
    none_subtotal: summary.none_subtotal,
    vip_subtotal: summary.vip_subtotal,
    free_subtotal: summary.free_subtotal,
    sales_count: summary.sales_count,
    by_model: summary.by_model,
    by_sale_type: summary.by_sale_type,
  };

  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb
        .from("saved_summaries")
        .insert(payload)
        .select()
        .single();
      if (!error && data) {
        return data as SavedSummary;
      }
      console.warn(
        "Supabase saved_summaries insert fallback:",
        error?.message
      );
    } catch (err) {
      console.warn("Supabase saved_summaries exception fallback:", err);
    }
  }

  // In-memory fallback
  const created: SavedSummary = {
    id: nextSummaryId++,
    ...payload,
    created_at: new Date().toISOString(),
  };
  memSavedSummaries.unshift(created);
  return created;
}

export async function getSavedSummaries(): Promise<SavedSummary[]> {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb
        .from("saved_summaries")
        .select("*")
        .order("id", { ascending: false });
      if (!error && data) {
        return data as SavedSummary[];
      }
      console.warn(
        "Supabase saved_summaries select fallback:",
        error?.message
      );
    } catch (err) {
      console.warn("Supabase saved_summaries exception fallback:", err);
    }
  }
  return [...memSavedSummaries].sort((a, b) => Number(b.id) - Number(a.id));
}

export async function getSavedSummaryById(id: number | string): Promise<SavedSummary | null> {
  const numericId = Number(id);
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb
        .from("saved_summaries")
        .select("*")
        .eq("id", numericId)
        .single();
      if (!error && data) {
        return data as SavedSummary;
      }
    } catch (err) {
      console.warn("Supabase saved_summaries select by id error:", err);
    }
  }
  const found = memSavedSummaries.find((s) => Number(s.id) === numericId);
  return found || null;
}

export async function updateSavedSummary(
  id: number | string,
  updates: Partial<SavedSummary>
): Promise<SavedSummary | null> {
  const numericId = Number(id);
  const sb = getSupabase();

  const payload: Record<string, unknown> = {};
  if (updates.export_filename !== undefined) payload.export_filename = updates.export_filename;
  if (updates.total_revenue !== undefined) payload.total_revenue = Number(updates.total_revenue);
  if (updates.none_subtotal !== undefined) payload.none_subtotal = Number(updates.none_subtotal);
  if (updates.vip_subtotal !== undefined) payload.vip_subtotal = Number(updates.vip_subtotal);
  if (updates.free_subtotal !== undefined) payload.free_subtotal = Number(updates.free_subtotal);
  if (updates.sales_count !== undefined) payload.sales_count = Number(updates.sales_count);
  if (updates.by_model !== undefined) payload.by_model = updates.by_model;
  if (updates.by_sale_type !== undefined) payload.by_sale_type = updates.by_sale_type;
  if (updates.created_at !== undefined) payload.created_at = updates.created_at;

  if (sb) {
    try {
      const { data, error } = await sb
        .from("saved_summaries")
        .update(payload)
        .eq("id", numericId)
        .select()
        .single();
      if (!error && data) {
        const idx = memSavedSummaries.findIndex((s) => Number(s.id) === numericId);
        if (idx !== -1) {
          memSavedSummaries[idx] = data as SavedSummary;
        }
        return data as SavedSummary;
      }
      console.warn("Supabase saved_summaries update fallback:", error?.message);
    } catch (err) {
      console.warn("Supabase saved_summaries update exception:", err);
    }
  }

  // In-memory fallback
  const idx = memSavedSummaries.findIndex((s) => Number(s.id) === numericId);
  if (idx !== -1) {
    const existing = memSavedSummaries[idx];
    const updated: SavedSummary = {
      ...existing,
      ...payload,
    };
    memSavedSummaries[idx] = updated;
    return updated;
  }

  return null;
}

export async function deleteSavedSummary(id: number | string): Promise<void> {
  const numericId = Number(id);
  const sb = getSupabase();
  if (sb) {
    try {
      await sb.from("saved_summaries").delete().eq("id", numericId);
    } catch (err) {
      console.warn("Supabase saved_summaries delete error:", err);
    }
  }
  memSavedSummaries = memSavedSummaries.filter((s) => Number(s.id) !== numericId);
}


