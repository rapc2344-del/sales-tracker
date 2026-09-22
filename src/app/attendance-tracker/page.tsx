"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  FolderClock,
  Receipt,
  FileSpreadsheet,
  UploadCloud,
  Calendar,
  Clock,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Menu,
  X,
  ExternalLink,
  Settings2,
  Copy,
  Check,
  Zap,
  RefreshCw,
} from "lucide-react";

import type { SavedSummary } from "@/lib/types";
import {
  getCutoffForDate,
  groupSummariesByCutoff,
  calculateShiftBonusAndRate,
  parseSummaryDate,
  type GroupedCutoff,
} from "@/app/invoice/page";

function formatCurrency(val: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
}

function formatDateMDY(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

/**
 * Calculates the number of hours worked between a Time In and Time Out string.
 * Supports:
 * - "0:00 AM CET", "8:00 AM CET" -> 8
 * - "0:30 AM CET", "8:00 AM CET" (late) -> 7.5
 * - "0:00 AM CET", "7:15 AM CET" (undertime) -> 7.25
 * - "9:00 PM", "5:00 AM" (overnight) -> 8
 * - "9:45 PM", "5:00 AM" (overnight, late) -> 7.25
 * - "09:00", "17:30" (24h) -> 8.5
 */
export function calculateHoursFromTimeRange(
  timeInStr: string,
  timeOutStr: string,
  fallbackHours = 8
): number {
  if (!timeInStr || !timeOutStr) return fallbackHours;

  const parseTimeToMinutes = (str: string): number | null => {
    const clean = str.trim();
    const match = clean.match(/(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i);
    if (!match) return null;

    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const meridiem = match[3]?.toUpperCase();

    if (meridiem === "PM") {
      if (hours < 12) hours += 12;
    } else if (meridiem === "AM") {
      if (hours === 12) hours = 0;
    }

    return hours * 60 + minutes;
  };

  const inMins = parseTimeToMinutes(timeInStr);
  const outMins = parseTimeToMinutes(timeOutStr);

  if (inMins === null || outMins === null) return fallbackHours;

  let diffMins = outMins - inMins;
  if (diffMins <= 0) {
    // Crosses midnight (e.g. 21:00 to 05:00)
    diffMins += 24 * 60;
  }

  // Round to 2 decimal places (e.g. 7.5, 7.75, 8)
  const hrs = Math.round((diffMins / 60) * 100) / 100;
  return hrs;
}

export interface RowOverride {
  date?: string;
  client?: string;
  clockIn?: string;
  clockOut?: string;
  hours?: number;
  sales?: string;
}

export default function AttendanceTrackerPage() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [savedSummaries, setSavedSummaries] = useState<SavedSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filter mode: "cutoff" or "custom"
  const [filterMode, setFilterMode] = useState<"cutoff" | "custom">("cutoff");
  const [selectedCutoffId, setSelectedCutoffId] = useState<string>("");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");

  // Shift settings for the sheet header
  const [chatterName, setChatterName] = useState<string>("Raphael");
  const [clientName, setClientName] = useState<string>("Nadya");
  const [shiftSchedule, setShiftSchedule] = useState<string>("0:00 AM CET - 8:00 AM CET");
  const [clockIn, setClockIn] = useState<string>("0:00 AM CET");
  const [clockOut, setClockOut] = useState<string>("8:00 AM CET");
  const [shiftHours, setShiftHours] = useState<number>(8);
  const [paymentMethod, setPaymentMethod] = useState<string>("union bank");

  // Sync Modal State
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{
    type: "idle" | "success" | "error";
    message: string;
    details?: {
      added?: number;
      skipped?: number;
      tabName?: string;
      createdNewTab?: boolean;
    };
  }>({ type: "idle", message: "" });

  // Sync Options in modal
  const [targetTabName, setTargetTabName] = useState<string>("");
  const [createTabOnDuplicate, setCreateTabOnDuplicate] = useState<boolean>(true);
  const [resetTargetTab, setResetTargetTab] = useState<boolean>(false);
  const [updateHeaderOnSync, setUpdateHeaderOnSync] = useState<boolean>(true);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Per-row inline overrides for editable cells in the GSheet preview
  const [rowOverrides, setRowOverrides] = useState<Record<number, RowOverride>>({});

  const updateRowOverride = (
    id: number,
    field: "date" | "client" | "clockIn" | "clockOut" | "hours" | "sales",
    value: string | number
  ) => {
    setRowOverrides((prev) => {
      const current = prev[id] || {};
      const updated: RowOverride = { ...current, [field]: value };

      // If clockIn or clockOut is edited, automatically calculate hours worked!
      if (field === "clockIn" || field === "clockOut") {
        const targetRow = tableRows.find((r) => r.id === id);
        const currentIn =
          field === "clockIn"
            ? String(value)
            : updated.clockIn !== undefined
            ? updated.clockIn
            : targetRow?.clockIn || clockIn;
        const currentOut =
          field === "clockOut"
            ? String(value)
            : updated.clockOut !== undefined
            ? updated.clockOut
            : targetRow?.clockOut || clockOut;
        const autoHours = calculateHoursFromTimeRange(
          currentIn,
          currentOut,
          targetRow?.hours ?? shiftHours
        );
        updated.hours = autoHours;
      }

      return {
        ...prev,
        [id]: updated,
      };
    });
  };

  // Fetch saved summaries and env defaults
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [sumRes, configRes] = await Promise.all([
        fetch("/api/saved-summaries", { cache: "no-store" }),
        fetch("/api/sync-sheet", { cache: "no-store" }),
      ]);

      if (sumRes.ok) {
        const summaries = (await sumRes.json()) as SavedSummary[];
        setSavedSummaries(summaries);
      }

      if (configRes.ok) {
        const cfg = await configRes.json();
        if (cfg.config) {
          if (cfg.config.chatter) setChatterName(cfg.config.chatter.replace(" (default)", ""));
          if (cfg.config.client) setClientName(cfg.config.client.replace(" (default)", ""));
          if (cfg.config.schedule) setShiftSchedule(cfg.config.schedule.replace(" (default)", ""));
          if (cfg.config.hours) setShiftHours(cfg.config.hours);
          if (cfg.config.payment) setPaymentMethod(cfg.config.payment.replace(" (default)", ""));
        }
      }
    } catch (err) {
      console.error("Failed to load initial data:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);


  // Group summaries by cutoff
  const groupedCutoffs: GroupedCutoff[] = useMemo(() => {
    return groupSummariesByCutoff(savedSummaries, shiftHours);
  }, [savedSummaries, shiftHours]);

  // Set default selected cutoff on load
  useEffect(() => {
    if (!selectedCutoffId && groupedCutoffs.length > 0) {
      const current = groupedCutoffs.find((g) => g.info.isCurrent) || groupedCutoffs[0];
      setSelectedCutoffId(current.info.id);
    }
  }, [groupedCutoffs, selectedCutoffId]);

  // Active Cutoff Info
  const activeCutoff = useMemo(() => {
    return groupedCutoffs.find((g) => g.info.id === selectedCutoffId) || groupedCutoffs[0];
  }, [groupedCutoffs, selectedCutoffId]);

  // Determine which summaries are in the preview based on filterMode
  const previewSummaries = useMemo(() => {
    if (filterMode === "cutoff") {
      return activeCutoff ? activeCutoff.summaries : [];
    }

    if (!customStartDate && !customEndDate) {
      return savedSummaries;
    }

    const start = customStartDate ? new Date(`${customStartDate}T00:00:00`).getTime() : 0;
    const end = customEndDate ? new Date(`${customEndDate}T23:59:59.999`).getTime() : Infinity;

    return savedSummaries.filter((s) => {
      const date = parseSummaryDate(s).getTime();
      return date >= start && date <= end;
    }).sort((a, b) => parseSummaryDate(a).getTime() - parseSummaryDate(b).getTime());
  }, [filterMode, activeCutoff, savedSummaries, customStartDate, customEndDate]);

  // Calculate cutoff start and end dates for display
  const displayDates = useMemo(() => {
    if (filterMode === "cutoff" && activeCutoff) {
      return {
        start: activeCutoff.info.displayStartDate,
        end: activeCutoff.info.displayEndDate,
      };
    }
    if (previewSummaries.length > 0) {
      const first = parseSummaryDate(previewSummaries[0]);
      const last = parseSummaryDate(previewSummaries[previewSummaries.length - 1]);
      return {
        start: first.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
        end: last.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
      };
    }
    const current = getCutoffForDate(new Date());
    return {
      start: current.displayStartDate,
      end: current.displayEndDate,
    };
  }, [filterMode, activeCutoff, previewSummaries]);

  // Base raw rows for the spreadsheet
  const tableRows = useMemo(() => {
    return previewSummaries.map((summary) => {
      const dateObj = parseSummaryDate(summary);
      const dateStr = formatDateMDY(dateObj);
      const sales = Number(summary.total_revenue) || 0;

      // Build model string: join all model names with | separator
      const modelStr =
        summary.by_model && summary.by_model.length > 0
          ? summary.by_model.map((m) => m.model).join(" | ")
          : clientName;

      return {
        id: summary.id,
        date: dateStr,
        client: modelStr,
        clockIn,
        clockOut,
        hours: shiftHours,
        sales,
      };
    });
  }, [previewSummaries, clientName, clockIn, clockOut, shiftHours]);

  // Calculated Rows with live inline cell overrides, hours calculation, and daily salary formula
  const calculatedRows = useMemo(() => {
    let cumulativeSalary = 0;

    return tableRows.map((row) => {
      const override = rowOverrides[row.id] || {};
      const displayDate = override.date !== undefined ? override.date : row.date;
      const displayClient = override.client !== undefined ? override.client : row.client;
      const displayClockIn = override.clockIn !== undefined ? override.clockIn : row.clockIn;
      const displayClockOut = override.clockOut !== undefined ? override.clockOut : row.clockOut;

      // Auto-compute hours if clockIn/clockOut changed or if hours is explicitly overridden
      const displayHours =
        override.hours !== undefined
          ? override.hours
          : calculateHoursFromTimeRange(displayClockIn, displayClockOut, row.hours);

      const displaySales = override.sales !== undefined ? override.sales : String(row.sales);
      const salesNum = parseFloat(displaySales) || 0;
      const { rate } = calculateShiftBonusAndRate(salesNum);
      const dailySalary = displayHours * rate;
      cumulativeSalary += dailySalary;

      return {
        ...row,
        displayDate,
        displayClient,
        displayClockIn,
        displayClockOut,
        displayHours,
        displaySales,
        salesNum,
        rate,
        dailySalary,
        expectedSalary: cumulativeSalary,
      };
    });
  }, [tableRows, rowOverrides, clockIn, clockOut, shiftHours]);

  // Total summary calculations reflecting live cell edits & hours
  const totalSales = useMemo(() => {
    return calculatedRows.reduce((acc, row) => acc + row.salesNum, 0);
  }, [calculatedRows]);

  const totalExpectedSalary = useMemo(() => {
    return calculatedRows.reduce((acc, row) => acc + row.dailySalary, 0);
  }, [calculatedRows]);

  // Update default target tab name whenever cutoff changes
  useEffect(() => {
    if (displayDates.end) {
      const d = new Date(displayDates.end);
      if (!isNaN(d.getTime())) {
        setTargetTabName(formatDateMDY(d));
      } else {
        setTargetTabName(formatDateMDY(new Date()));
      }
    }
  }, [displayDates]);

  // Handler to open Sync Modal
  const handleOpenSyncModal = () => {
    setSyncStatus({ type: "idle", message: "" });
    setIsSyncModalOpen(true);
  };

  // Handler to execute Google Sheet Sync
  const handleExecuteSync = async () => {
    if (calculatedRows.length === 0) {
      setSyncStatus({
        type: "error",
        message: "No shift rows selected to sync. Check your date range filter.",
      });
      return;
    }

    setIsSyncing(true);
    setSyncStatus({ type: "idle", message: "Sending data to Google Sheet..." });

    try {
      const payloadRows = calculatedRows.map((r) => ({
        date: r.displayDate,
        client: r.displayClient,
        clockIn: r.displayClockIn,
        clockOut: r.displayClockOut,
        hours: r.displayHours,
        sales: r.salesNum,
      }));

      const headerPayload = updateHeaderOnSync
        ? {
            chatter: chatterName,
            client: clientName,
            schedule: shiftSchedule,
            startDate: displayDates.start,
            endDate: displayDates.end,
            payment: paymentMethod,
          }
        : undefined;

      const res = await fetch("/api/sync-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetTab: targetTabName.trim() || undefined,
          createTabIfDuplicate: createTabOnDuplicate,
          newTabName: targetTabName.trim() || undefined,
          reset: resetTargetTab,
          header: headerPayload,
          rows: payloadRows,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || data.message || "Failed to sync to Google Sheet");
      }

      setSyncStatus({
        type: "success",
        message: data.message || "Successfully pushed to Google Sheet!",
        details: {
          added: data.added,
          skipped: data.skipped,
          tabName: data.tabName,
          createdNewTab: data.createdNewTab,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error syncing to Google Sheet";
      setSyncStatus({
        type: "error",
        message: msg,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#120716] text-[#FFA4D2] flex flex-col antialiased selection:bg-[#E31B73] selection:text-[#FFFDE6]">
      {/* â”€â”€ TOP HEADER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <header className="sticky top-0 z-40 bg-[#1c0b20]/90 backdrop-blur-md border-b border-[#FFA4D2]/20 px-4 py-3 flex items-center justify-between shadow-xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsSidebarOpen((prev) => !prev)}
            className="p-1.5 rounded-lg bg-[#250f2c] border border-[#FFA4D2]/30 text-[#FFFDE6] hover:text-[#FF77B9] hover:border-[#FF77B9] transition cursor-pointer"
            title={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            <Menu size={18} />
          </button>

          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#E31B73] to-[#FF77B9] flex items-center justify-center shadow-md shadow-[#E31B73]/30">
              <FileSpreadsheet size={18} className="text-[#FFFDE6]" />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-[#FFFDE6] tracking-tight flex items-center gap-2">
                <span>Attendance &amp; Salary Tracker</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold uppercase tracking-wider">
                  GSheet Mirror
                </span>
              </h1>
              <p className="text-[11px] text-[#FFA4D2]/70">
                Visual spreadsheet replica with live formula calculation &amp; date-range sync
              </p>
            </div>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={loadData}
            className="px-3 py-1.5 rounded-lg bg-[#250f2c] border border-[#FFA4D2]/30 text-[#FFFDE6] hover:border-[#FF77B9] text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            title="Refresh saved summaries and spreadsheet preview"
          >
            <RefreshCw size={14} className={`text-[#FF77B9] ${isLoading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => setShowSettingsDrawer((prev) => !prev)}
            className="px-3 py-1.5 rounded-lg bg-[#250f2c] border border-[#FFA4D2]/30 text-[#FFFDE6] hover:border-[#FF77B9] text-xs font-bold flex items-center gap-1.5 transition"
          >
            <Settings2 size={14} className="text-[#FF77B9]" />
            <span className="hidden sm:inline">Sheet Settings</span>
          </button>

          <button
            type="button"
            onClick={handleOpenSyncModal}
            className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/30 transition active:scale-95 cursor-pointer"
          >
            <UploadCloud size={15} />
            <span>Deploy to GSheet</span>
          </button>
        </div>
      </header>


      {/* â”€â”€ WORKSPACE BODY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex-1 flex overflow-hidden">
        {/* â”€â”€ SIDEBAR NAVIGATION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <aside
          className={`${
            isSidebarOpen ? "w-64" : "w-16"
          } transition-all duration-300 ease-in-out bg-[#18091d] border-r border-[#FFA4D2]/15 flex flex-col justify-between shrink-0 p-3`}
        >
          <div className="flex flex-col gap-1.5">
            {isSidebarOpen && (
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#FFA4D2]/50 px-3 py-1">
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

            {/* Saved Summaries Link */}
            <Link
              href="/saved-summaries"
              title="Saved Summaries"
              className={`w-full flex items-center ${
                isSidebarOpen ? "justify-between px-3.5" : "justify-center px-2"
              } py-2.5 rounded-xl font-bold text-xs text-[#d9a0c2] hover:bg-[#250f2c] hover:text-[#FFFDE6] border border-transparent hover:border-[#FFA4D2]/20 transition group`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <FolderClock
                  size={18}
                  className="text-[#FFA4D2]/80 group-hover:text-[#FF77B9] group-hover:scale-110 transition-transform shrink-0"
                />
                {isSidebarOpen && <span className="truncate">Saved Summaries</span>}
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
                {isSidebarOpen && <span className="truncate">Invoice Generator</span>}
              </div>
            </Link>

            {/* Attendance & Sheet Tracker Link (Active on this page) */}
            <Link
              href="/attendance-tracker"
              title="Attendance Tracker"
              className={`w-full flex items-center ${
                isSidebarOpen ? "justify-between px-3.5" : "justify-center px-2"
              } py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-[#E31B73]/30 via-[#FF77B9]/20 to-[#E31B73]/20 text-[#FFFDE6] border border-[#E31B73]/50 shadow-md shadow-[#E31B73]/15 transition group`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <FileSpreadsheet
                  size={18}
                  className="text-[#FF77B9] group-hover:scale-110 transition-transform shrink-0"
                />
                {isSidebarOpen && <span className="truncate">Attendance Tracker</span>}
              </div>
              {isSidebarOpen && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
              )}
            </Link>
          </div>

          {/* Sidebar Footer Info */}
          {isSidebarOpen && (
            <div className="p-3 rounded-xl bg-[#140818] border border-[#FFA4D2]/15 flex flex-col gap-2 text-[11px]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#FFA4D2]/60">
                Sheet Link
              </span>
              <a
                href="https://docs.google.com/spreadsheets/d/1FQnA6brDPOCVCcPKFjXb38dgvLBDgdfivV5qZKVSXAA/edit?usp=sharing"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between text-xs text-[#FFFDE6] hover:text-[#FF77B9] font-semibold truncate transition"
              >
                <span className="truncate">Open in Google Sheets</span>
                <ExternalLink size={12} className="shrink-0" />
              </a>
            </div>
          )}
        </aside>

        {/* â”€â”€ MAIN CONTENT AREA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-5">
          {/* â”€â”€ CONTROL BAR: FILTER & DATE RANGE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <div className="p-4 rounded-2xl bg-[#200e26]/90 border border-[#FFA4D2]/20 backdrop-blur-md shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Filter Mode Toggle */}
              <div className="flex items-center bg-[#140818] p-1 rounded-xl border border-[#FFA4D2]/25">
                <button
                  type="button"
                  onClick={() => setFilterMode("cutoff")}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    filterMode === "cutoff"
                      ? "bg-[#E31B73] text-[#FFFDE6] shadow"
                      : "text-[#FFA4D2]/60 hover:text-[#FFA4D2]"
                  }`}
                >
                  By Cutoff Period
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode("custom")}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    filterMode === "custom"
                      ? "bg-[#E31B73] text-[#FFFDE6] shadow"
                      : "text-[#FFA4D2]/60 hover:text-[#FFA4D2]"
                  }`}
                >
                  Custom Range
                </button>
              </div>

              {/* Cutoff Dropdown */}
              {filterMode === "cutoff" ? (
                <div className="flex items-center gap-2">
                  <select
                    value={selectedCutoffId}
                    onChange={(e) => setSelectedCutoffId(e.target.value)}
                    className="bg-[#140818] border border-[#FFA4D2]/30 rounded-xl px-3 py-1.5 text-xs font-bold text-[#FFFDE6] focus:outline-none focus:border-[#FF77B9]"
                  >
                    {groupedCutoffs.map((g) => (
                      <option key={g.info.id} value={g.info.id}>
                        {g.info.label} {g.info.isCurrent ? "(Current)" : ""} ({g.shiftCount} shifts)
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                /* Custom Date Range Inputs */
                <div className="flex items-center gap-2 text-xs">
                  <div className="flex items-center gap-1.5 bg-[#140818] border border-[#FFA4D2]/30 rounded-xl px-2.5 py-1">
                    <span className="text-[10px] uppercase font-bold text-[#FFA4D2]/60">From</span>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="bg-transparent text-xs text-[#FFFDE6] focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 bg-[#140818] border border-[#FFA4D2]/30 rounded-xl px-2.5 py-1">
                    <span className="text-[10px] uppercase font-bold text-[#FFA4D2]/60">To</span>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="bg-transparent text-xs text-[#FFFDE6] focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Quick Metrics Bar & Reset Action */}
            <div className="flex flex-wrap items-center gap-4 text-xs">
              {Object.keys(rowOverrides).length > 0 && (
                <button
                  type="button"
                  onClick={() => setRowOverrides({})}
                  className="px-2.5 py-1.5 rounded-xl bg-[#2b0e1b] border border-red-500/30 hover:border-red-500/60 text-red-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  title="Reset all inline cell edits back to saved shift values"
                >
                  <RotateCcw size={13} />
                  <span>Reset Edits ({Object.keys(rowOverrides).length})</span>
                </button>
              )}
              <div className="flex flex-col items-end">
                <span className="text-[10px] uppercase font-bold text-[#FFA4D2]/60">Total Shifts</span>
                <span className="font-extrabold text-[#FFFDE6] font-mono text-sm">
                  {calculatedRows.length}
                </span>
              </div>
              <div className="w-px h-7 bg-[#FFA4D2]/20" />
              <div className="flex flex-col items-end">
                <span className="text-[10px] uppercase font-bold text-[#FFA4D2]/60">Total Sales</span>
                <span className="font-extrabold text-[#FF77B9] font-mono text-sm">
                  {formatCurrency(totalSales)}
                </span>
              </div>
              <div className="w-px h-7 bg-[#FFA4D2]/20" />
              <div className="flex flex-col items-end">
                <span className="text-[10px] uppercase font-bold text-emerald-400">Expected Salary</span>
                <span className="font-extrabold text-emerald-300 font-mono text-sm">
                  {formatCurrency(totalExpectedSalary)}
                </span>
              </div>
            </div>
          </div>

          {/* â”€â”€ SETTINGS DRAWER (COLLAPSIBLE) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {showSettingsDrawer && (
            <div className="p-4 rounded-2xl bg-[#1a0b22] border border-[#FFA4D2]/30 shadow-2xl flex flex-col gap-3 animate-fadeIn">
              <div className="flex items-center justify-between pb-2 border-b border-[#FFA4D2]/15">
                <span className="text-xs font-bold text-[#FFFDE6] flex items-center gap-1.5">
                  <Settings2 size={14} className="text-[#FF77B9]" />
                  <span>Spreadsheet Header &amp; Shift Defaults</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowSettingsDrawer(false)}
                  className="text-xs text-[#FFA4D2]/60 hover:text-[#FFFDE6]"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3 text-xs">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-[#FFA4D2]/70 uppercase">Chatter (D1)</label>
                  <input
                    type="text"
                    value={chatterName}
                    onChange={(e) => setChatterName(e.target.value)}
                    className="bg-[#120716] border border-[#FFA4D2]/25 rounded-lg px-2.5 py-1.5 text-xs text-[#FFFDE6] focus:outline-none focus:border-[#FF77B9]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-[#FFA4D2]/70 uppercase">Client (D2)</label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="bg-[#120716] border border-[#FFA4D2]/25 rounded-lg px-2.5 py-1.5 text-xs text-[#FFFDE6] focus:outline-none focus:border-[#FF77B9]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-[#FFA4D2]/70 uppercase">Schedule (D3)</label>
                  <input
                    type="text"
                    value={shiftSchedule}
                    onChange={(e) => setShiftSchedule(e.target.value)}
                    className="bg-[#120716] border border-[#FFA4D2]/25 rounded-lg px-2.5 py-1.5 text-xs text-[#FFFDE6] focus:outline-none focus:border-[#FF77B9]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-[#FFA4D2]/70 uppercase">Clock In (Col C)</label>
                  <input
                    type="text"
                    value={clockIn}
                    onChange={(e) => {
                      const val = e.target.value;
                      setClockIn(val);
                      const hrs = calculateHoursFromTimeRange(val, clockOut, shiftHours);
                      setShiftHours(hrs);
                    }}
                    className="bg-[#120716] border border-[#FFA4D2]/25 rounded-lg px-2.5 py-1.5 text-xs text-[#FFFDE6] focus:outline-none focus:border-[#FF77B9]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-[#FFA4D2]/70 uppercase">Clock Out (Col D)</label>
                  <input
                    type="text"
                    value={clockOut}
                    onChange={(e) => {
                      const val = e.target.value;
                      setClockOut(val);
                      const hrs = calculateHoursFromTimeRange(clockIn, val, shiftHours);
                      setShiftHours(hrs);
                    }}
                    className="bg-[#120716] border border-[#FFA4D2]/25 rounded-lg px-2.5 py-1.5 text-xs text-[#FFFDE6] focus:outline-none focus:border-[#FF77B9]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-[#FFA4D2]/70 uppercase">Shift Hours (Col E)</label>
                  <input
                    type="number"
                    step="0.25"
                    value={shiftHours}
                    onChange={(e) => setShiftHours(parseFloat(e.target.value) || 0)}
                    className="bg-[#120716] border border-[#FFA4D2]/25 rounded-lg px-2.5 py-1.5 text-xs text-[#FFFDE6] focus:outline-none focus:border-[#FF77B9]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-[#FFA4D2]/70 uppercase">Payment (H2)</label>
                  <input
                    type="text"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="bg-[#120716] border border-[#FFA4D2]/25 rounded-lg px-2.5 py-1.5 text-xs text-[#FFFDE6] focus:outline-none focus:border-[#FF77B9]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
              GOOGLE SHEET VISUAL PREVIEW SPREADSHEET
              â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
          <div className="bg-[#18091d] border border-[#FFA4D2]/25 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            {/* Sheet Title Tab Bar */}
            <div className="bg-[#130717] px-4 py-2.5 border-b border-[#FFA4D2]/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-t-lg bg-[#270f2f] border-t-2 border-[#FF77B9] text-xs font-bold text-[#FFFDE6] flex items-center gap-2">
                  <FileSpreadsheet size={13} className="text-[#FF77B9]" />
                  <span>Tab: {targetTabName || "9/7/2026"}</span>
                </span>
                <span className="text-[11px] text-[#FFA4D2]/50 italic">
                  (Mirrors layout of &quot;Attendance and Salary Tracker&quot;)
                </span>
              </div>
              <div className="text-[11px] text-[#FFA4D2]/60 font-mono">
                Cols Aâ€“F (Input) | Cols Gâ€“H (Formulas)
              </div>
            </div>

            <div className="overflow-x-auto p-4">
              <table className="w-full border-collapse font-sans text-xs border border-[#FFA4D2]/25">
                {/* â”€â”€ ROW 1 TO 3: CUTOFF HEADER BLOCK â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                <tbody>
                  {/* Row 1 */}
                  <tr className="border-b border-[#FFA4D2]/20 bg-[#1c0c22]">
                    <td className="w-10 text-center font-mono text-[10px] text-[#FFA4D2]/40 bg-[#140818] border-r border-[#FFA4D2]/20 py-1.5 select-none">
                      1
                    </td>
                    <td className="w-32 px-3 py-2 border-r border-[#FFA4D2]/15 text-[#FFA4D2]/40"></td>
                    <td className="w-32 px-3 py-2 border-r border-[#FFA4D2]/15 text-[#FFA4D2]/40"></td>
                    <td className="w-36 px-3 py-2 font-bold uppercase text-[10px] tracking-wider text-[#FFA4D2]/80 border-r border-[#FFA4D2]/15 bg-[#250e2b]">
                      CHATTER NAME
                    </td>
                    <td className="w-48 px-3 py-2 font-extrabold text-[#FFFDE6] border-r border-[#FFA4D2]/15 bg-[#200b26]">
                      {chatterName}
                    </td>
                    <td className="w-24 px-3 py-2 border-r border-[#FFA4D2]/15 text-[#FFA4D2]/40"></td>
                    <td className="w-36 px-3 py-2 font-bold uppercase text-[10px] tracking-wider text-[#FFA4D2]/80 border-r border-[#FFA4D2]/15 bg-[#250e2b]">
                      CUTOFF
                    </td>
                    <td className="w-32 px-3 py-2 border-r border-[#FFA4D2]/15 text-[#FFA4D2]/40"></td>
                    <td className="w-40 px-3 py-2 font-bold uppercase text-[10px] tracking-wider text-[#FFA4D2]/80 bg-[#250e2b]">
                      PAYMENT METHOD
                    </td>
                  </tr>

                  {/* Row 2 */}
                  <tr className="border-b border-[#FFA4D2]/20 bg-[#1a0b20]">
                    <td className="text-center font-mono text-[10px] text-[#FFA4D2]/40 bg-[#140818] border-r border-[#FFA4D2]/20 py-1.5 select-none">
                      2
                    </td>
                    <td className="px-3 py-2 border-r border-[#FFA4D2]/15 text-[#FFA4D2]/40"></td>
                    <td className="px-3 py-2 border-r border-[#FFA4D2]/15 text-[#FFA4D2]/40"></td>
                    <td className="px-3 py-2 font-bold uppercase text-[10px] tracking-wider text-[#FFA4D2]/80 border-r border-[#FFA4D2]/15 bg-[#250e2b]">
                      CLIENT(S)
                    </td>
                    <td className="px-3 py-2 font-extrabold text-[#FFFDE6] border-r border-[#FFA4D2]/15 bg-[#200b26]">
                      {clientName}
                    </td>
                    <td className="px-3 py-2 border-r border-[#FFA4D2]/15 text-[#FFA4D2]/40"></td>
                    <td className="px-3 py-2 font-bold uppercase text-[10px] tracking-wider text-[#FFA4D2]/80 border-r border-[#FFA4D2]/15 bg-[#250e2b]">
                      START DATE
                    </td>
                    <td className="px-3 py-2 font-bold text-[#FFFDE6] border-r border-[#FFA4D2]/15 bg-[#200b26]">
                      {displayDates.start}
                    </td>
                    <td className="px-3 py-2 font-extrabold text-[#FFFDE6] bg-[#200b26]">
                      {paymentMethod}
                    </td>
                  </tr>

                  {/* Row 3 */}
                  <tr className="border-b border-[#FFA4D2]/20 bg-[#1c0c22]">
                    <td className="text-center font-mono text-[10px] text-[#FFA4D2]/40 bg-[#140818] border-r border-[#FFA4D2]/20 py-1.5 select-none">
                      3
                    </td>
                    <td className="px-3 py-2 border-r border-[#FFA4D2]/15 text-[#FFA4D2]/40"></td>
                    <td className="px-3 py-2 border-r border-[#FFA4D2]/15 text-[#FFA4D2]/40"></td>
                    <td className="px-3 py-2 font-bold uppercase text-[10px] tracking-wider text-[#FFA4D2]/80 border-r border-[#FFA4D2]/15 bg-[#250e2b]">
                      SCHEDULE(S)
                    </td>
                    <td className="px-3 py-2 font-bold text-[#FFFDE6] border-r border-[#FFA4D2]/15 bg-[#200b26]">
                      {shiftSchedule}
                    </td>
                    <td className="px-3 py-2 border-r border-[#FFA4D2]/15 text-[#FFA4D2]/40"></td>
                    <td className="px-3 py-2 font-bold uppercase text-[10px] tracking-wider text-[#FFA4D2]/80 border-r border-[#FFA4D2]/15 bg-[#250e2b]">
                      END DATE
                    </td>
                    <td className="px-3 py-2 font-bold text-[#FFFDE6] border-r border-[#FFA4D2]/15 bg-[#200b26]">
                      {displayDates.end}
                    </td>
                    <td className="px-3 py-2 text-[#FFA4D2]/40"></td>
                  </tr>

                  {/* Row 4 (Blank row in sheet) */}
                  <tr className="border-b border-[#FFA4D2]/15 bg-[#140818]">
                    <td className="text-center font-mono text-[10px] text-[#FFA4D2]/30 border-r border-[#FFA4D2]/20 py-1 select-none">
                      4
                    </td>
                    <td colSpan={8} className="py-1"></td>
                  </tr>

                  {/* â”€â”€ ROW 5: COLUMN HEADERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                  <tr className="border-b-2 border-[#FFA4D2]/40 bg-[#2c1033] text-[#FFFDE6] font-extrabold uppercase text-[11px] tracking-wider">
                    <td className="text-center font-mono text-[10px] text-[#FFA4D2]/60 bg-[#19081e] border-r border-[#FFA4D2]/20 py-2.5 select-none">
                      5
                    </td>
                    <th className="px-3 py-2.5 border-r border-[#FFA4D2]/25 text-left">
                      <div className="flex items-center gap-1">
                        <span className="text-[#FF77B9] font-mono text-[10px]">A:</span>
                        <span>DATE</span>
                      </div>
                    </th>
                    <th className="px-3 py-2.5 border-r border-[#FFA4D2]/25 text-left">
                      <div className="flex items-center gap-1">
                        <span className="text-[#FF77B9] font-mono text-[10px]">B:</span>
                        <span>CLIENT</span>
                      </div>
                    </th>
                    <th className="px-3 py-2.5 border-r border-[#FFA4D2]/25 text-left">
                      <div className="flex items-center gap-1">
                        <span className="text-[#FF77B9] font-mono text-[10px]">C:</span>
                        <span>CLOCK-IN</span>
                      </div>
                    </th>
                    <th className="px-3 py-2.5 border-r border-[#FFA4D2]/25 text-left">
                      <div className="flex items-center gap-1">
                        <span className="text-[#FF77B9] font-mono text-[10px]">D:</span>
                        <span>CLOCK-OUT</span>
                      </div>
                    </th>
                    <th className="px-3 py-2.5 border-r border-[#FFA4D2]/25 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-[#FF77B9] font-mono text-[10px]">E:</span>
                        <span>HOURS</span>
                      </div>
                    </th>
                    <th className="px-3 py-2.5 border-r border-[#FFA4D2]/25 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-[#FF77B9] font-mono text-[10px]">F:</span>
                        <span>TOTAL SALES</span>
                      </div>
                    </th>
                    <th className="px-3 py-2.5 border-r border-[#FFA4D2]/25 text-right bg-[#381442] text-[#FFFDE6]">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-emerald-400 font-mono text-[10px]">G (fx):</span>
                        <span>DAILY SALARY</span>
                      </div>
                    </th>
                    <th className="px-3 py-2.5 text-right bg-[#381442] text-emerald-300">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-emerald-400 font-mono text-[10px]">H (fx):</span>
                        <span>EXPECTED SALARY</span>
                      </div>
                    </th>
                  </tr>

                  {/* â”€â”€ ROW 6: INSTRUCTION ROW (NEVER TOUCH) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                  <tr className="border-b border-[#FFA4D2]/20 bg-[#16081a] text-[10px] text-[#FFA4D2]/60 italic">
                    <td className="text-center font-mono text-[10px] text-[#FFA4D2]/30 bg-[#130716] border-r border-[#FFA4D2]/20 py-2 select-none">
                      6
                    </td>
                    <td className="px-3 py-2 border-r border-[#FFA4D2]/15 text-[#FFA4D2]/40">
                      e.g. 8/30/2026
                    </td>
                    <td className="px-3 py-2 border-r border-[#FFA4D2]/15">
                      Name of client on Basecamp
                    </td>
                    <td colSpan={2} className="px-3 py-2 border-r border-[#FFA4D2]/15 text-center">
                      Follow exact clock in / out times as indicated on Basecamp
                    </td>
                    <td className="px-3 py-2 border-r border-[#FFA4D2]/15 text-center">8</td>
                    <td className="px-3 py-2 border-r border-[#FFA4D2]/15 text-right">
                      Daily sales as indicated in sales reports
                    </td>
                    <td className="px-3 py-2 border-r border-[#FFA4D2]/15 text-right font-mono text-emerald-400/60">
                      =Formula (Daily)
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-400/60">
                      =SUM(G7:G100)
                    </td>
                  </tr>

                  {/* data rows */}
                  {calculatedRows.length === 0 ? (
                    <tr>
                      <td className="text-center font-mono text-[10px] text-[#FFA4D2]/30 bg-[#140818] border-r border-[#FFA4D2]/20 py-8 select-none">
                        7
                      </td>
                      <td colSpan={8} className="py-8 text-center text-xs text-[#FFA4D2]/50">
                        {isLoading ? "Loading saved summaries..." : "No saved shifts found in this cutoff or date range. Save shifts on the dashboard to populate this sheet."}
                      </td>
                    </tr>
                  ) : (
                    calculatedRows.map((row, idx) => {
                      const rowNumber = 7 + idx;
                      return (
                        <tr key={row.id} className="border-b border-[#FFA4D2]/15 hover:bg-[#FF77B9]/5 transition font-mono text-xs group">
                          <td className="text-center font-mono text-[10px] text-[#FFA4D2]/40 bg-[#140818] border-r border-[#FFA4D2]/20 py-2 select-none">{rowNumber}</td>
                          <td className="px-1 py-1 border-r border-[#FFA4D2]/15">
                            <input
                              type="text"
                              value={row.displayDate}
                              onChange={(e) => updateRowOverride(row.id, "date", e.target.value)}
                              className="w-full bg-transparent group-hover:bg-[#200b2a] focus:bg-[#200b2a] border border-transparent focus:border-[#E31B73] rounded px-2 py-1 text-[#FFFDE6] font-semibold text-xs focus:outline-none transition"
                              title="Click to edit date"
                            />
                          </td>
                          <td className="px-1 py-1 border-r border-[#FFA4D2]/15">
                            <input
                              type="text"
                              value={row.displayClient}
                              onChange={(e) => updateRowOverride(row.id, "client", e.target.value)}
                              className="w-full bg-transparent group-hover:bg-[#200b2a] focus:bg-[#200b2a] border border-transparent focus:border-[#E31B73] rounded px-2 py-1 text-[#FF77B9] font-bold text-xs focus:outline-none transition"
                              title="Use | to separate multiple models"
                            />
                          </td>
                          <td className="px-1 py-1 border-r border-[#FFA4D2]/15">
                            <input
                              type="text"
                              value={row.displayClockIn}
                              onChange={(e) => updateRowOverride(row.id, "clockIn", e.target.value)}
                              className="w-full bg-transparent group-hover:bg-[#200b2a] focus:bg-[#200b2a] border border-transparent focus:border-[#E31B73] rounded px-2 py-1 text-[#FFA4D2]/90 text-xs focus:outline-none transition"
                              title="Edit Time In (e.g. 0:00 AM CET, 0:30 AM, 9:00 PM). Auto-calculates hours!"
                              placeholder="Time In"
                            />
                          </td>
                          <td className="px-1 py-1 border-r border-[#FFA4D2]/15">
                            <input
                              type="text"
                              value={row.displayClockOut}
                              onChange={(e) => updateRowOverride(row.id, "clockOut", e.target.value)}
                              className="w-full bg-transparent group-hover:bg-[#200b2a] focus:bg-[#200b2a] border border-transparent focus:border-[#E31B73] rounded px-2 py-1 text-[#FFA4D2]/90 text-xs focus:outline-none transition"
                              title="Edit Time Out (e.g. 8:00 AM CET, 7:15 AM, 5:00 AM). Auto-calculates hours!"
                              placeholder="Time Out"
                            />
                          </td>
                          <td className="px-1 py-1 border-r border-[#FFA4D2]/15 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <input
                                type="number"
                                step="0.25"
                                value={row.displayHours}
                                onChange={(e) => updateRowOverride(row.id, "hours", parseFloat(e.target.value) || 0)}
                                className={`w-14 text-center bg-transparent group-hover:bg-[#200b2a] focus:bg-[#200b2a] border border-transparent focus:border-[#E31B73] rounded px-1 py-1 font-bold text-xs focus:outline-none transition ${
                                  row.displayHours < 8
                                    ? "text-amber-300 font-extrabold bg-amber-950/20"
                                    : row.displayHours > 8
                                    ? "text-emerald-300 font-extrabold bg-emerald-950/20"
                                    : "text-[#FFFDE6]"
                                }`}
                                title="Hours worked (automatically updated from Time In/Out, or edit directly)"
                              />
                              {row.displayHours < 8 && (
                                <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30" title="Late or undertime shift (< 8 hrs)">
                                  Late
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-1 py-1 border-r border-[#FFA4D2]/15">
                            <input
                              type="number"
                              step="0.01"
                              value={row.displaySales}
                              onChange={(e) => updateRowOverride(row.id, "sales", e.target.value)}
                              className="w-full bg-transparent group-hover:bg-[#200b2a] focus:bg-[#200b2a] border border-transparent focus:border-[#E31B73] rounded px-2 py-1 text-[#FFFDE6] font-extrabold text-xs text-right focus:outline-none transition"
                              title="Click to edit sales amount"
                            />
                          </td>
                          <td className="px-3 py-2 border-r border-[#FFA4D2]/15 text-right font-extrabold text-emerald-400 bg-emerald-950/10">
                            {formatCurrency(row.dailySalary)}
                          </td>
                          <td className="px-3 py-2 text-right font-extrabold text-emerald-300 bg-emerald-950/20">
                            {idx === 0 ? formatCurrency(totalExpectedSalary) : ""}
                          </td>
                        </tr>
                      );
                    })
                  )}

                  {/* Empty placeholder rows up to row 12 to look like a real spreadsheet */}
                  {Array.from({ length: Math.max(0, 5 - calculatedRows.length) }).map((_, i) => {
                    const rowNum = 7 + calculatedRows.length + i;
                    return (
                      <tr key={`empty-${i}`} className="border-b border-[#FFA4D2]/10 text-xs">
                        <td className="text-center font-mono text-[10px] text-[#FFA4D2]/20 bg-[#140818] border-r border-[#FFA4D2]/20 py-2 select-none">
                          {rowNum}
                        </td>
                        <td className="px-3 py-2 border-r border-[#FFA4D2]/10">&nbsp;</td>
                        <td className="px-3 py-2 border-r border-[#FFA4D2]/10">&nbsp;</td>
                        <td className="px-3 py-2 border-r border-[#FFA4D2]/10">&nbsp;</td>
                        <td className="px-3 py-2 border-r border-[#FFA4D2]/10">&nbsp;</td>
                        <td className="px-3 py-2 border-r border-[#FFA4D2]/10">&nbsp;</td>
                        <td className="px-3 py-2 border-r border-[#FFA4D2]/10">&nbsp;</td>
                        <td className="px-3 py-2 border-r border-[#FFA4D2]/10 text-right text-emerald-400/20">
                          $0.00
                        </td>
                        <td className="px-3 py-2">&nbsp;</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          DEPLOY TO GOOGLE SHEET MODAL (DATE RANGE & OPTIONS)
          â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {isSyncModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-lg bg-[#1f0d26] border border-[#FFA4D2]/30 rounded-2xl shadow-2xl p-6 flex flex-col gap-5 text-xs">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#FFA4D2]/20">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-600/30 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <UploadCloud size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#FFFDE6]">Deploy to Google Sheet</h3>
                  <p className="text-[11px] text-[#FFA4D2]/70">
                    Push selected shift data with duplicate tab handling
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSyncModalOpen(false)}
                className="p-1 rounded-lg text-[#FFA4D2]/60 hover:text-[#FFFDE6]"
              >
                <X size={16} />
              </button>
            </div>

            {/* Scope / Date Range Summary */}
            <div className="p-3.5 rounded-xl bg-[#140818] border border-[#FFA4D2]/20 flex flex-col gap-2">
              <span className="text-[10px] uppercase font-bold text-[#FFA4D2]/60 tracking-wider">
                Deployment Scope ({tableRows.length} shifts)
              </span>
              <div className="flex items-center justify-between font-mono text-xs text-[#FFFDE6]">
                <span>
                  Date Range: <strong>{displayDates.start}</strong> â†’ <strong>{displayDates.end}</strong>
                </span>
                <span className="text-[#FF77B9] font-bold">{formatCurrency(totalSales)}</span>
              </div>
            </div>

            {/* Modal Form Options */}
            <div className="flex flex-col gap-3.5">
              {/* Target Tab Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-[#FFA4D2] flex items-center justify-between">
                  <span>Target Sheet Tab Name</span>
                  <span className="text-[10px] text-[#FFA4D2]/60">e.g. 9/7/2026 or mm/dd/yyyy</span>
                </label>
                <input
                  type="text"
                  value={targetTabName}
                  onChange={(e) => setTargetTabName(e.target.value)}
                  placeholder="e.g. 9/21/2026"
                  className="bg-[#140818] border border-[#FFA4D2]/30 rounded-xl px-3 py-2 text-xs text-[#FFFDE6] focus:outline-none focus:border-[#FF77B9]"
                />
              </div>

              {/* Duplicate Handling Checkbox */}
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[#17091b] border border-[#FFA4D2]/15 cursor-pointer hover:border-[#FFA4D2]/30 transition">
                <input
                  type="checkbox"
                  checked={createTabOnDuplicate}
                  onChange={(e) => setCreateTabOnDuplicate(e.target.checked)}
                  className="mt-0.5 accent-[#E31B73] rounded cursor-pointer"
                />
                <div className="flex flex-col">
                  <span className="font-bold text-[#FFFDE6]">
                    Create another tab if duplicate exists (e.g. {targetTabName || "mm/dd/yyyy"})
                  </span>
                  <span className="text-[10px] text-[#FFA4D2]/60">
                    If date &amp; client already exist in the target tab, a new tab is created with the exact layout and formulas preserved.
                  </span>
                </div>
              </label>

              {/* Reset Checkbox */}
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[#17091b] border border-[#FFA4D2]/15 cursor-pointer hover:border-[#FFA4D2]/30 transition">
                <input
                  type="checkbox"
                  checked={resetTargetTab}
                  onChange={(e) => setResetTargetTab(e.target.checked)}
                  className="mt-0.5 accent-[#E31B73] rounded cursor-pointer"
                />
                <div className="flex flex-col">
                  <span className="font-bold text-[#FFFDE6]">
                    Reset data rows (A7:F100) on target tab before pushing
                  </span>
                  <span className="text-[10px] text-[#FFA4D2]/60">
                    Clears previous shift rows on the tab. Formulas in G &amp; H and rows 1â€“6 are never cleared.
                  </span>
                </div>
              </label>

              {/* Update Header Checkbox */}
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[#17091b] border border-[#FFA4D2]/15 cursor-pointer hover:border-[#FFA4D2]/30 transition">
                <input
                  type="checkbox"
                  checked={updateHeaderOnSync}
                  onChange={(e) => setUpdateHeaderOnSync(e.target.checked)}
                  className="mt-0.5 accent-[#E31B73] rounded cursor-pointer"
                />
                <div className="flex flex-col">
                  <span className="font-bold text-[#FFFDE6]">
                    Update Cutoff Header cells (D1, D2, D3, G2, G3, H2)
                  </span>
                  <span className="text-[10px] text-[#FFA4D2]/60">
                    Updates chatter, client, schedule, start/end dates, and payment method in rows 1â€“3.
                  </span>
                </div>
              </label>
            </div>

            {/* Status & Feedback Banner */}
            {syncStatus.type !== "idle" && (
              <div
                className={`p-3.5 rounded-xl border flex items-start gap-2.5 ${
                  syncStatus.type === "success"
                    ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-200"
                    : "bg-rose-950/40 border-rose-500/40 text-rose-200"
                }`}
              >
                {syncStatus.type === "success" ? (
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
                )}
                <div className="flex flex-col gap-1">
                  <span className="font-bold">{syncStatus.message}</span>
                  {syncStatus.details && (
                    <div className="text-[10px] font-mono text-emerald-300/80">
                      Added: {syncStatus.details.added} rows | Skipped: {syncStatus.details.skipped} | Tab: {syncStatus.details.tabName}
                      {syncStatus.details.createdNewTab ? " (New Tab Created!)" : ""}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#FFA4D2]/15">
              <button
                type="button"
                onClick={() => setIsSyncModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#250f2c] hover:bg-[#301339] text-[#FFA4D2] font-bold text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteSync}
                disabled={isSyncing || tableRows.length === 0}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/30 transition cursor-pointer"
              >
                {isSyncing ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Syncing...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud size={15} />
                    <span>Push {tableRows.length} Shift(s) Now</span>
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
