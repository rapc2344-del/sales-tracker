"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  FolderClock,
  LayoutDashboard,
  FileSpreadsheet,
  Trash2,
  Sparkles,
  Search,
  ArrowLeft,
  Calendar,
  Layers,
  ShoppingBag,
  DollarSign,
  TrendingUp,
  Menu,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
  Crown,
  Gift,
  CircleDot,
  RefreshCw,
  Receipt,
  Pencil,
  Save,
  Plus,
  Calculator,
  ClipboardPaste,
} from "lucide-react";
import type { SavedSummary, Tier } from "@/lib/types";
import { parseSummaryDate, getCutoffForDate } from "@/app/invoice/page";
import { parsePurchaseText } from "@/lib/parser";

const SAMPLE_TEXT = `🐳(Kody)
@u80636081
XXXtreme Spenders-V8Ctalking rn 10/14/25
has purchased your message for $30.99!`;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export default function SavedSummariesPage() {
  const [savedSummaries, setSavedSummaries] = useState<SavedSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedModelFilter, setSelectedModelFilter] = useState<string>("all");
  const [selectedCutoffFilter, setSelectedCutoffFilter] = useState<string>("all");
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Edit Modal State
  const [editingSummary, setEditingSummary] = useState<SavedSummary | null>(null);
  const [editFilename, setEditFilename] = useState<string>("");
  const [editDate, setEditDate] = useState<string>("");
  const [editTotalRevenue, setEditTotalRevenue] = useState<string | number>(0);
  const [editNoneSubtotal, setEditNoneSubtotal] = useState<string | number>(0);
  const [editVipSubtotal, setEditVipSubtotal] = useState<string | number>(0);
  const [editFreeSubtotal, setEditFreeSubtotal] = useState<string | number>(0);
  const [editSalesCount, setEditSalesCount] = useState<string | number>(0);
  const [editByModel, setEditByModel] = useState<{ model: string; revenue: number; count: number }[]>([]);
  const [editBySaleType, setEditBySaleType] = useState<{ sale_type: string; revenue: number; count: number }[]>([]);
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Late Sale state inside edit modal
  const [lateSaleText, setLateSaleText] = useState<string>("");
  const [lateSelectedModel, setLateSelectedModel] = useState<string>("Nadya");
  const [lateTier, setLateTier] = useState<Tier>("none");
  const [inlineLateParseError, setInlineLateParseError] = useState<string | null>(null);
  const [lateSaleSuccessMsg, setLateSaleSuccessMsg] = useState<string | null>(null);
  const [showLateSalesBox, setShowLateSalesBox] = useState<boolean>(true);


  const showToast = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const fetchSavedSummaries = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/saved-summaries");
      if (!res.ok) throw new Error("Failed to load saved summaries");
      const data: SavedSummary[] = await res.json();
      setSavedSummaries(data);
    } catch {
      showToast("error", "Could not load saved summaries from database");
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchSavedSummaries();
  }, [fetchSavedSummaries]);

  const handleDelete = async (id: number, filename: string) => {
    if (!confirm(`Are you sure you want to remove the summary snapshot for "${filename}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/saved-summaries/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete snapshot");
      setSavedSummaries((prev) => prev.filter((s) => s.id !== id));
      showToast("success", `Snapshot "${filename}" deleted`);
    } catch {
      showToast("error", "Failed to delete snapshot from database");
    }
  };

  // ── Edit Modal Handlers ─────────────────────────────────────
  const handleOpenEditModal = (summary: SavedSummary) => {
    setEditingSummary(summary);
    setEditFilename(summary.export_filename || "");

    let formattedDate = "";
    try {
      const d = new Date(summary.created_at);
      if (!isNaN(d.getTime())) {
        const pad = (n: number) => String(n).padStart(2, "0");
        formattedDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }
    } catch {}
    setEditDate(formattedDate);

    setEditTotalRevenue(summary.total_revenue ?? 0);
    setEditNoneSubtotal(summary.none_subtotal ?? 0);
    setEditVipSubtotal(summary.vip_subtotal ?? 0);
    setEditFreeSubtotal(summary.free_subtotal ?? 0);
    setEditSalesCount(summary.sales_count ?? 0);
    setEditByModel(summary.by_model ? JSON.parse(JSON.stringify(summary.by_model)) : []);
    setEditBySaleType(summary.by_sale_type ? JSON.parse(JSON.stringify(summary.by_sale_type)) : []);
    setEditError(null);

    // Reset Late Sale input
    setLateSaleText("");
    setInlineLateParseError(null);
    setLateSaleSuccessMsg(null);
    if (summary.by_model && summary.by_model.length > 0) {
      setLateSelectedModel(summary.by_model[0].model);
    } else {
      setLateSelectedModel("Nadya");
    }
    setLateTier("none");
  };

  const handleCloseEditModal = () => {
    if (isSavingEdit) return;
    setEditingSummary(null);
    setEditError(null);
    setLateSaleText("");
    setInlineLateParseError(null);
    setLateSaleSuccessMsg(null);
  };

  // ── Process & Add Late Sale to Current Summary ──────────────
  const handleProcessAndAddLateSale = () => {
    setInlineLateParseError(null);
    setLateSaleSuccessMsg(null);

    if (!lateSaleText.trim()) {
      setInlineLateParseError("Couldn't parse this text — check the format");
      return;
    }

    const parsed = parsePurchaseText(lateSaleText);
    if (!parsed) {
      setInlineLateParseError("Couldn't parse this text — check the format");
      return;
    }

    const addedAmount = Number(parsed.amount) || 0;
    const modelToCredit = lateSelectedModel.trim() || "Nadya";

    // 1. Increase Total Revenue
    setEditTotalRevenue((prev) => Math.round(((Number(prev) || 0) + addedAmount) * 100) / 100);

    // 2. Increase Sales Count
    setEditSalesCount((prev) => (Number(prev) || 0) + 1);

    // 3. Credit appropriate Tier Subtotal
    if (lateTier === "vip") {
      setEditVipSubtotal((prev) => Math.round(((Number(prev) || 0) + addedAmount) * 100) / 100);
    } else if (lateTier === "free") {
      setEditFreeSubtotal((prev) => Math.round(((Number(prev) || 0) + addedAmount) * 100) / 100);
    } else {
      setEditNoneSubtotal((prev) => Math.round(((Number(prev) || 0) + addedAmount) * 100) / 100);
    }

    // 4. Update By Model entry
    setEditByModel((prev) => {
      const idx = prev.findIndex((m) => m.model.toLowerCase() === modelToCredit.toLowerCase());
      if (idx !== -1) {
        return prev.map((m, i) =>
          i === idx
            ? {
                ...m,
                revenue: Math.round(((Number(m.revenue) || 0) + addedAmount) * 100) / 100,
                count: (Number(m.count) || 0) + 1,
              }
            : m
        );
      } else {
        return [...prev, { model: modelToCredit, revenue: addedAmount, count: 1 }];
      }
    });

    // 5. Update By Sale Type entry
    const saleTypeToCredit = parsed.sale_type?.trim() || "message";
    setEditBySaleType((prev) => {
      const idx = prev.findIndex((st) => st.sale_type.toLowerCase() === saleTypeToCredit.toLowerCase());
      if (idx !== -1) {
        return prev.map((st, i) =>
          i === idx
            ? {
                ...st,
                revenue: Math.round(((Number(st.revenue) || 0) + addedAmount) * 100) / 100,
                count: (Number(st.count) || 0) + 1,
              }
            : st
        );
      } else {
        return [...prev, { sale_type: saleTypeToCredit, revenue: addedAmount, count: 1 }];
      }
    });

    // 6. Success notification & clear textarea
    setLateSaleSuccessMsg(
      `Added late sale: ${parsed.name} (+${formatCurrency(addedAmount)}) to totals & ${modelToCredit} [${lateTier.toUpperCase()}].`
    );
    setLateSaleText("");
  };


  const handleAutoSumSubtotals = () => {
    const none = Number(editNoneSubtotal) || 0;
    const vip = Number(editVipSubtotal) || 0;
    const free = Number(editFreeSubtotal) || 0;
    const sum = Math.round((none + vip + free) * 100) / 100;
    setEditTotalRevenue(sum);
  };

  const handleRecalcFromModels = () => {
    const totalRev = editByModel.reduce((sum, m) => sum + (Number(m.revenue) || 0), 0);
    const totalCount = editByModel.reduce((sum, m) => sum + (Number(m.count) || 0), 0);
    setEditTotalRevenue(Math.round(totalRev * 100) / 100);
    setEditSalesCount(totalCount);
  };

  const handleAddModelRow = () => {
    setEditByModel((prev) => [...prev, { model: "", revenue: 0, count: 0 }]);
  };

  const handleRemoveModelRow = (index: number) => {
    setEditByModel((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateModelRow = (index: number, field: "model" | "revenue" | "count", val: string | number) => {
    setEditByModel((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        return {
          ...item,
          [field]: field === "model" ? String(val) : Number(val) || 0,
        };
      })
    );
  };

  const handleAddSaleTypeRow = () => {
    setEditBySaleType((prev) => [...prev, { sale_type: "", revenue: 0, count: 0 }]);
  };

  const handleRemoveSaleTypeRow = (index: number) => {
    setEditBySaleType((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateSaleTypeRow = (index: number, field: "sale_type" | "revenue" | "count", val: string | number) => {
    setEditBySaleType((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        return {
          ...item,
          [field]: field === "sale_type" ? String(val) : Number(val) || 0,
        };
      })
    );
  };

  const handleSaveEdit = async () => {
    if (!editingSummary) return;
    setIsSavingEdit(true);
    setEditError(null);

    try {
      const updatedPayload = {
        export_filename: editFilename.trim() || editingSummary.export_filename,
        created_at: editDate ? new Date(editDate).toISOString() : editingSummary.created_at,
        total_revenue: Number(editTotalRevenue) || 0,
        none_subtotal: Number(editNoneSubtotal) || 0,
        vip_subtotal: Number(editVipSubtotal) || 0,
        free_subtotal: Number(editFreeSubtotal) || 0,
        sales_count: Number(editSalesCount) || 0,
        by_model: editByModel
          .map((m) => ({
            model: m.model.trim() || "Unknown",
            revenue: Number(m.revenue) || 0,
            count: Number(m.count) || 0,
          }))
          .filter((m) => m.model),
        by_sale_type: editBySaleType
          .map((st) => ({
            sale_type: st.sale_type.trim() || "other",
            revenue: Number(st.revenue) || 0,
            count: Number(st.count) || 0,
          }))
          .filter((st) => st.sale_type),
      };

      const res = await fetch(`/api/saved-summaries/${editingSummary.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedPayload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to update saved summary");
      }

      const updatedData: SavedSummary = await res.json();

      setSavedSummaries((prev) =>
        prev.map((s) => (s.id === updatedData.id ? updatedData : s))
      );

      showToast("success", `Summary "${updatedData.export_filename}" updated successfully!`);
      setEditingSummary(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update summary";
      setEditError(msg);
    } finally {
      setIsSavingEdit(false);
    }
  };


  // Distinct models across all saved snapshots for filter
  const allModels = useMemo(() => {
    const modelsSet = new Set<string>();
    savedSummaries.forEach((s) => {
      s.by_model?.forEach((m) => {
        if (m.model) modelsSet.add(m.model);
      });
    });
    return Array.from(modelsSet).sort();
  }, [savedSummaries]);

  // Distinct cutoffs across all saved snapshots
  const allCutoffs = useMemo(() => {
    const map = new Map<string, { id: string; label: string; type: "8-23" | "24-7"; count: number }>();
    savedSummaries.forEach((s) => {
      const date = parseSummaryDate(s);
      const cutoff = getCutoffForDate(date);
      const existing = map.get(cutoff.id);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(cutoff.id, { id: cutoff.id, label: cutoff.label, type: cutoff.type, count: 1 });
      }
    });
    return Array.from(map.values());
  }, [savedSummaries]);

  // Filtered summaries
  const filteredSummaries = useMemo(() => {
    return savedSummaries.filter((s) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        s.export_filename.toLowerCase().includes(q) ||
        s.by_model?.some((m) => m.model.toLowerCase().includes(q)) ||
        s.by_sale_type?.some((st) => st.sale_type.toLowerCase().includes(q));

      const matchesModel =
        selectedModelFilter === "all" ||
        s.by_model?.some(
          (m) => m.model.toLowerCase() === selectedModelFilter.toLowerCase()
        );

      let matchesCutoff = true;
      if (selectedCutoffFilter !== "all") {
        const date = parseSummaryDate(s);
        const cutoff = getCutoffForDate(date);
        matchesCutoff = cutoff.id === selectedCutoffFilter || cutoff.type === selectedCutoffFilter;
      }

      return matchesSearch && matchesModel && matchesCutoff;
    });
  }, [savedSummaries, searchQuery, selectedModelFilter, selectedCutoffFilter]);

  // Aggregate metrics
  const totalCumulativeRevenue = useMemo(() => {
    return savedSummaries.reduce((sum, s) => sum + (s.total_revenue || 0), 0);
  }, [savedSummaries]);

  const totalCumulativeSales = useMemo(() => {
    return savedSummaries.reduce((sum, s) => sum + (s.sales_count || 0), 0);
  }, [savedSummaries]);

  const totalNoneRevenue = useMemo(() => {
    return savedSummaries.reduce((sum, s) => sum + (s.none_subtotal || 0), 0);
  }, [savedSummaries]);

  const totalVipRevenue = useMemo(() => {
    return savedSummaries.reduce((sum, s) => sum + (s.vip_subtotal || 0), 0);
  }, [savedSummaries]);

  return (
    <div className="min-h-screen bg-[#120815] text-[#FCE0F0] flex flex-col font-sans selection:bg-[#E31B73]/40 selection:text-[#FFFDE6]">
      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border backdrop-blur-md animate-slideDown ${
            toast.type === "success"
              ? "bg-[#200d28]/95 border-[#E31B73] text-[#FFFDE6] shadow-[#E31B73]/30"
              : "bg-red-950/95 border-red-500 text-red-100 shadow-red-900/40"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 size={18} className="text-[#FF77B9]" />
          ) : (
            <AlertCircle size={18} className="text-red-400" />
          )}
          <span className="text-sm font-medium">{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-[#FFA4D2] hover:text-[#FFFDE6] ml-2"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── TOP NAVBAR ───────────────────────────────────────── */}
      <header className="h-16 border-b border-[#FFA4D2]/20 bg-[#19091e]/90 backdrop-blur-md px-4 md:px-6 flex items-center justify-between sticky top-0 z-30 shadow-md">
        {/* Left branding & Toggle */}
        <div className="flex items-center gap-3 md:gap-4">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 rounded-xl bg-[#250f2c] hover:bg-[#34143d] text-[#FFA4D2] hover:text-[#FFFDE6] transition border border-[#FFA4D2]/20"
            title="Toggle Sidebar"
          >
            <Menu size={18} />
          </button>

          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-[#E31B73] via-[#FF77B9] to-[#FFA4D2] p-[1.5px] shadow-lg shadow-[#E31B73]/20 group-hover:scale-105 transition-transform">
              <div className="h-full w-full bg-[#18081d] rounded-[10px] flex items-center justify-center">
                <Sparkles size={18} className="text-[#FF77B9]" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-sm tracking-tight text-[#FFFDE6] flex items-center gap-1.5">
                Sales Tracker
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-md bg-[#E31B73]/25 text-[#FF77B9] border border-[#E31B73]/40">
                  v2.0
                </span>
              </span>
              <span className="text-[10px] text-[#FFA4D2]/70 font-medium">
                Saved Summaries &amp; Export History
              </span>
            </div>
          </Link>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={fetchSavedSummaries}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#250f2c] hover:bg-[#34143d] border border-[#FFA4D2]/20 text-xs font-semibold text-[#FFA4D2] hover:text-[#FFFDE6] transition"
          >
            <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>

          <Link
            href="/"
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#E31B73] to-[#FF77B9] hover:from-[#c91564] hover:to-[#ff5ea9] text-[#FFFDE6] text-xs font-bold shadow-lg shadow-[#E31B73]/25 hover:shadow-[#E31B73]/40 transition"
          >
            <LayoutDashboard size={14} />
            <span>Dashboard</span>
          </Link>

          {/* Admin Icon */}
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#E31B73] to-[#FFA4D2] p-[1.5px] flex items-center justify-center shadow-md">
            <div className="h-full w-full rounded-full bg-[#1c0b20] flex items-center justify-center text-[11px] font-bold text-[#FFFDE6]">
              👑
            </div>
          </div>
        </div>
      </header>

      {/* ── APP BODY: SIDEBAR + MAIN CONTENT ─────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── LEFT SIDEBAR ─────────────────────────────────── */}
        <aside
          className={`bg-[#180a1c] border-r border-[#FFA4D2]/20 transition-all duration-300 flex flex-col shrink-0 z-20 ${
            isSidebarOpen ? "w-64" : "w-0 -translate-x-full md:translate-x-0 md:w-16"
          }`}
        >
          <div className="p-3 flex flex-col gap-2 flex-1 overflow-y-auto">
            {isSidebarOpen && (
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#FFA4D2]/60 px-2.5 mb-1">
                Navigation
              </span>
            )}

            {/* Dashboard Link */}
            <Link
              href="/"
              title="Dashboard"
              className={`w-full flex items-center ${
                isSidebarOpen ? "justify-between px-3.5" : "justify-center px-2"
              } py-2.5 rounded-xl font-bold text-xs text-[#d9a0c2] hover:bg-[#250f2c] hover:text-[#FFFDE6] border border-transparent hover:border-[#FFA4D2]/20 transition group`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <LayoutDashboard
                  size={18}
                  className="text-[#FFA4D2]/80 group-hover:text-[#FF77B9] group-hover:scale-110 transition-transform shrink-0"
                />
                {isSidebarOpen && <span className="truncate">Dashboard</span>}
              </div>
            </Link>

            {/* Saved Summaries Link (Active on this page) */}
            <Link
              href="/saved-summaries"
              title="Saved Summaries"
              className={`w-full flex items-center ${
                isSidebarOpen ? "justify-between px-3.5" : "justify-center px-2"
              } py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-[#E31B73]/30 via-[#FF77B9]/20 to-[#E31B73]/20 text-[#FFFDE6] border border-[#E31B73]/50 shadow-md shadow-[#E31B73]/15 transition group`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <FolderClock
                  size={18}
                  className="text-[#FF77B9] group-hover:scale-110 transition-transform shrink-0"
                />
                {isSidebarOpen && (
                  <span className="truncate">Saved Summaries</span>
                )}
              </div>
              {isSidebarOpen && savedSummaries.length > 0 && (
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#E31B73]/30 text-[#FFFDE6] border border-[#E31B73]/40 shrink-0">
                  {savedSummaries.length}
                </span>
              )}
            </Link>

            {/* Invoice Generator Link */}
            <Link
              href="/invoice"
              title="Invoice Generator"
              className={`w-full flex items-center ${
                isSidebarOpen ? "justify-between px-3.5" : "justify-center px-2"
              } py-2.5 rounded-xl font-bold text-xs text-[#d9a0c2] hover:bg-[#250f2c] hover:text-[#FFFDE6] border border-transparent hover:border-[#FFA4D2]/20 transition group`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Receipt
                  size={18}
                  className="text-[#FFA4D2]/80 group-hover:text-[#FF77B9] group-hover:scale-110 transition-transform shrink-0"
                />
                {isSidebarOpen && (
                  <span className="truncate">Invoice Generator</span>
                )}
              </div>
            </Link>

            {/* Attendance Tracker Link */}
            <Link
              href="/attendance-tracker"
              title="Attendance Tracker"
              className={`w-full flex items-center ${
                isSidebarOpen ? "justify-between px-3.5" : "justify-center px-2"
              } py-2.5 rounded-xl font-bold text-xs text-[#d9a0c2] hover:bg-[#250f2c] hover:text-[#FFFDE6] border border-transparent hover:border-[#FFA4D2]/20 transition group`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <FileSpreadsheet
                  size={18}
                  className="text-[#FFA4D2]/80 group-hover:text-[#FF77B9] group-hover:scale-110 transition-transform shrink-0"
                />
                {isSidebarOpen && (
                  <span className="truncate">Attendance Tracker</span>
                )}
              </div>
            </Link>
          </div>
        </aside>


        {/* ── MAIN CONTENT WORKSPACE ───────────────────────── */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-6">
          {/* Top Hero / Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-xl md:text-2xl font-black text-[#FFFDE6] tracking-tight flex items-center gap-2.5">
                <FolderClock className="text-[#FF77B9]" size={24} />
                <span>Saved Summaries &amp; Export History</span>
              </h1>
              <p className="text-xs md:text-sm text-[#FFA4D2]/80 max-w-2xl">
                Every time you click <strong className="text-[#FFFDE6]">&ldquo;Save (.xlsx)&rdquo;</strong> on the dashboard, a spreadsheet is generated and a comprehensive financial snapshot is automatically recorded here.
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <Link
                href="/"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#200e26] hover:bg-[#2e1337] border border-[#FFA4D2]/25 text-xs font-bold text-[#FFA4D2] hover:text-[#FFFDE6] transition shadow-sm"
              >
                <ArrowLeft size={14} />
                <span>Go to Dashboard</span>
              </Link>
            </div>
          </div>

          {/* Aggregate Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-[#200e26]/90 border border-[#FFA4D2]/20 shadow-xl flex flex-col gap-1 relative overflow-hidden backdrop-blur-xl">
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#E31B73]/10 rounded-full blur-2xl pointer-events-none" />
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#FFA4D2]/70 flex items-center gap-1.5">
                <FileSpreadsheet size={13} className="text-[#FF77B9]" />
                Saved Exports
              </span>
              <span className="text-2xl font-mono font-black text-[#FFFDE6]">
                {savedSummaries.length}
              </span>
              <span className="text-[11px] text-[#FFA4D2]/60">
                Snapshots stored in database
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[#200e26]/90 border border-[#FFA4D2]/20 shadow-xl flex flex-col gap-1 relative overflow-hidden backdrop-blur-xl">
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#FF77B9]/10 rounded-full blur-2xl pointer-events-none" />
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#FFA4D2]/70 flex items-center gap-1.5">
                <DollarSign size={13} className="text-[#FF77B9]" />
                Cumulative Export Revenue
              </span>
              <span className="text-2xl font-mono font-black text-[#FFFDE6]">
                {formatCurrency(totalCumulativeRevenue)}
              </span>
              <span className="text-[11px] text-[#FFA4D2]/60">
                Across all recorded exports
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[#200e26]/90 border border-[#FFA4D2]/20 shadow-xl flex flex-col gap-1 relative overflow-hidden backdrop-blur-xl">
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#FFA4D2]/10 rounded-full blur-2xl pointer-events-none" />
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#FFA4D2]/70 flex items-center gap-1.5">
                <CircleDot size={13} className="text-[#FFFDE6]" />
                None Sales Subtotal
              </span>
              <span className="text-2xl font-mono font-black text-[#FFFDE6]">
                {formatCurrency(totalNoneRevenue)}
              </span>
              <span className="text-[11px] text-[#FFA4D2]/60">
                VIP Total: {formatCurrency(totalVipRevenue)}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[#200e26]/90 border border-[#FFA4D2]/20 shadow-xl flex flex-col gap-1 relative overflow-hidden backdrop-blur-xl">
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#E31B73]/10 rounded-full blur-2xl pointer-events-none" />
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#FFA4D2]/70 flex items-center gap-1.5">
                <TrendingUp size={13} className="text-[#FF77B9]" />
                Recorded Transactions
              </span>
              <span className="text-2xl font-mono font-black text-[#FFFDE6]">
                {totalCumulativeSales}
              </span>
              <span className="text-[11px] text-[#FFA4D2]/60">
                Total purchases logged in snapshots
              </span>
            </div>
          </div>

          {/* Search & Filter Controls */}
          <div className="p-4 rounded-2xl bg-[#1c0b20] border border-[#FFA4D2]/20 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-lg">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#FFA4D2]/60 pointer-events-none"
              />
              <input
                type="text"
                placeholder="Search by filename, model, or sale type..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#120815] border border-[#FFA4D2]/25 rounded-xl pl-9 pr-8 py-2 text-xs text-[#FFFDE6] placeholder-[#FFA4D2]/40 focus:outline-none focus:border-[#E31B73] focus:ring-1 focus:ring-[#E31B73]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#FFA4D2]/60 hover:text-[#FFFDE6]"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Cutoff Filter Dropdown */}
            <div className="flex items-center gap-2 shrink-0">
              <label htmlFor="cutoffFilterSelect" className="text-xs font-bold text-[#FFA4D2]/80 flex items-center gap-1.5 shrink-0">
                <Calendar size={13} className="text-[#FF77B9]" />
                <span>Cutoff:</span>
              </label>
              <select
                id="cutoffFilterSelect"
                value={selectedCutoffFilter}
                onChange={(e) => setSelectedCutoffFilter(e.target.value)}
                className="bg-[#120815] border border-[#FFA4D2]/25 rounded-xl px-3 py-2 text-xs font-semibold text-[#FFFDE6] focus:outline-none focus:border-[#E31B73] focus:ring-1 focus:ring-[#E31B73] cursor-pointer"
              >
                <option value="all">All Cutoffs ({allCutoffs.length})</option>
                <optgroup label="Standard Ranges">
                  <option value="8-23">Range 8th – 23rd</option>
                  <option value="24-7">Range 24th – 7th</option>
                </optgroup>
                {allCutoffs.length > 0 && (
                  <optgroup label="Logged Cutoff Periods">
                    {allCutoffs.map((c) => (
                      <option key={c.id} value={c.id} className="bg-[#180a1c] text-[#FFFDE6]">
                        {c.label} ({c.count} {c.count === 1 ? "shift" : "shifts"})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {/* Model Filter Dropdown */}
            <div className="flex items-center gap-2 shrink-0">
              <label htmlFor="modelFilterSelect" className="text-xs font-bold text-[#FFA4D2]/80 flex items-center gap-1.5 shrink-0">
                <Layers size={13} className="text-[#FF77B9]" />
                <span>Model:</span>
              </label>
              <select
                id="modelFilterSelect"
                value={selectedModelFilter}
                onChange={(e) => setSelectedModelFilter(e.target.value)}
                className="bg-[#120815] border border-[#FFA4D2]/25 rounded-xl px-3 py-2 text-xs font-semibold text-[#FFFDE6] focus:outline-none focus:border-[#E31B73] focus:ring-1 focus:ring-[#E31B73] cursor-pointer"
              >
                <option value="all">All Models ({allModels.length})</option>
                {allModels.map((m) => (
                  <option key={m} value={m} className="bg-[#180a1c] text-[#FFFDE6]">
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* Create Cutoff Invoice Button */}
            <Link
              href={
                selectedCutoffFilter !== "all"
                  ? `/invoice?${selectedCutoffFilter.includes("_") ? `cutoffId=${selectedCutoffFilter}` : `cutoff=${selectedCutoffFilter}`}`
                  : "/invoice?cutoff=current"
              }
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#E31B73] to-[#FF77B9] text-[#FFFDE6] text-xs font-bold shadow-md shadow-[#E31B73]/25 hover:shadow-[#E31B73]/40 transition flex items-center gap-1.5 shrink-0"
              title="Generate Invoice with line items automatically grouped from this cutoff period"
            >
              <Receipt size={13} />
              <span>Create Cutoff Invoice</span>
            </Link>
          </div>

          {/* Snapshot List or Empty State */}
          {isLoading ? (
            <div className="py-24 flex flex-col items-center justify-center gap-3 text-[#d9a0c2]">
              <Loader2 size={32} className="animate-spin text-[#FF77B9]" />
              <span className="text-sm font-medium">Loading saved summaries...</span>
            </div>
          ) : filteredSummaries.length === 0 ? (
            <div className="py-16 px-4 rounded-2xl bg-[#1c0b20]/60 border border-[#FFA4D2]/20 flex flex-col items-center justify-center gap-4 text-center">
              <div className="p-4 rounded-2xl bg-[#280f30] border border-[#FFA4D2]/25 text-[#FFA4D2] shadow-inner">
                <FileSpreadsheet size={36} className="text-[#FF77B9]" />
              </div>
              <div className="flex flex-col gap-1.5 max-w-md">
                <h3 className="text-base font-bold text-[#FFFDE6]">
                  {searchQuery || selectedModelFilter !== "all"
                    ? "No Matching Summaries Found"
                    : "No Saved Summaries Yet"}
                </h3>
                <p className="text-xs text-[#d9a0c2] leading-relaxed">
                  {searchQuery || selectedModelFilter !== "all"
                    ? "Try adjusting your search keywords or filter options to see matching saved export snapshots."
                    : "Head to the Dashboard, enter your sales details, and click 'Save (.xlsx)' in the top bar to export an Excel file and save your first snapshot here."}
                </p>
              </div>
              <Link
                href="/"
                className="mt-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#E31B73] to-[#FF77B9] text-[#FFFDE6] text-xs font-bold shadow-lg shadow-[#E31B73]/25 hover:shadow-[#E31B73]/40 transition flex items-center gap-2"
              >
                <LayoutDashboard size={14} />
                <span>Go to Dashboard</span>
              </Link>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#FFA4D2]/20 bg-[#1c0b20]/90 backdrop-blur-xl shadow-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#FFA4D2]/20 bg-[#250e2c] text-[#FFA4D2]/80 text-[11px] font-extrabold uppercase tracking-wider">
                      <th className="py-3.5 px-4">Date &amp; Time</th>
                      <th className="py-3.5 px-4">Export Filename</th>
                      <th className="py-3.5 px-4 text-right">Total Revenue</th>
                      <th className="py-3.5 px-4 text-right">None Sales</th>
                      <th className="py-3.5 px-4 text-right">VIP Subtotal</th>
                      <th className="py-3.5 px-4 text-right">Free Subtotal</th>
                      <th className="py-3.5 px-4 text-center">Sales</th>
                      <th className="py-3.5 px-4">Models Breakdown</th>
                      <th className="py-3.5 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#FFA4D2]/10">
                    {filteredSummaries.map((summary) => (
                      <tr
                        key={summary.id}
                        className="hover:bg-[#281031]/50 transition duration-150 group"
                      >
                        {/* Date & Time */}
                        <td className="py-3 px-4 text-[#FFA4D2]/70 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 font-medium">
                            <Calendar size={12} className="text-[#FF77B9] shrink-0" />
                            <span>{new Date(summary.created_at).toLocaleDateString()}</span>
                            <span className="text-[10px] text-[#FFA4D2]/50">
                              {new Date(summary.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        </td>

                        {/* Export Filename */}
                        <td className="py-3 px-4 font-mono font-bold text-[#FFFDE6] whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <FileSpreadsheet size={15} className="text-[#FF77B9] shrink-0" />
                            <span className="truncate max-w-[200px]" title={summary.export_filename}>
                              {summary.export_filename}
                            </span>
                          </div>
                        </td>

                        {/* Total Revenue */}
                        <td className="py-3 px-4 text-right font-mono font-bold text-[#FFFDE6] whitespace-nowrap">
                          {formatCurrency(summary.total_revenue)}
                        </td>

                        {/* None Sales */}
                        <td className="py-3 px-4 text-right font-mono font-semibold text-[#FFFDE6]/90 whitespace-nowrap">
                          {formatCurrency(summary.none_subtotal)}
                        </td>

                        {/* VIP Subtotal */}
                        <td className="py-3 px-4 text-right font-mono font-semibold text-[#FF77B9] whitespace-nowrap">
                          {formatCurrency(summary.vip_subtotal)}
                        </td>

                        {/* Free Subtotal */}
                        <td className="py-3 px-4 text-right font-mono font-semibold text-[#FFA4D2] whitespace-nowrap">
                          {formatCurrency(summary.free_subtotal)}
                        </td>

                        {/* Sales Count */}
                        <td className="py-3 px-4 text-center font-mono whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-full bg-[#E31B73]/20 text-[#FF77B9] text-[11px] font-bold">
                            {summary.sales_count}
                          </span>
                        </td>

                        {/* Models Breakdown */}
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap items-center gap-1 max-w-[280px]">
                            {summary.by_model && summary.by_model.length > 0 ? (
                              summary.by_model.map((m) => (
                                <span
                                  key={m.model}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#2d1035] border border-[#FFA4D2]/20 text-[11px] whitespace-nowrap"
                                  title={`${m.model}: ${m.count} sales (${formatCurrency(m.revenue)})`}
                                >
                                  <span className="font-bold text-[#FF77B9]">{m.model}</span>
                                  <span className="text-[#FFA4D2]/70">({m.count})</span>
                                </span>
                              ))
                            ) : (
                              <span className="text-[#FFA4D2]/40 text-[11px]">—</span>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(summary)}
                              title="Edit this summary data"
                              className="p-1.5 rounded-lg text-[#FFA4D2]/80 hover:text-[#FFFDE6] hover:bg-[#E31B73]/30 transition inline-flex items-center"
                            >
                              <Pencil size={14} />
                            </button>
                            <Link
                              href={`/invoice?summaryId=${summary.id}`}
                              title="Create Invoice from this summary"
                              className="p-1.5 rounded-lg text-[#FFA4D2]/80 hover:text-[#FFFDE6] hover:bg-[#E31B73]/30 transition inline-flex items-center"
                            >
                              <Receipt size={14} />
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleDelete(summary.id, summary.export_filename)}
                              title="Delete this snapshot"
                              className="p-1.5 rounded-lg text-[#FFA4D2]/50 hover:text-red-300 hover:bg-red-500/20 transition"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Table Footer Summary */}
              <div className="p-3 border-t border-[#FFA4D2]/15 bg-[#18081c] flex items-center justify-between text-[11px] text-[#FFA4D2]/70">
                <span>
                  Showing <strong className="text-[#FFFDE6]">{filteredSummaries.length}</strong> of{" "}
                  <strong className="text-[#FFFDE6]">{savedSummaries.length}</strong> saved export summaries
                </span>
                {filteredSummaries.length > 0 && (
                  <span className="font-mono">
                    Filtered Revenue:{" "}
                    <strong className="text-[#FFFDE6]">
                      {formatCurrency(filteredSummaries.reduce((sum, s) => sum + s.total_revenue, 0))}
                    </strong>
                  </span>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ── EDIT SAVED SUMMARY MODAL ───────────────────────── */}
      {editingSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#180a1c] border border-[#FFA4D2]/30 rounded-2xl w-full max-w-2xl shadow-2xl shadow-[#E31B73]/20 flex flex-col max-h-[90vh] overflow-hidden text-xs">
            {/* Modal Header */}
            <div className="p-4 border-b border-[#FFA4D2]/20 bg-[#220c29] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-gradient-to-tr from-[#E31B73] to-[#FF77B9] text-[#FFFDE6] shadow-md shadow-[#E31B73]/30">
                  <Pencil size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#FFFDE6] flex items-center gap-2">
                    Edit Saved Summary
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-[#E31B73]/25 text-[#FF77B9] border border-[#E31B73]/40">
                      ID #{editingSummary.id}
                    </span>
                  </h3>
                  <p className="text-[11px] text-[#FFA4D2]/70 truncate max-w-sm">
                    {editingSummary.export_filename}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseEditModal}
                disabled={isSavingEdit}
                className="p-1.5 rounded-lg text-[#FFA4D2]/70 hover:text-[#FFFDE6] hover:bg-[#2e1038] transition"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-5 overflow-y-auto flex flex-col gap-5 flex-1">
              {editError && (
                <div className="p-3 rounded-xl bg-red-950/80 border border-red-500/50 text-red-200 text-xs flex items-center gap-2">
                  <AlertCircle size={15} className="text-red-400 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              {/* Basic Details: Filename & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-[#FFA4D2]/80 uppercase tracking-wider">
                    Export Filename
                  </label>
                  <input
                    type="text"
                    value={editFilename}
                    onChange={(e) => setEditFilename(e.target.value)}
                    placeholder="e.g. sales-export-2026-08-30.xlsx"
                    className="w-full bg-[#120815] border border-[#FFA4D2]/25 rounded-xl px-3 py-2 text-xs font-mono text-[#FFFDE6] focus:outline-none focus:border-[#E31B73] focus:ring-1 focus:ring-[#E31B73]"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-[#FFA4D2]/80 uppercase tracking-wider">
                    Snapshot Timestamp / Date
                  </label>
                  <input
                    type="datetime-local"
                    value={editDate}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditDate(val);
                      if (val && editFilename.startsWith("sales-export-")) {
                        const datePart = val.slice(0, 10);
                        setEditFilename(`sales-export-${datePart}.xlsx`);
                      }
                    }}
                    className="w-full bg-[#120815] border border-[#FFA4D2]/25 rounded-xl px-3 py-2 text-xs font-mono text-[#FFFDE6] focus:outline-none focus:border-[#E31B73] focus:ring-1 focus:ring-[#E31B73]"
                  />

                </div>
              </div>

              {/* Financial Metrics */}
              <div className="flex flex-col gap-2.5 p-3.5 rounded-xl bg-[#200e26]/70 border border-[#FFA4D2]/15">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#FFA4D2]/90 flex items-center gap-1.5">
                    <DollarSign size={13} className="text-[#FF77B9]" />
                    Financial Subtotals &amp; Revenue
                  </span>
                  <button
                    type="button"
                    onClick={handleAutoSumSubtotals}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#2e1237] hover:bg-[#3d1748] border border-[#FFA4D2]/20 text-[10px] font-bold text-[#FF77B9] hover:text-[#FFFDE6] transition"
                    title="Calculate Total Revenue by summing None + VIP + Free"
                  >
                    <Calculator size={11} />
                    <span>Auto-Sum Subtotals</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-[#FFA4D2]/70 font-semibold">
                      Total Revenue ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={editTotalRevenue}
                      onChange={(e) => setEditTotalRevenue(e.target.value)}
                      className="bg-[#120815] border border-[#FFA4D2]/25 rounded-lg px-2.5 py-1.5 font-mono text-xs text-[#FFFDE6] font-bold focus:outline-none focus:border-[#E31B73]"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-[#FFA4D2]/70 font-semibold">
                      None Sales ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={editNoneSubtotal}
                      onChange={(e) => setEditNoneSubtotal(e.target.value)}
                      className="bg-[#120815] border border-[#FFA4D2]/25 rounded-lg px-2.5 py-1.5 font-mono text-xs text-[#FFFDE6] focus:outline-none focus:border-[#E31B73]"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-[#FFA4D2]/70 font-semibold">
                      VIP Subtotal ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={editVipSubtotal}
                      onChange={(e) => setEditVipSubtotal(e.target.value)}
                      className="bg-[#120815] border border-[#FFA4D2]/25 rounded-lg px-2.5 py-1.5 font-mono text-xs text-[#FF77B9] font-semibold focus:outline-none focus:border-[#E31B73]"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-[#FFA4D2]/70 font-semibold">
                      Free Subtotal ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={editFreeSubtotal}
                      onChange={(e) => setEditFreeSubtotal(e.target.value)}
                      className="bg-[#120815] border border-[#FFA4D2]/25 rounded-lg px-2.5 py-1.5 font-mono text-xs text-[#FFA4D2] font-semibold focus:outline-none focus:border-[#E31B73]"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-[#FFA4D2]/10 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[#FFA4D2]/80 font-semibold">
                      Sales Count:
                    </span>
                    <input
                      type="number"
                      value={editSalesCount}
                      onChange={(e) => setEditSalesCount(e.target.value)}
                      className="w-20 bg-[#120815] border border-[#FFA4D2]/25 rounded-lg px-2 py-1 font-mono text-xs text-center text-[#FFFDE6] font-bold focus:outline-none focus:border-[#E31B73]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleRecalcFromModels}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#2e1237] hover:bg-[#3d1748] border border-[#FFA4D2]/20 text-[10px] font-bold text-[#FFA4D2] hover:text-[#FFFDE6] transition"
                    title="Calculate revenue and count directly from the model entries below"
                  >
                    <RefreshCw size={11} />
                    <span>Recalc from Models</span>
                  </button>
                </div>
              </div>

              {/* Models Breakdown Section */}
              <div className="flex flex-col gap-2.5 p-3.5 rounded-xl bg-[#200e26]/70 border border-[#FFA4D2]/15">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#FFA4D2]/90 flex items-center gap-1.5">
                    <Layers size={13} className="text-[#FF77B9]" />
                    Model Breakdown
                  </span>
                  <button
                    type="button"
                    onClick={handleAddModelRow}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gradient-to-r from-[#E31B73] to-[#FF77B9] text-[#FFFDE6] text-[10px] font-bold shadow-sm hover:opacity-90 transition"
                  >
                    <Plus size={12} />
                    <span>Add Model</span>
                  </button>
                </div>

                {editByModel.length === 0 ? (
                  <div className="py-4 text-center text-[#FFA4D2]/50 italic text-[11px]">
                    No models registered in this snapshot. Click &ldquo;Add Model&rdquo; to add one.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-12 gap-2 text-[10px] font-bold uppercase text-[#FFA4D2]/60 px-1">
                      <div className="col-span-5">Model Name</div>
                      <div className="col-span-4 text-right">Revenue ($)</div>
                      <div className="col-span-2 text-center">Sales</div>
                      <div className="col-span-1"></div>
                    </div>
                    {editByModel.map((m, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-12 gap-2 items-center bg-[#150718] p-2 rounded-lg border border-[#FFA4D2]/10"
                      >
                        <div className="col-span-5">
                          <input
                            type="text"
                            placeholder="e.g. Nadya"
                            value={m.model}
                            onChange={(e) => handleUpdateModelRow(idx, "model", e.target.value)}
                            className="w-full bg-[#1e0a24] border border-[#FFA4D2]/20 rounded-md px-2 py-1 text-xs text-[#FFFDE6] focus:outline-none focus:border-[#E31B73]"
                          />
                        </div>
                        <div className="col-span-4">
                          <input
                            type="number"
                            step="0.01"
                            value={m.revenue}
                            onChange={(e) => handleUpdateModelRow(idx, "revenue", e.target.value)}
                            className="w-full bg-[#1e0a24] border border-[#FFA4D2]/20 rounded-md px-2 py-1 text-xs font-mono text-right text-[#FFFDE6] focus:outline-none focus:border-[#E31B73]"
                          />
                        </div>
                        <div className="col-span-2">
                          <input
                            type="number"
                            value={m.count}
                            onChange={(e) => handleUpdateModelRow(idx, "count", e.target.value)}
                            className="w-full bg-[#1e0a24] border border-[#FFA4D2]/20 rounded-md px-2 py-1 text-xs font-mono text-center text-[#FFFDE6] focus:outline-none focus:border-[#E31B73]"
                          />
                        </div>
                        <div className="col-span-1 flex justify-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveModelRow(idx)}
                            className="p-1 rounded-md text-[#FFA4D2]/50 hover:text-red-400 hover:bg-red-500/10 transition"
                            title="Remove model row"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sale Type Breakdown Section */}
              <div className="flex flex-col gap-2.5 p-3.5 rounded-xl bg-[#200e26]/70 border border-[#FFA4D2]/15">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#FFA4D2]/90 flex items-center gap-1.5">
                    <ShoppingBag size={13} className="text-[#FF77B9]" />
                    Sale Types Breakdown
                  </span>
                  <button
                    type="button"
                    onClick={handleAddSaleTypeRow}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#2e1237] hover:bg-[#3d1748] border border-[#FFA4D2]/20 text-[10px] font-bold text-[#FFA4D2] hover:text-[#FFFDE6] transition"
                  >
                    <Plus size={12} />
                    <span>Add Type</span>
                  </button>
                </div>

                {editBySaleType.length === 0 ? (
                  <div className="py-2 text-center text-[#FFA4D2]/50 italic text-[11px]">
                    No sale type entries logged.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-12 gap-2 text-[10px] font-bold uppercase text-[#FFA4D2]/60 px-1">
                      <div className="col-span-5">Sale Type</div>
                      <div className="col-span-4 text-right">Revenue ($)</div>
                      <div className="col-span-2 text-center">Count</div>
                      <div className="col-span-1"></div>
                    </div>
                    {editBySaleType.map((st, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-12 gap-2 items-center bg-[#150718] p-2 rounded-lg border border-[#FFA4D2]/10"
                      >
                        <div className="col-span-5">
                          <input
                            type="text"
                            placeholder="e.g. tip, subscription"
                            value={st.sale_type}
                            onChange={(e) => handleUpdateSaleTypeRow(idx, "sale_type", e.target.value)}
                            className="w-full bg-[#1e0a24] border border-[#FFA4D2]/20 rounded-md px-2 py-1 text-xs text-[#FFFDE6] focus:outline-none focus:border-[#E31B73]"
                          />
                        </div>
                        <div className="col-span-4">
                          <input
                            type="number"
                            step="0.01"
                            value={st.revenue}
                            onChange={(e) => handleUpdateSaleTypeRow(idx, "revenue", e.target.value)}
                            className="w-full bg-[#1e0a24] border border-[#FFA4D2]/20 rounded-md px-2 py-1 text-xs font-mono text-right text-[#FFFDE6] focus:outline-none focus:border-[#E31B73]"
                          />
                        </div>
                        <div className="col-span-2">
                          <input
                            type="number"
                            value={st.count}
                            onChange={(e) => handleUpdateSaleTypeRow(idx, "count", e.target.value)}
                            className="w-full bg-[#1e0a24] border border-[#FFA4D2]/20 rounded-md px-2 py-1 text-xs font-mono text-center text-[#FFFDE6] focus:outline-none focus:border-[#E31B73]"
                          />
                        </div>
                        <div className="col-span-1 flex justify-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveSaleTypeRow(idx)}
                            className="p-1 rounded-md text-[#FFA4D2]/50 hover:text-red-400 hover:bg-red-500/10 transition"
                            title="Remove sale type row"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Late Sale Input Section ─────────────────────────────────── */}
            <div className="flex flex-col gap-2.5 p-3.5 rounded-xl bg-[#1a0920]/80 border border-[#FF77B9]/20 mx-5 mb-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#FF77B9]/90 flex items-center gap-1.5">
                  <ClipboardPaste size={13} className="text-[#FF77B9]" />
                  Add Late Sale to This Snapshot
                </span>
                <button
                  type="button"
                  onClick={() => setShowLateSalesBox((v) => !v)}
                  className="text-[10px] text-[#FFA4D2]/60 hover:text-[#FFFDE6] transition"
                >
                  {showLateSalesBox ? "Hide" : "Show"}
                </button>
              </div>

              {showLateSalesBox && (
                <div className="flex flex-col gap-2.5">
                  {/* Model + Tier row */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-[#FFA4D2]/70 uppercase">Model</label>
                      <select
                        value={lateSelectedModel}
                        onChange={(e) => setLateSelectedModel(e.target.value)}
                        className="bg-[#120815] border border-[#FFA4D2]/25 rounded-lg px-2.5 py-1.5 text-xs text-[#FFFDE6] focus:outline-none focus:border-[#E31B73]"
                      >
                        {editByModel.length > 0
                          ? editByModel.map((m) => (
                              <option key={m.model} value={m.model}>
                                {m.model}
                              </option>
                            ))
                          : ["Nadya", "Ana", "Sofia"].map((n) => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-[#FFA4D2]/70 uppercase">Tier</label>
                      <select
                        value={lateTier}
                        onChange={(e) => setLateTier(e.target.value as "none" | "vip" | "free")}
                        className="bg-[#120815] border border-[#FFA4D2]/25 rounded-lg px-2.5 py-1.5 text-xs text-[#FFFDE6] focus:outline-none focus:border-[#E31B73]"
                      >
                        <option value="none">None (Regular)</option>
                        <option value="vip">VIP</option>
                        <option value="free">Free Trial</option>
                      </select>
                    </div>
                  </div>

                  {/* Purchase text paste area */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-[#FFA4D2]/70 uppercase">Paste Purchase Notification</label>
                    <textarea
                      rows={3}
                      value={lateSaleText}
                      onChange={(e) => setLateSaleText(e.target.value)}
                      placeholder={`Paste the purchase notification here...\ne.g. 🐳(Kody)\n@u80636081\nhas purchased your message for $30.99!`}
                      className="w-full bg-[#120815] border border-[#FFA4D2]/25 rounded-lg px-3 py-2 text-xs text-[#FFFDE6] font-mono placeholder-[#FFA4D2]/30 focus:outline-none focus:border-[#E31B73] focus:ring-1 focus:ring-[#E31B73] resize-none"
                    />
                  </div>

                  {/* Error / Success banners */}
                  {inlineLateParseError && (
                    <div className="flex items-center gap-1.5 text-red-300 text-[11px] font-medium">
                      <AlertCircle size={13} className="text-red-400 shrink-0" />
                      <span>{inlineLateParseError}</span>
                    </div>
                  )}
                  {lateSaleSuccessMsg && (
                    <div className="flex items-center gap-1.5 text-emerald-300 text-[11px] font-medium">
                      <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                      <span>{lateSaleSuccessMsg}</span>
                    </div>
                  )}

                  {/* Process Button */}
                  <button
                    type="button"
                    onClick={handleProcessAndAddLateSale}
                    className="self-end inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#E31B73] to-[#FF77B9] text-[#FFFDE6] text-[11px] font-bold shadow-md hover:opacity-90 transition"
                  >
                    <Plus size={13} />
                    <span>Process &amp; Add Late Sale</span>
                  </button>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-[#FFA4D2]/20 bg-[#220c29] flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={handleCloseEditModal}
                disabled={isSavingEdit}
                className="px-4 py-2 rounded-xl bg-[#2b1033] hover:bg-[#391544] text-[#FFA4D2] hover:text-[#FFFDE6] text-xs font-semibold transition border border-[#FFA4D2]/20"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isSavingEdit}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#E31B73] to-[#FF77B9] hover:from-[#c91564] hover:to-[#ff5ea9] text-[#FFFDE6] text-xs font-bold shadow-lg shadow-[#E31B73]/25 hover:shadow-[#E31B73]/40 transition flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSavingEdit ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save size={14} />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

