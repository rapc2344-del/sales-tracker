"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  FileSpreadsheet,
  Printer,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { getCurrentCutoff, getCutoffForDate, parseSummaryDate } from "@/lib/cutoff";
import { formatMDY } from "@/lib/gsheet";
import type { SavedSummary } from "@/lib/types";

interface CreateInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Optional custom handler when already on the /invoice page
  onProceedDirectly?: () => void;
}

export default function CreateInvoiceModal({
  isOpen,
  onClose,
  onProceedDirectly,
}: CreateInvoiceModalProps) {
  const router = useRouter();
  const currentCutoff = useMemo(() => getCurrentCutoff(), []);

  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [savedSummaries, setSavedSummaries] = useState<SavedSummary[]>([]);
  const [chatterConfig, setChatterConfig] = useState({
    chatter: "Raphael",
    client: "Nadya",
    schedule: "0:00 AM CET - 8:00 AM CET",
    clockIn: "0:00 AM CET",
    clockOut: "8:00 AM CET",
    hours: 8,
    payment: "union bank",
  });

  const [resetTargetTab, setResetTargetTab] = useState(true);

  // Fetch summaries and config when modal opens
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setSyncSuccess(false);
    try {
      const [sumRes, cfgRes] = await Promise.all([
        fetch("/api/saved-summaries", { cache: "no-store" }),
        fetch("/api/sync-sheet", { cache: "no-store" }),
      ]);

      if (sumRes.ok) {
        const data: SavedSummary[] = await sumRes.json();
        setSavedSummaries(data);
      }

      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        if (cfg.config) {
          setChatterConfig((prev) => ({
            ...prev,
            chatter: cfg.config.chatter?.replace(" (default)", "") || prev.chatter,
            client: cfg.config.client?.replace(" (default)", "") || prev.client,
            schedule: cfg.config.schedule?.replace(" (default)", "") || prev.schedule,
            hours: Number(cfg.config.hours) || prev.hours,
            payment: cfg.config.payment?.replace(" (default)", "") || prev.payment,
          }));
        }
      }
    } catch {
      // Non-critical, fallback to defaults
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadData();
    } else {
      setSyncSuccess(false);
      setErrorMessage(null);
    }
  }, [isOpen, loadData]);

  // Summaries belonging strictly to the current running cutoff
  const currentSummaries = useMemo(() => {
    return savedSummaries.filter((s) => {
      const cutoff = getCutoffForDate(parseSummaryDate(s));
      return cutoff.id === currentCutoff.id;
    });
  }, [savedSummaries, currentCutoff]);

  const totalSales = useMemo(() => {
    return currentSummaries.reduce((sum, s) => sum + (s.total_revenue || 0), 0);
  }, [currentSummaries]);

  // Target Tab Name for Google Sheets (Cutoff End Date as M/D/YYYY)
  const targetTabName = useMemo(() => {
    const d = new Date(currentCutoff.endDate);
    if (!isNaN(d.getTime())) {
      return formatMDY(d);
    }
    return formatMDY(new Date());
  }, [currentCutoff]);

  // Proceed without sync
  const handleProceedOnly = () => {
    onClose();
    if (onProceedDirectly) {
      onProceedDirectly();
    } else {
      router.push("/invoice?cutoff=current&createPdf=true");
    }
  };

  // Sync to Google Sheet then Proceed
  const handleSyncAndProceed = async () => {
    setIsSyncing(true);
    setErrorMessage(null);
    try {
      // Build rows from current cutoff summaries
      const payloadRows = currentSummaries.map((s) => {
        const d = parseSummaryDate(s);
        return {
          date: formatMDY(d),
          client: chatterConfig.client,
          clockIn: chatterConfig.clockIn,
          clockOut: chatterConfig.clockOut,
          hours: chatterConfig.hours,
          sales: Math.round((s.total_revenue || 0) * 100) / 100,
        };
      });

      const headerPayload = {
        chatter: chatterConfig.chatter,
        client: chatterConfig.client,
        schedule: chatterConfig.schedule,
        startDate: currentCutoff.displayStartDate,
        endDate: currentCutoff.displayEndDate,
        payment: chatterConfig.payment,
      };

      const res = await fetch("/api/sync-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetTab: targetTabName,
          createTabIfDuplicate: true,
          newTabName: targetTabName,
          reset: resetTargetTab,
          header: headerPayload,
          rows: payloadRows,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || data.message || "Failed to sync to Google Sheet");
      }

      setSyncSuccess(true);
      // Wait a moment so the user sees the confirmation checkmark
      setTimeout(() => {
        onClose();
        if (onProceedDirectly) {
          onProceedDirectly();
        } else {
          router.push("/invoice?cutoff=current&createPdf=true");
        }
      }, 700);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sync error";
      setErrorMessage(msg);
    } finally {
      setIsSyncing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div
        className="w-full max-w-lg bg-[#18091d] border border-[#FFA4D2]/30 rounded-2xl shadow-2xl shadow-[#E31B73]/20 overflow-hidden flex flex-col text-[#FFFDE6]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#FFA4D2]/20 bg-[#230d2a] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#E31B73] to-[#FF77B9] flex items-center justify-center shadow-lg shadow-[#E31B73]/30">
              <Printer size={20} className="text-[#FFFDE6]" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-[#FFFDE6] flex items-center gap-2">
                <span>Create Invoice</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#E31B73]/20 text-[#FF77B9] border border-[#FF77B9]/30 font-bold uppercase tracking-wider">
                  Active Cutoff
                </span>
              </h2>
              <p className="text-xs text-[#FFA4D2]/80">{currentCutoff.label}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#FFA4D2]/60 hover:text-[#FFFDE6] hover:bg-white/10 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 flex flex-col gap-4">
          {/* Question / Prompt Banner */}
          <div className="p-3.5 rounded-xl bg-[#2a1033] border border-[#FFA4D2]/20 flex items-start gap-3">
            <FileSpreadsheet size={20} className="text-[#FF77B9] shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed text-[#FFA4D2]">
              <p className="font-bold text-[#FFFDE6] mb-1">
                Reflect data to Google Sheet first?
              </p>
              <p>
                Would you like to sync and deploy this cutoff&apos;s attendance data to your Google
                Sheet before generating the invoice PDF?
              </p>
            </div>
          </div>

          {/* Current Cutoff Data Summary */}
          <div className="p-4 rounded-xl bg-[#120716] border border-[#FFA4D2]/15 flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#FFA4D2]/70">Cutoff Date Range:</span>
              <span className="font-bold text-[#FFFDE6] font-mono">
                {currentCutoff.displayStartDate} – {currentCutoff.displayEndDate}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-[#FFA4D2]/70">Recorded Shifts:</span>
              <span className="font-bold text-[#FFFDE6]">
                {isLoading ? (
                  <span className="text-[#FFA4D2]/50 italic">Checking shifts...</span>
                ) : (
                  `${currentSummaries.length} shift${currentSummaries.length === 1 ? "" : "s"}`
                )}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-[#FFA4D2]/70">Total Shift Sales:</span>
              <span className="font-bold text-emerald-400 font-mono">
                ${totalSales.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs border-t border-[#FFA4D2]/10 pt-2">
              <span className="text-[#FFA4D2]/70">Google Sheet Tab:</span>
              <span className="font-bold text-[#FF77B9] font-mono">
                {targetTabName}
              </span>
            </div>
          </div>

          {/* Sync Option: Reset Tab Checkbox */}
          <label className="flex items-center gap-2.5 text-xs text-[#FFA4D2]/80 cursor-pointer select-none px-1">
            <input
              type="checkbox"
              checked={resetTargetTab}
              onChange={(e) => setResetTargetTab(e.target.checked)}
              className="rounded border-[#FFA4D2]/40 bg-[#120716] text-[#E31B73] focus:ring-[#E31B73] h-4 w-4 accent-[#E31B73]"
            />
            <span>
              Clear previous rows in tab <strong className="text-[#FFFDE6] font-mono">{targetTabName}</strong> before syncing (preserves formulas)
            </span>
          </label>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/30 text-red-200 text-xs flex items-center gap-2">
              <AlertCircle size={16} className="text-red-400 shrink-0" />
              <span className="truncate">{errorMessage}</span>
            </div>
          )}

          {/* Success Message */}
          {syncSuccess && (
            <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-emerald-200 text-xs flex items-center gap-2 animate-fadeIn">
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
              <span>Google Sheet successfully updated! Opening invoice...</span>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 bg-[#230d2a] border-t border-[#FFA4D2]/20 flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isSyncing}
            className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-bold text-[#FFA4D2]/70 hover:text-[#FFFDE6] hover:bg-white/5 transition disabled:opacity-50"
          >
            Cancel
          </button>

          <div className="w-full sm:w-auto flex flex-col sm:flex-row items-center gap-2">
            {/* Option 1: Create Invoice Only (Skip GSheet) */}
            <button
              type="button"
              onClick={handleProceedOnly}
              disabled={isSyncing}
              className="w-full sm:w-auto px-3.5 py-2 rounded-xl text-xs font-bold bg-[#18091d] border border-[#FFA4D2]/30 text-[#FFA4D2] hover:text-[#FFFDE6] hover:border-[#FF77B9] transition flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <Printer size={14} />
              <span>Create Invoice Only</span>
            </button>

            {/* Option 2: Sync to Google Sheet & Create Invoice */}
            <button
              type="button"
              onClick={handleSyncAndProceed}
              disabled={isSyncing || syncSuccess}
              className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-extrabold bg-gradient-to-r from-emerald-600 via-teal-600 to-[#E31B73] hover:from-emerald-500 hover:to-[#f0287d] text-white shadow-lg shadow-emerald-900/40 transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {isSyncing ? (
                <>
                  <Loader2 size={14} className="animate-spin text-white" />
                  <span>Syncing to Sheet...</span>
                </>
              ) : syncSuccess ? (
                <>
                  <CheckCircle2 size={14} className="text-white" />
                  <span>Synced!</span>
                </>
              ) : (
                <>
                  <UploadCloud size={14} />
                  <span>Sync to GSheet &amp; Create</span>
                  <ArrowRight size={13} className="opacity-70" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
