"use client";

import { useState, useEffect, useCallback, useId, useMemo } from "react";
import {
  Download,
  Plus,
  BarChart3,
  Pencil,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  Sparkles,
  Crown,
  Gift,
  CircleDot,
  Calendar,
  Layers,
  ShoppingBag,
  Menu,
  Database,
  Search,
  Filter,
  Users,
  ChevronRight,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import type { Model, Sale, Tier, SummaryData, ParsedPurchase } from "@/lib/types";
import { parsePurchaseText } from "@/lib/parser";

// ── Confirmed Sample Format ──────────────────────────────────────────

const SAMPLE_TEXT = `🐳(Kody)
@u80636081
XXXtreme Spenders-V8Ctalking rn 10/14/25
has purchased your message for $30.99!`;

// ── Currency Formatter ────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

// ── Tier Badges (Pink & Cream Palette) ─────────────────────────────────

function getTierBadgeClass(tier: Tier | string): string {
  const t = (tier || "none").toLowerCase();
  switch (t) {
    case "vip":
      return "bg-[#E31B73]/20 text-[#FF77B9] border border-[#E31B73]/45 shadow-sm shadow-[#E31B73]/20";
    case "free":
      return "bg-[#FFA4D2]/20 text-[#FFA4D2] border border-[#FFA4D2]/40 shadow-sm shadow-[#FFA4D2]/10";
    default:
      return "bg-[#FFFDE6]/10 text-[#FFFDE6] border border-[#FFFDE6]/30";
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  try {
    const parts = dateStr.slice(0, 10).split("-");
    if (parts.length === 3) {
      return `${parts[1]}/${parts[2]}/${parts[0]}`;
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

// ── Component ─────────────────────────────────────────────────────────

export default function SalesTrackerPage() {
  const textareaId = useId();
  const modelSelectId = useId();

  // Layout states (Sidebar & Navigation)
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [activeFilter, setActiveFilter] = useState<string>("all"); // "all" | "vip" | "free" | "none" | model name
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Core Data States
  const [models, setModels] = useState<Model[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("Nadya");
  const [purchaseText, setPurchaseText] = useState<string>("");
  const [tier, setTier] = useState<Tier>("none");

  // Inline error state mandated by spec:
  // "If it returns null (unrecognized format), show an inline error near the textarea — 'Couldn't parse this text — check the format' — and do not save."
  const [inlineParseError, setInlineParseError] = useState<string | null>(null);

  // Loading & notification states
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Model creation
  const [isAddingModel, setIsAddingModel] = useState<boolean>(false);
  const [newModelInput, setNewModelInput] = useState<string>("");

  // Edit modal
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [editFormData, setEditFormData] = useState({
    name: "",
    username: "",
    amount: "",
    sale_type: "",
    model: "",
    tier: "none" as Tier,
    date: "",
  });

  // Delete modal
  const [deletingSale, setDeletingSale] = useState<Sale | null>(null);

  // Summary modal
  const [showSummary, setShowSummary] = useState<boolean>(false);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState<boolean>(false);

  // Toast auto-dismiss
  const showToast = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Data Fetching ──────────────────────────────────────────────────

  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch("/api/models");
      if (!res.ok) throw new Error("Failed to load models");
      const data: Model[] = await res.json();
      setModels(data);
      if (data.length > 0 && !selectedModel) {
        setSelectedModel(data[0].name);
      }
    } catch {
      setModels([{ id: 1, name: "Nadya" }]);
      setSelectedModel("Nadya");
    }
  }, [selectedModel]);

  const fetchSales = useCallback(async () => {
    try {
      const res = await fetch("/api/sales");
      if (!res.ok) throw new Error("Failed to load sales");
      const data: Sale[] = await res.json();
      setSales(data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchModels();
    fetchSales();
  }, [fetchModels, fetchSales]);

  // ── Handlers ───────────────────────────────────────────────────────

  // Add Model
  const handleAddNewModel = async () => {
    const trimmed = newModelInput.trim();
    if (!trimmed) return;

    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add model");

      setModels((prev) => {
        const exists = prev.some((m) => m.name.toLowerCase() === trimmed.toLowerCase());
        if (exists) return prev;
        return [...prev, data];
      });
      setSelectedModel(trimmed);
      setNewModelInput("");
      setIsAddingModel(false);
      showToast("success", `Model "${trimmed}" added and selected`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error adding model";
      showToast("error", msg);
    }
  };

  // Process & Save
  const handleProcessAndSave = async () => {
    setInlineParseError(null);

    if (!purchaseText.trim()) {
      setInlineParseError("Couldn't parse this text — check the format");
      return;
    }

    setIsProcessing(true);

    try {
      // Step 1: Run parsePurchaseText(text)
      const parsed: ParsedPurchase | null = parsePurchaseText(purchaseText);

      // Step 2: If null, show inline error near textarea and do not save
      if (!parsed) {
        setInlineParseError("Couldn't parse this text — check the format");
        setIsProcessing(false);
        return;
      }

      // Step 3: Merge in selected model and tier, POST to /api/sales
      const payload = {
        name: parsed.name,
        username: parsed.username,
        amount: parsed.amount,
        sale_type: parsed.sale_type,
        model: selectedModel || "Nadya",
        tier: tier,
        date: parsed.date,
        raw_text: purchaseText,
      };

      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const savedSale = await res.json();
      if (!res.ok) throw new Error(savedSale.error || "Failed to save sale");

      // Step 4: Clear textarea, refresh table
      setPurchaseText("");
      setInlineParseError(null);
      await fetchSales();
      showToast(
        "success",
        `Saved sale #${savedSale.id} for ${savedSale.name} (${formatCurrency(Number(savedSale.amount))})`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error processing sale";
      showToast("error", msg);
    } finally {
      setIsProcessing(false);
    }
  };

  // Edit Sale
  const handleOpenEdit = (sale: Sale) => {
    setEditingSale(sale);
    setEditFormData({
      name: sale.name,
      username: sale.username || "",
      amount: String(sale.amount),
      sale_type: sale.sale_type || "message",
      model: sale.model || selectedModel || "Nadya",
      tier: (sale.tier || "none").toLowerCase() as Tier,
      date: sale.date ? sale.date.slice(0, 10) : "",
    });
  };

  const handleSaveEdit = async () => {
    if (!editingSale) return;

    try {
      const res = await fetch(`/api/sales/${editingSale.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editFormData.name,
          username: editFormData.username,
          amount: parseFloat(editFormData.amount) || 0,
          sale_type: editFormData.sale_type,
          model: editFormData.model,
          tier: editFormData.tier,
          date: editFormData.date,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update sale");

      setSales((prev) =>
        prev.map((s) => (s.id === editingSale.id ? { ...s, ...data } : s))
      );
      setEditingSale(null);
      showToast("success", `Sale #${editingSale.id} updated`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update";
      showToast("error", msg);
    }
  };

  // Delete Sale
  const handleConfirmDelete = async () => {
    if (!deletingSale) return;

    try {
      const res = await fetch(`/api/sales/${deletingSale.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete sale");

      setSales((prev) => prev.filter((s) => s.id !== deletingSale.id));
      showToast("success", `Sale #${deletingSale.id} deleted`);
      setDeletingSale(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete";
      showToast("error", msg);
    }
  };

  // Excel Export (SheetJS)
  const handleExportExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      const exportRows = filteredSales.map((s) => ({
        ID: s.id,
        Name: s.name,
        Username: s.username,
        Amount: Number(s.amount),
        "Sale Type": s.sale_type,
        Model: s.model,
        Tier: (s.tier || "none").toUpperCase(),
        Date: s.date ? s.date.slice(0, 10) : "",
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Purchases");

      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `sales-export-${today}.xlsx`);
      showToast("success", "Exported sales-export-" + today + ".xlsx");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to export Excel";
      showToast("error", msg);
    }
  };

  // View Summary Modal
  const handleOpenSummary = async () => {
    setShowSummary(true);
    setIsLoadingSummary(true);
    try {
      const res = await fetch("/api/summarize", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load summary");
      setSummaryData(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load summary";
      showToast("error", msg);
    } finally {
      setIsLoadingSummary(false);
    }
  };

  // ── Client-side Filtered Sales ─────────────────────────────────────

  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      // Filter by active sidebar tab
      if (activeFilter === "vip" && s.tier?.toLowerCase() !== "vip") return false;
      if (activeFilter === "free" && s.tier?.toLowerCase() !== "free") return false;
      if (activeFilter === "none" && s.tier?.toLowerCase() !== "none" && s.tier) return false;
      if (
        activeFilter.startsWith("model:") &&
        s.model?.toLowerCase() !== activeFilter.replace("model:", "").toLowerCase()
      ) {
        return false;
      }

      // Filter by search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = s.name?.toLowerCase().includes(q);
        const matchesUser = s.username?.toLowerCase().includes(q);
        const matchesModel = s.model?.toLowerCase().includes(q);
        const matchesType = s.sale_type?.toLowerCase().includes(q);
        const matchesId = String(s.id).includes(q);
        return matchesName || matchesUser || matchesModel || matchesType || matchesId;
      }

      return true;
    });
  }, [sales, activeFilter, searchQuery]);

  // ── Client-side Subtotals (mandated by spec: computed client-side from loaded rows) ──

  const totalAmount = filteredSales.reduce((sum, s) => sum + Number(s.amount || 0), 0);
  const vipAmount = filteredSales
    .filter((s) => s.tier?.toLowerCase() === "vip")
    .reduce((sum, s) => sum + Number(s.amount || 0), 0);
  const freeAmount = filteredSales
    .filter((s) => s.tier?.toLowerCase() === "free")
    .reduce((sum, s) => sum + Number(s.amount || 0), 0);
  const noneAmount = filteredSales
    .filter((s) => s.tier?.toLowerCase() === "none" || !s.tier)
    .reduce((sum, s) => sum + Number(s.amount || 0), 0);

  // Model counts
  const modelCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of sales) {
      const m = s.model || "Unknown";
      map[m] = (map[m] || 0) + 1;
    }
    return map;
  }, [sales]);

  return (
    <div className="min-h-screen bg-[#120815] text-[#FFFDE6] flex flex-col selection:bg-[#E31B73] selection:text-[#FFFDE6]">
      {/* ── Toast Notification ─────────────────────────────── */}
      {toast && (
        <div
          role="status"
          className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border backdrop-blur-md transition-all duration-300 ${
            toast.type === "success"
              ? "bg-[#1c081e]/95 border-[#FF77B9]/60 text-[#FFFDE6] shadow-[#E31B73]/20"
              : "bg-[#270714]/95 border-[#E31B73]/70 text-[#FFA4D2] shadow-[#E31B73]/30"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 size={18} className="text-[#FF77B9] shrink-0" />
          ) : (
            <AlertCircle size={18} className="text-[#E31B73] shrink-0" />
          )}
          <span className="text-sm font-semibold">{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="text-[#FFA4D2] hover:text-[#FFFDE6] ml-2"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════
          TOP NAVBAR
          ═════════════════════════════════════════════════════ */}
      <header className="border-b border-[#FFA4D2]/20 bg-[#1a0b1f]/95 backdrop-blur-md sticky top-0 z-30 px-4 md:px-6 py-3 flex items-center justify-between shadow-lg shadow-black/20">
        <div className="flex items-center gap-3">
          {/* Sidebar toggle button */}
          <button
            type="button"
            title={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 rounded-xl bg-[#250f2c] hover:bg-[#34143d] text-[#FFA4D2] hover:text-[#FFFDE6] border border-[#FFA4D2]/25 transition shadow-sm"
          >
            <Menu size={18} />
          </button>

          {/* Logo brand */}
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-[#E31B73] via-[#FF77B9] to-[#FFA4D2] flex items-center justify-center shadow-lg shadow-[#E31B73]/35 text-[#FFFDE6] font-black text-base">
              $
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight text-[#FFFDE6]">
                  Sales Tracker
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#E31B73]/20 text-[#FFA4D2] border border-[#E31B73]/40 hidden sm:inline-block">
                  Internal Pro
                </span>
              </div>
              <p className="text-[11px] text-[#d9a0c2] hidden md:block">
                Regex Parser &amp; Supabase Database
              </p>
            </div>
          </div>
        </div>

        {/* Quick KPI Chips in Navbar */}
        <div className="hidden lg:flex items-center gap-3 px-3 py-1 rounded-xl bg-[#220d29] border border-[#FFA4D2]/20 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold text-[#FFA4D2]">Total Rev:</span>
            <span className="font-mono font-extrabold text-[#FFFDE6]">
              {formatCurrency(totalAmount)}
            </span>
          </div>
          <span className="text-[#FFA4D2]/30">|</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold text-[#FF77B9]">VIP:</span>
            <span className="font-mono font-bold text-[#FF77B9]">
              {formatCurrency(vipAmount)}
            </span>
          </div>
          <span className="text-[#FFA4D2]/30">|</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold text-[#d9a0c2]">Rows:</span>
            <span className="font-mono font-bold text-[#FFFDE6]">
              {filteredSales.length}
            </span>
          </div>
        </div>

        {/* Right side actions in Navbar */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Database Live Ping */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#200e26] border border-[#FFA4D2]/20 text-[11px] text-[#FFA4D2]">
            <span className="inline-block w-2 h-2 rounded-full bg-[#FF77B9] animate-pulse shadow-sm shadow-[#FF77B9]" />
            <span className="font-semibold">Supabase Live</span>
          </div>

          {/* Quick Summary Modal Button */}
          <button
            type="button"
            onClick={handleOpenSummary}
            className="px-3 py-1.5 rounded-xl bg-[#FFA4D2]/15 hover:bg-[#FFA4D2]/25 border border-[#FFA4D2]/35 text-[#FFFDE6] font-bold text-xs flex items-center gap-1.5 transition shadow-sm"
          >
            <BarChart3 size={14} className="text-[#FF77B9]" />
            <span className="hidden sm:inline">Summary</span>
          </button>

          {/* Save / Export (.xlsx) Button */}
          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-lg shadow-emerald-600/20"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Export (.xlsx)</span>
          </button>

          {/* Admin Avatar */}
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#E31B73] to-[#FFA4D2] p-[1.5px] flex items-center justify-center shadow-md">
            <div className="h-full w-full rounded-full bg-[#1c0b20] flex items-center justify-center text-[11px] font-bold text-[#FFFDE6]">
              👑
            </div>
          </div>
        </div>
      </header>

      {/* ═════════════════════════════════════════════════════
          APP BODY: SIDEBAR + MAIN CONTENT WORKSPACE
          ═════════════════════════════════════════════════════ */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* ── LEFT SIDEBAR ─────────────────────────────────── */}
        <aside
          className={`bg-[#180a1c] border-r border-[#FFA4D2]/20 transition-all duration-300 flex flex-col shrink-0 z-20 ${
            isSidebarOpen ? "w-64" : "w-0 -translate-x-full md:translate-x-0 md:w-16"
          }`}
        >
          <div className="p-4 flex flex-col gap-5 flex-1 overflow-y-auto">
            
            {/* Nav Categories */}
            <div className="flex flex-col gap-1">
              <span
                className={`text-[10px] font-extrabold uppercase tracking-wider text-[#FFA4D2]/60 px-2.5 mb-1 ${
                  !isSidebarOpen && "md:hidden"
                }`}
              >
                Views &amp; Filters
              </span>

              {/* All Purchases Link */}
              <button
                type="button"
                onClick={() => setActiveFilter("all")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition ${
                  activeFilter === "all"
                    ? "bg-gradient-to-r from-[#E31B73]/25 to-[#FF77B9]/20 text-[#FFFDE6] border border-[#E31B73]/50 shadow-md shadow-[#E31B73]/15"
                    : "text-[#d9a0c2] hover:bg-[#250f2c] hover:text-[#FFFDE6]"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <TrendingUp size={16} className="text-[#FF77B9]" />
                  {isSidebarOpen && <span>All Purchases</span>}
                </div>
                {isSidebarOpen && (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#2a1032] text-[#FFA4D2]">
                    {sales.length}
                  </span>
                )}
              </button>

              {/* VIP Spenders Link */}
              <button
                type="button"
                onClick={() => setActiveFilter("vip")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition ${
                  activeFilter === "vip"
                    ? "bg-[#E31B73]/30 text-[#FFFDE6] border border-[#E31B73]/60 shadow-md shadow-[#E31B73]/20"
                    : "text-[#d9a0c2] hover:bg-[#250f2c] hover:text-[#FFFDE6]"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Crown size={16} className="text-[#E31B73]" />
                  {isSidebarOpen && <span>VIP Spenders</span>}
                </div>
                {isSidebarOpen && (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#E31B73]/20 text-[#FF77B9]">
                    {sales.filter((s) => s.tier?.toLowerCase() === "vip").length}
                  </span>
                )}
              </button>

              {/* Free Tier Link */}
              <button
                type="button"
                onClick={() => setActiveFilter("free")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition ${
                  activeFilter === "free"
                    ? "bg-[#FFA4D2]/25 text-[#FFFDE6] border border-[#FFA4D2]/50 shadow-md shadow-[#FFA4D2]/15"
                    : "text-[#d9a0c2] hover:bg-[#250f2c] hover:text-[#FFFDE6]"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Gift size={16} className="text-[#FFA4D2]" />
                  {isSidebarOpen && <span>Free Tier</span>}
                </div>
                {isSidebarOpen && (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#FFA4D2]/20 text-[#FFA4D2]">
                    {sales.filter((s) => s.tier?.toLowerCase() === "free").length}
                  </span>
                )}
              </button>

              {/* None Tier Link */}
              <button
                type="button"
                onClick={() => setActiveFilter("none")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition ${
                  activeFilter === "none"
                    ? "bg-[#FFFDE6]/20 text-[#FFFDE6] border border-[#FFFDE6]/40 shadow-md shadow-[#FFFDE6]/15"
                    : "text-[#d9a0c2] hover:bg-[#250f2c] hover:text-[#FFFDE6]"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <CircleDot size={16} className="text-[#FFFDE6]" />
                  {isSidebarOpen && <span>None Tier</span>}
                </div>
                {isSidebarOpen && (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#FFFDE6]/15 text-[#FFFDE6]">
                    {sales.filter((s) => s.tier?.toLowerCase() === "none" || !s.tier).length}
                  </span>
                )}
              </button>
            </div>

            {/* Models Directory Section */}
            {isSidebarOpen && (
              <div className="flex flex-col gap-2 pt-2 border-t border-[#FFA4D2]/15">
                <div className="flex items-center justify-between px-2.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#FFA4D2]/60 flex items-center gap-1.5">
                    <Users size={12} />
                    Models
                  </span>
                  <button
                    type="button"
                    title="Add new model"
                    onClick={() => setIsAddingModel(true)}
                    className="p-1 rounded-md bg-[#250f2c] hover:bg-[#34143d] text-[#FFA4D2] hover:text-[#FFFDE6] border border-[#FFA4D2]/25"
                  >
                    <Plus size={12} />
                  </button>
                </div>

                <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1">
                  {models.map((m) => {
                    const isModelActive = activeFilter === `model:${m.name}`;
                    const count = modelCounts[m.name] || 0;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() =>
                          setActiveFilter(isModelActive ? "all" : `model:${m.name}`)
                        }
                        className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                          isModelActive
                            ? "bg-[#E31B73]/25 text-[#FFFDE6] border border-[#E31B73]/40 font-bold"
                            : "text-[#d9a0c2] hover:bg-[#250f2c] hover:text-[#FFFDE6]"
                        }`}
                      >
                        <span className="truncate">{m.name}</span>
                        <span className="text-[10px] font-mono text-[#FFA4D2] opacity-80">
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick Actions in Sidebar */}
            {isSidebarOpen && (
              <div className="flex flex-col gap-2 pt-2 border-t border-[#FFA4D2]/15">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#FFA4D2]/60 px-2.5">
                  Quick Actions
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPurchaseText(SAMPLE_TEXT);
                    setInlineParseError(null);
                    showToast("success", "Sample message loaded into purchase text");
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-[#230d2a] hover:bg-[#2f1238] border border-[#FFA4D2]/20 text-xs font-bold text-[#FFA4D2] transition text-left"
                >
                  <Sparkles size={14} className="text-[#FF77B9]" />
                  <span>Load Sample Text</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenSummary}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-[#230d2a] hover:bg-[#2f1238] border border-[#FFA4D2]/20 text-xs font-bold text-[#FFFDE6] transition text-left"
                >
                  <BarChart3 size={14} className="text-[#FF77B9]" />
                  <span>View Full Summary</span>
                </button>
              </div>
            )}

            {/* Bottom Status Card */}
            {isSidebarOpen && (
              <div className="mt-auto p-3 bg-[#200e26] border border-[#FFA4D2]/20 rounded-2xl flex flex-col gap-1.5 text-[11px] shadow-inner">
                <div className="flex items-center gap-2 font-bold text-[#FFFDE6]">
                  <Database size={13} className="text-[#FF77B9]" />
                  <span>Database Connected</span>
                </div>
                <p className="text-[10px] text-[#d9a0c2]">
                  Postgres on Supabase with server-side service role key.
                </p>
              </div>
            )}
          </div>
        </aside>

        {/* ── MAIN CONTENT WORKSPACE ───────────────────────── */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-6">
          
          {/* Workspace Filter Status Banner (if filtered) */}
          {(activeFilter !== "all" || searchQuery.trim()) && (
            <div className="p-3 bg-[#230e29] border border-[#FFA4D2]/30 rounded-xl flex items-center justify-between gap-3 text-xs animate-fadeIn">
              <div className="flex items-center gap-2">
                <Filter size={14} className="text-[#FF77B9]" />
                <span>
                  Filtering by:{" "}
                  <strong className="text-[#FFFDE6] uppercase">
                    {activeFilter.startsWith("model:")
                      ? `Model: ${activeFilter.replace("model:", "")}`
                      : activeFilter}
                  </strong>
                  {searchQuery && (
                    <span> &amp; Search: &ldquo;{searchQuery}&rdquo;</span>
                  )}
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#E31B73]/20 text-[#FF77B9] font-bold">
                  {filteredSales.length} matches
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveFilter("all");
                  setSearchQuery("");
                }}
                className="text-[#FFA4D2] hover:text-[#FFFDE6] text-xs font-bold underline"
              >
                Clear Filters
              </button>
            </div>
          )}

          {/* Dual-Panel Core Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* ═════════════════════════════════════════════════
                LEFT PANEL: "Enter Purchase Details" (5 cols)
                ═════════════════════════════════════════════════ */}
            <section
              aria-label="Enter Purchase Details"
              className="lg:col-span-5 bg-[#200e26]/90 border border-[#FFA4D2]/20 rounded-2xl p-5 shadow-2xl flex flex-col gap-4 relative overflow-hidden backdrop-blur-xl"
            >
              {/* Decorative pink glow from palette */}
              <div className="absolute -top-12 -left-12 w-48 h-48 bg-[#E31B73]/15 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-12 -right-12 w-44 h-44 bg-[#FF77B9]/10 rounded-full blur-3xl pointer-events-none" />

              {/* Panel Header & Model Dropdown */}
              <div className="flex items-start justify-between gap-3 pb-1 border-b border-[#FFA4D2]/15">
                <div>
                  <h2 className="text-base font-bold text-[#FFFDE6] tracking-tight">
                    Enter Purchase Details
                  </h2>
                  <p className="text-xs text-[#d9a0c2]">
                    Paste raw purchase message to parse &amp; save
                  </p>
                </div>

                {/* Model Dropdown + Add button (top right of panel) */}
                <div className="flex flex-col items-end gap-1.5">
                  <span className="text-[11px] font-bold text-[#FFA4D2] tracking-wider uppercase">
                    Model
                  </span>
                  <div className="flex items-center gap-1.5">
                    <select
                      id={modelSelectId}
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      className="bg-[#140918] border border-[#FFA4D2]/30 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#FFFDE6] focus:outline-none focus:border-[#FF77B9] focus:ring-2 focus:ring-[#FF77B9]/20 transition shadow-inner"
                    >
                      {models.map((m) => (
                        <option key={m.id} value={m.name}>
                          {m.name}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      title="Add new model"
                      onClick={() => setIsAddingModel(!isAddingModel)}
                      className="h-7 w-7 rounded-lg bg-gradient-to-r from-[#E31B73] to-[#FF77B9] hover:brightness-110 text-[#FFFDE6] flex items-center justify-center transition shadow-md shadow-[#E31B73]/25"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Model Add Quick Input */}
              {isAddingModel && (
                <div className="p-3 bg-[#2a1032]/90 border border-[#FF77B9]/40 rounded-xl flex items-center gap-2 animate-fadeIn shadow-lg">
                  <input
                    type="text"
                    autoFocus
                    placeholder="New model name..."
                    value={newModelInput}
                    onChange={(e) => setNewModelInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddNewModel();
                      if (e.key === "Escape") setIsAddingModel(false);
                    }}
                    className="flex-1 bg-[#140918] border border-[#FFA4D2]/30 rounded-lg px-3 py-1 text-xs text-[#FFFDE6] placeholder-[#d9a0c2]/60 focus:outline-none focus:border-[#FF77B9]"
                  />
                  <button
                    type="button"
                    onClick={handleAddNewModel}
                    className="px-3 py-1 bg-gradient-to-r from-[#E31B73] to-[#FF77B9] hover:brightness-110 rounded-lg text-xs font-bold text-[#FFFDE6] transition shadow-sm"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddingModel(false)}
                    className="p-1 text-[#FFA4D2] hover:text-[#FFFDE6]"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Purchase Textarea */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor={textareaId}
                    className="text-xs font-bold text-[#FFFDE6]"
                  >
                    Purchase Text
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setPurchaseText(SAMPLE_TEXT);
                      setInlineParseError(null);
                    }}
                    className="text-[11px] text-[#FFA4D2] hover:text-[#FFFDE6] flex items-center gap-1 font-semibold hover:underline"
                  >
                    <Sparkles size={11} className="text-[#FF77B9]" />
                    Insert Sample
                  </button>
                </div>

                <textarea
                  id={textareaId}
                  rows={5}
                  placeholder="Paste the purchase message here..."
                  value={purchaseText}
                  onChange={(e) => {
                    setPurchaseText(e.target.value);
                    if (inlineParseError) setInlineParseError(null);
                  }}
                  className={`w-full bg-[#120716] border rounded-xl p-3 text-xs font-mono text-[#FFFDE6] placeholder-[#d9a0c2]/50 focus:outline-none focus:ring-2 transition resize-y ${
                    inlineParseError
                      ? "border-[#E31B73] focus:ring-[#E31B73]/30"
                      : "border-[#FFA4D2]/25 focus:border-[#FF77B9] focus:ring-[#FF77B9]/25"
                  }`}
                />

                {/* Inline Error Message near textarea as mandated by spec */}
                {inlineParseError && (
                  <div className="flex items-center gap-1.5 text-xs text-[#FFA4D2] font-semibold bg-[#2a091a]/80 border border-[#E31B73]/60 px-3 py-2 rounded-lg mt-1 shadow-sm">
                    <AlertCircle size={14} className="shrink-0 text-[#E31B73]" />
                    <span>{inlineParseError}</span>
                  </div>
                )}
              </div>

              {/* Tier Radio Buttons: Free, VIP, None. Default: None */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-[#FFFDE6]">Tier</span>
                <div className="grid grid-cols-3 gap-2">
                  {(["none", "free", "vip"] as Tier[]).map((t) => {
                    const isChecked = tier === t;
                    const label = t === "none" ? "None" : t === "free" ? "Free" : "VIP";
                    return (
                      <label
                        key={t}
                        className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-bold cursor-pointer transition select-none ${
                          isChecked
                            ? t === "vip"
                              ? "bg-[#E31B73]/25 border-[#E31B73] text-[#FFFDE6] shadow-md shadow-[#E31B73]/30"
                              : t === "free"
                              ? "bg-[#FF77B9]/25 border-[#FF77B9] text-[#FFA4D2] shadow-md shadow-[#FF77B9]/25"
                              : "bg-[#FFFDE6]/15 border-[#FFFDE6] text-[#FFFDE6] shadow-md shadow-[#FFFDE6]/20"
                            : "bg-[#160a1a]/70 border-[#FFA4D2]/20 text-[#d9a0c2] hover:border-[#FFA4D2]/40 hover:text-[#FFFDE6]"
                        }`}
                      >
                        <input
                          type="radio"
                          name="tier-selection"
                          value={t}
                          checked={isChecked}
                          onChange={() => setTier(t)}
                          className="sr-only"
                        />
                        {t === "vip" && <Crown size={13} className="text-[#FF77B9]" />}
                        {t === "free" && <Gift size={13} className="text-[#FFA4D2]" />}
                        {t === "none" && <CircleDot size={13} className="text-[#FFFDE6]" />}
                        <span>{label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Process & Save Button (full width, primary color: vibrant hot pink gradient) */}
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleProcessAndSave}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-[#E31B73] via-[#FF77B9] to-[#E31B73] hover:brightness-110 text-[#FFFDE6] font-extrabold text-sm shadow-xl shadow-[#E31B73]/40 flex items-center justify-center gap-2 transition active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              >
                {isProcessing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Processing &amp; Saving...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    <span>Process &amp; Save</span>
                  </>
                )}
              </button>

              {/* Spec notes card */}
              <div className="mt-1 p-3 bg-[#150819]/80 border border-[#FFA4D2]/15 rounded-xl text-[11px] text-[#d9a0c2] flex flex-col gap-0.5">
                <span className="font-bold text-[#FFFDE6]">Format Guide:</span>
                <span>🐳(Name)</span>
                <span>@username</span>
                <span>... date MM/DD/YY</span>
                <span>has purchased your [type] for $[amount]!</span>
              </div>
            </section>

            {/* ═════════════════════════════════════════════════
                RIGHT PANEL: "All Purchases" (7 cols)
                ═════════════════════════════════════════════════ */}
            <section
              aria-label="All Purchases"
              className="lg:col-span-7 bg-[#200e26]/90 border border-[#FFA4D2]/20 rounded-2xl p-5 shadow-2xl flex flex-col gap-4 backdrop-blur-xl"
            >
              {/* Header Row with Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#FFA4D2]/15">
                <div>
                  <h2 className="text-base font-bold text-[#FFFDE6] tracking-tight flex items-center gap-2">
                    All Purchases
                    <span className="text-xs font-extrabold px-2 py-0.5 rounded-full bg-[#E31B73]/25 text-[#FF77B9] border border-[#E31B73]/40">
                      {filteredSales.length}
                    </span>
                  </h2>
                  <p className="text-xs text-[#d9a0c2]">
                    Live purchase feed with running totals &amp; exports
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {/* Search input in table header */}
                  <div className="relative">
                    <Search
                      size={13}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#FFA4D2]/60"
                    />
                    <input
                      type="text"
                      placeholder="Search name, user, ID..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-[#140918] border border-[#FFA4D2]/30 rounded-lg pl-8 pr-3 py-1.5 text-xs text-[#FFFDE6] placeholder-[#d9a0c2]/50 focus:outline-none focus:border-[#FF77B9] w-36 sm:w-48"
                    />
                  </div>

                  {/* View Summary button */}
                  <button
                    type="button"
                    onClick={handleOpenSummary}
                    className="px-3.5 py-1.5 rounded-lg bg-[#FFA4D2]/15 hover:bg-[#FFA4D2]/25 border border-[#FFA4D2]/40 text-[#FFFDE6] font-bold text-xs flex items-center gap-1.5 transition shadow-sm"
                  >
                    <BarChart3 size={14} className="text-[#FF77B9]" />
                    <span className="hidden sm:inline">Summary</span>
                  </button>

                  {/* Save button (top right, green) — exports current table to .xlsx */}
                  <button
                    type="button"
                    onClick={handleExportExcel}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-lg shadow-emerald-600/20"
                  >
                    <Download size={14} />
                    <span>Save (.xlsx)</span>
                  </button>
                </div>
              </div>

              {/* Purchases Table */}
              {/* Columns in order: ID, Name / Username, Amount, Sale Type, Model, Tier, Date, Actions */}
              <div className="overflow-x-auto rounded-xl border border-[#FFA4D2]/20 bg-[#120716]/90">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#FFA4D2]/20 bg-[#1a0b20] text-[#FFA4D2] uppercase tracking-wider text-[10px] font-extrabold">
                      <th className="py-3 px-3">ID</th>
                      <th className="py-3 px-3">Name / Username</th>
                      <th className="py-3 px-3 text-right">Amount</th>
                      <th className="py-3 px-3">Sale Type</th>
                      <th className="py-3 px-3">Model</th>
                      <th className="py-3 px-3 text-center">Tier</th>
                      <th className="py-3 px-3">Date</th>
                      <th className="py-3 px-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#FFA4D2]/15">
                    {filteredSales.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="py-12 text-center text-[#d9a0c2] text-xs"
                        >
                          No purchase records match your query. Paste purchase text on the left to add one.
                        </td>
                      </tr>
                    ) : (
                      filteredSales.map((sale) => (
                        <tr
                          key={sale.id}
                          className="hover:bg-[#FF77B9]/[0.08] transition group"
                        >
                          {/* ID — auto-incrementing integer, shown as-is (e.g. 5555), newest first */}
                          <td className="py-3 px-3 font-mono font-bold text-[#FFA4D2]">
                            #{sale.id}
                          </td>

                          {/* Name / Username — stacked in one cell, e.g. Kody / @u80636081 */}
                          <td className="py-3 px-3">
                            <div className="flex flex-col">
                              <span className="font-bold text-[#FFFDE6] text-xs">
                                {sale.name}
                              </span>
                              <span className="font-mono text-[11px] text-[#FFA4D2]">
                                {sale.username || "—"}
                              </span>
                            </div>
                          </td>

                          {/* Amount — formatted as currency, e.g. $30.99 */}
                          <td className="py-3 px-3 text-right font-extrabold text-[#FFFDE6] font-mono text-xs">
                            {formatCurrency(Number(sale.amount))}
                          </td>

                          {/* Sale Type */}
                          <td className="py-3 px-3">
                            <span className="capitalize px-2 py-0.5 rounded-md bg-[#E31B73]/20 text-[#FFA4D2] border border-[#E31B73]/30 font-semibold text-[11px]">
                              {sale.sale_type || "message"}
                            </span>
                          </td>

                          {/* Model */}
                          <td className="py-3 px-3">
                            <span className="font-bold text-[#FF77B9]">
                              {sale.model || "—"}
                            </span>
                          </td>

                          {/* Tier — shown as small pill/badge (NONE, FREE, VIP) */}
                          <td className="py-3 px-3 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${getTierBadgeClass(
                                sale.tier
                              )}`}
                            >
                              {(sale.tier || "none").toUpperCase()}
                            </span>
                          </td>

                          {/* Date */}
                          <td className="py-3 px-3 text-[#d9a0c2] text-[11px]">
                            {formatDate(sale.date)}
                          </td>

                          {/* Actions: Edit (pink) and Delete (magenta) buttons per row */}
                          <td className="py-3 px-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {/* Edit button */}
                              <button
                                type="button"
                                title="Edit row"
                                onClick={() => handleOpenEdit(sale)}
                                className="p-1.5 rounded-lg bg-[#FFA4D2]/15 hover:bg-[#FFA4D2] text-[#FFA4D2] hover:text-[#120815] border border-[#FFA4D2]/35 transition shadow-sm"
                              >
                                <Pencil size={13} />
                              </button>
                              {/* Delete button */}
                              <button
                                type="button"
                                title="Delete row"
                                onClick={() => setDeletingSale(sale)}
                                className="p-1.5 rounded-lg bg-[#E31B73]/15 hover:bg-[#E31B73] text-[#FF77B9] hover:text-[#FFFDE6] border border-[#E31B73]/40 transition shadow-sm"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Footer row below the table: Total: $X plus per-tier subtotals (VIP: $X, FREE: $X, NONE: $X) */}
              {/* Computed client-side from whatever rows are currently loaded — no API call */}
              <div className="p-3.5 bg-[#17091c]/95 border border-[#FFA4D2]/25 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs shadow-inner">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#FFA4D2] uppercase tracking-wider text-[11px]">
                    Total:
                  </span>
                  <span className="font-black text-sm text-[#FFFDE6] font-mono">
                    {formatCurrency(totalAmount)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs font-bold">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#E31B73]" />
                    <span className="text-[#FF77B9] font-bold">VIP:</span>
                    <span className="text-[#FFFDE6] font-mono">
                      {formatCurrency(vipAmount)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#FFA4D2]" />
                    <span className="text-[#FFA4D2] font-bold">FREE:</span>
                    <span className="text-[#FFFDE6] font-mono">
                      {formatCurrency(freeAmount)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#FFFDE6]" />
                    <span className="text-[#d9a0c2] font-bold">NONE:</span>
                    <span className="text-[#FFFDE6] font-mono">
                      {formatCurrency(noneAmount)}
                    </span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>

      {/* ═════════════════════════════════════════════════════
          EDIT MODAL
          ═════════════════════════════════════════════════════ */}
      {editingSale && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#1c0b20] border border-[#FFA4D2]/30 w-full max-w-md rounded-2xl p-6 shadow-2xl flex flex-col gap-4 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-[#FFA4D2]/20 pb-3">
              <h3 className="font-bold text-[#FFFDE6] text-base flex items-center gap-2">
                <Pencil size={16} className="text-[#FFA4D2]" />
                Edit Purchase #{editingSale.id}
              </h3>
              <button
                type="button"
                onClick={() => setEditingSale(null)}
                className="text-[#FFA4D2] hover:text-[#FFFDE6]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex flex-col gap-1">
                <label className="font-bold text-[#FFA4D2]">Name</label>
                <input
                  type="text"
                  value={editFormData.name}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, name: e.target.value })
                  }
                  className="bg-[#120716] border border-[#FFA4D2]/25 rounded-lg p-2 text-[#FFFDE6] focus:border-[#FF77B9]"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-bold text-[#FFA4D2]">Username</label>
                <input
                  type="text"
                  value={editFormData.username}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      username: e.target.value,
                    })
                  }
                  className="bg-[#120716] border border-[#FFA4D2]/25 rounded-lg p-2 text-[#FFFDE6] focus:border-[#FF77B9]"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-bold text-[#FFA4D2]">
                  Amount ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editFormData.amount}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, amount: e.target.value })
                  }
                  className="bg-[#120716] border border-[#FFA4D2]/25 rounded-lg p-2 text-[#FFFDE6] font-mono focus:border-[#FF77B9]"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-bold text-[#FFA4D2]">Sale Type</label>
                <input
                  type="text"
                  value={editFormData.sale_type}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      sale_type: e.target.value,
                    })
                  }
                  className="bg-[#120716] border border-[#FFA4D2]/25 rounded-lg p-2 text-[#FFFDE6] focus:border-[#FF77B9]"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-bold text-[#FFA4D2]">Model</label>
                <select
                  value={editFormData.model}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, model: e.target.value })
                  }
                  className="bg-[#120716] border border-[#FFA4D2]/25 rounded-lg p-2 text-[#FFFDE6] focus:border-[#FF77B9]"
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.name}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-bold text-[#FFA4D2]">Tier</label>
                <select
                  value={editFormData.tier}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      tier: e.target.value as Tier,
                    })
                  }
                  className="bg-[#120716] border border-[#FFA4D2]/25 rounded-lg p-2 text-[#FFFDE6] capitalize focus:border-[#FF77B9]"
                >
                  <option value="none">None</option>
                  <option value="free">Free</option>
                  <option value="vip">VIP</option>
                </select>
              </div>

              <div className="col-span-2 flex flex-col gap-1">
                <label className="font-bold text-[#FFA4D2]">Date</label>
                <input
                  type="date"
                  value={editFormData.date}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, date: e.target.value })
                  }
                  className="bg-[#120716] border border-[#FFA4D2]/25 rounded-lg p-2 text-[#FFFDE6] focus:border-[#FF77B9]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#FFA4D2]/20">
              <button
                type="button"
                onClick={() => setEditingSale(null)}
                className="px-4 py-2 rounded-lg bg-[#2b1130] hover:bg-[#3d1844] text-[#FFA4D2] text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#E31B73] to-[#FF77B9] text-[#FFFDE6] text-xs font-extrabold shadow-lg shadow-[#E31B73]/30"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════
          DELETE CONFIRMATION MODAL
          ═════════════════════════════════════════════════════ */}
      {deletingSale && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#1c0b20] border border-[#E31B73]/50 w-full max-w-sm rounded-2xl p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center gap-3 text-[#E31B73]">
              <div className="p-2 rounded-xl bg-[#E31B73]/20 border border-[#E31B73]/40">
                <Trash2 size={20} className="text-[#FF77B9]" />
              </div>
              <h3 className="font-bold text-[#FFFDE6] text-base">Delete Purchase</h3>
            </div>

            <p className="text-xs text-[#d9a0c2] leading-relaxed">
              Are you sure you want to delete purchase #{deletingSale.id} for{" "}
              <strong className="text-[#FFFDE6]">{deletingSale.name}</strong> (
              {formatCurrency(Number(deletingSale.amount))})? This action removes
              it from the database.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingSale(null)}
                className="px-3 py-1.5 rounded-lg bg-[#2b1130] hover:bg-[#3d1844] text-[#FFA4D2] text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-3.5 py-1.5 rounded-lg bg-[#E31B73] hover:bg-[#c91462] text-[#FFFDE6] text-xs font-extrabold shadow-lg shadow-[#E31B73]/30"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════
          SUMMARY MODAL (Computed by POST /api/summarize)
          ═════════════════════════════════════════════════════ */}
      {showSummary && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#1c0b20] border border-[#FFA4D2]/30 w-full max-w-2xl rounded-2xl p-6 shadow-2xl flex flex-col gap-5 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#FFA4D2]/20 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-[#E31B73]/20 border border-[#E31B73]/40 text-[#FF77B9]">
                  <BarChart3 size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-[#FFFDE6] text-base">
                    Sales Summary (SQL Aggregation)
                  </h3>
                  <p className="text-xs text-[#d9a0c2]">
                    Calculated on server with zero AI latency
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSummary(false)}
                className="text-[#FFA4D2] hover:text-[#FFFDE6]"
              >
                <X size={18} />
              </button>
            </div>

            {isLoadingSummary ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3 text-[#d9a0c2]">
                <Loader2 size={24} className="animate-spin text-[#FF77B9]" />
                <span className="text-xs">Computing stats...</span>
              </div>
            ) : summaryData ? (
              <div className="flex flex-col gap-4 text-xs">
                {/* Key KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-[#240e29] border border-[#FFA4D2]/20 rounded-xl flex flex-col gap-1">
                    <span className="text-[10px] uppercase font-bold text-[#FFA4D2]">
                      Total Revenue
                    </span>
                    <span className="text-lg font-black text-[#FFFDE6] font-mono">
                      {formatCurrency(summaryData.total_revenue)}
                    </span>
                  </div>

                  <div className="p-3 bg-[#240e29] border border-[#FFA4D2]/20 rounded-xl flex flex-col gap-1">
                    <span className="text-[10px] uppercase font-bold text-[#FFA4D2]">
                      Total Sales
                    </span>
                    <span className="text-lg font-black text-[#FFFDE6] font-mono">
                      {summaryData.sales_count}
                    </span>
                  </div>

                  <div className="p-3 bg-[#240e29] border border-[#FFA4D2]/20 rounded-xl flex flex-col gap-1">
                    <span className="text-[10px] uppercase font-bold text-[#FF77B9]">
                      VIP Revenue
                    </span>
                    <span className="text-lg font-black text-[#FF77B9] font-mono">
                      {formatCurrency(summaryData.vip_subtotal)}
                    </span>
                  </div>

                  <div className="p-3 bg-[#240e29] border border-[#FFA4D2]/20 rounded-xl flex flex-col gap-1">
                    <span className="text-[10px] uppercase font-bold text-[#FFA4D2]">
                      Free Revenue
                    </span>
                    <span className="text-lg font-black text-[#FFA4D2] font-mono">
                      {formatCurrency(summaryData.free_subtotal)}
                    </span>
                  </div>
                </div>

                {/* Top Buyer & Date Range */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 bg-gradient-to-r from-[#E31B73]/20 to-[#FFA4D2]/10 border border-[#E31B73]/40 rounded-xl flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-[#E31B73]/25 border border-[#E31B73]/40 flex items-center justify-center text-[#FFFDE6]">
                      <Crown size={20} />
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-[#FFA4D2] block">
                        Top Buyer by Spend
                      </span>
                      {summaryData.top_buyer ? (
                        <div>
                          <span className="font-bold text-[#FFFDE6] text-xs block">
                            {summaryData.top_buyer.name} ({summaryData.top_buyer.username})
                          </span>
                          <span className="text-[#FF77B9] font-mono font-bold text-xs">
                            {formatCurrency(summaryData.top_buyer.total_spend)} (
                            {summaryData.top_buyer.count} purchases)
                          </span>
                        </div>
                      ) : (
                        <span className="text-[#d9a0c2]">No buyer data</span>
                      )}
                    </div>
                  </div>

                  <div className="p-3.5 bg-[#240e29] border border-[#FFA4D2]/20 rounded-xl flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-[#17091c] border border-[#FFA4D2]/30 flex items-center justify-center text-[#FFA4D2]">
                      <Calendar size={20} />
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-[#FFA4D2] block">
                        Date Range Covered
                      </span>
                      <span className="font-bold text-[#FFFDE6] text-xs">
                        {summaryData.date_range.min_date
                          ? `${formatDate(summaryData.date_range.min_date)} — ${formatDate(
                              summaryData.date_range.max_date || ""
                            )}`
                          : "No records yet"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Breakdown by Model & Breakdown by Sale Type */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  {/* Model breakdown */}
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-bold text-[#FFFDE6] flex items-center gap-1.5">
                      <Layers size={14} className="text-[#FF77B9]" />
                      Breakdown by Model
                    </span>
                    <div className="border border-[#FFA4D2]/20 rounded-xl overflow-hidden divide-y divide-[#FFA4D2]/15 bg-[#17091c]">
                      {summaryData.by_model.length === 0 ? (
                        <div className="p-3 text-[#d9a0c2] text-center">
                          No models recorded
                        </div>
                      ) : (
                        summaryData.by_model.map((item) => (
                          <div
                            key={item.model}
                            className="p-2.5 flex items-center justify-between"
                          >
                            <span className="font-bold text-[#FFFDE6]">
                              {item.model}
                            </span>
                            <div className="flex items-center gap-2 text-right">
                              <span className="text-[11px] text-[#d9a0c2]">
                                {item.count} sales
                              </span>
                              <span className="font-mono font-bold text-[#FF77B9]">
                                {formatCurrency(item.revenue)}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Sale Type breakdown */}
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-bold text-[#FFFDE6] flex items-center gap-1.5">
                      <ShoppingBag size={14} className="text-[#FFA4D2]" />
                      Breakdown by Sale Type
                    </span>
                    <div className="border border-[#FFA4D2]/20 rounded-xl overflow-hidden divide-y divide-[#FFA4D2]/15 bg-[#17091c]">
                      {summaryData.by_sale_type.length === 0 ? (
                        <div className="p-3 text-[#d9a0c2] text-center">
                          No sale types recorded
                        </div>
                      ) : (
                        summaryData.by_sale_type.map((item) => (
                          <div
                            key={item.sale_type}
                            className="p-2.5 flex items-center justify-between"
                          >
                            <span className="font-bold capitalize text-[#FFFDE6]">
                              {item.sale_type}
                            </span>
                            <div className="flex items-center gap-2 text-right">
                              <span className="text-[11px] text-[#d9a0c2]">
                                {item.count} sales
                              </span>
                              <span className="font-mono font-bold text-[#FF77B9]">
                                {formatCurrency(item.revenue)}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex justify-end pt-2 border-t border-[#FFA4D2]/20">
              <button
                type="button"
                onClick={() => setShowSummary(false)}
                className="px-4 py-2 rounded-lg bg-[#2b1130] hover:bg-[#3d1844] text-[#FFA4D2] text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
