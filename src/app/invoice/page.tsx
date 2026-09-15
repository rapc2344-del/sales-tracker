"use client";

import { useState, useEffect, useMemo, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  FolderClock,
  Receipt,
  Plus,
  Trash2,
  Printer,
  Sparkles,
  RotateCcw,
  Menu,
  Eye,
  Edit3,
  Columns,
  Upload,
  X,
  CheckCircle2,
  Calendar,
  DollarSign,
  Layers,
  Clock,
  ArrowRight,
  Zap,
} from "lucide-react";
import type { Sale, SavedSummary } from "@/lib/types";

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  rate: number;
}

const DEFAULT_SENDER = `Raphael Avante
Blk 168 lot 23 phase 4,
paliparan 3, dasma
cavite city, 4114`;

const DEFAULT_BILL_TO = `NEXTUP SOLUTIONS LLC
8206 Louisiana Blvd NE, Ste A #4305
Albuquerque, NM 87113
USA`;

const DEFAULT_ITEMS: InvoiceItem[] = [
  {
    id: "item-1",
    description: "WE Social Media Management (No bonuses) 0AM CET - 8AM CET\nTL Lore",
    quantity: 16,
    rate: 1.75,
  },
  {
    id: "item-2",
    description: "WE Social Media Management ($1,500 sales bonus) 0AM CET - 8AM\nCET TL Lore",
    quantity: 8,
    rate: 3.5,
  },
];

const DEFAULT_NOTES = `Notes:
Name: Raphael Avante
Recipient type: Personal
Account number: 109331756015
Sort code or Routing number: UBPHPHMMXXX
Recipient bank country: Philippines
Currency: USD
Amount:$56.00
Payment reference: Social Media Marketing
Recipient country: Philippines
State or province: Cavite
Address Line 1: Blk168, Lt23, Ph4, Paliparan 3
City: Damariñas City
Postal code: 4114`;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

// ── Cutoff Period Rules (8-23 and 24-7) ───────────────────
export interface CutoffPeriodInfo {
  id: string; // e.g. "2026-09-08_2026-09-23"
  label: string; // e.g. "Sep 8 – Sep 23, 2026"
  type: "8-23" | "24-7";
  startDate: string;
  endDate: string;
  displayStartDate: string;
  displayEndDate: string;
  isCurrent: boolean;
}

export function parseSummaryDate(summary: SavedSummary): Date {
  // Check if export_filename contains YYYY-MM-DD
  const match = summary.export_filename?.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const d = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00`);
    if (!isNaN(d.getTime())) return d;
  }
  if (summary.created_at) {
    const d = new Date(summary.created_at);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

export function getCutoffForDate(date: Date, now: Date = new Date()): CutoffPeriodInfo {
  const y = date.getFullYear();
  const m = date.getMonth();
  const day = date.getDate();

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  let start: Date;
  let end: Date;
  let label: string;
  let type: "8-23" | "24-7";
  let displayStart: string;
  let displayEnd: string;
  let id: string;

  if (day >= 8 && day <= 23) {
    start = new Date(y, m, 8, 0, 0, 0, 0);
    end = new Date(y, m, 23, 23, 59, 59, 999);
    type = "8-23";
    const mStr = String(m + 1).padStart(2, "0");
    id = `${y}-${mStr}-08_${y}-${mStr}-23`;
    label = `${monthNames[m]} 8 – ${monthNames[m]} 23, ${y}`;
    displayStart = `${monthNames[m]} 8, ${y}`;
    displayEnd = `${monthNames[m]} 23, ${y}`;
  } else if (day >= 24) {
    start = new Date(y, m, 24, 0, 0, 0, 0);
    const nextM = (m + 1) % 12;
    const nextY = m === 11 ? y + 1 : y;
    end = new Date(nextY, nextM, 7, 23, 59, 59, 999);
    type = "24-7";
    const mStr = String(m + 1).padStart(2, "0");
    const nextMStr = String(nextM + 1).padStart(2, "0");
    id = `${y}-${mStr}-24_${nextY}-${nextMStr}-07`;
    label = `${monthNames[m]} 24 – ${monthNames[nextM]} 7, ${nextY}`;
    displayStart = `${monthNames[m]} 24, ${y}`;
    displayEnd = `${monthNames[nextM]} 7, ${nextY}`;
  } else {
    // day <= 7
    const prevM = (m + 11) % 12;
    const prevY = m === 0 ? y - 1 : y;
    start = new Date(prevY, prevM, 24, 0, 0, 0, 0);
    end = new Date(y, m, 7, 23, 59, 59, 999);
    type = "24-7";
    const prevMStr = String(prevM + 1).padStart(2, "0");
    const mStr = String(m + 1).padStart(2, "0");
    id = `${prevY}-${prevMStr}-24_${y}-${mStr}-07`;
    label = `${monthNames[prevM]} 24 – ${monthNames[m]} 7, ${y}`;
    displayStart = `${monthNames[prevM]} 24, ${prevY}`;
    displayEnd = `${monthNames[m]} 7, ${y}`;
  }

  const isCurrent = now >= start && now <= end;

  return {
    id,
    label,
    type,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    displayStartDate: displayStart,
    displayEndDate: displayEnd,
    isCurrent,
  };
}

export interface GroupedCutoff {
  info: CutoffPeriodInfo;
  summaries: SavedSummary[];
  totalRevenue: number;
  shiftCount: number;
  tierBreakdown: {
    tier: number;
    bonusLabel: string;
    rate: number;
    shiftCount: number;
    hours: number;
    subtotal: number;
  }[];
}

export function groupSummariesByCutoff(
  summaries: SavedSummary[],
  hoursPerShift: number = 8
): GroupedCutoff[] {
  const map = new Map<string, { info: CutoffPeriodInfo; summaries: SavedSummary[] }>();

  for (const s of summaries) {
    const date = parseSummaryDate(s);
    const cutoff = getCutoffForDate(date);
    const existing = map.get(cutoff.id);
    if (existing) {
      existing.summaries.push(s);
    } else {
      map.set(cutoff.id, { info: cutoff, summaries: [s] });
    }
  }

  // Ensure current cutoff is always present even if 0 summaries logged yet
  const currentCutoff = getCutoffForDate(new Date());
  if (!map.has(currentCutoff.id)) {
    map.set(currentCutoff.id, { info: currentCutoff, summaries: [] });
  }

  const result: GroupedCutoff[] = [];

  for (const { info, summaries: sumList } of map.values()) {
    const sorted = [...sumList].sort(
      (a, b) => parseSummaryDate(a).getTime() - parseSummaryDate(b).getTime()
    );

    const tierMap = new Map<
      number,
      {
        tier: number;
        bonusLabel: string;
        rate: number;
        shiftCount: number;
        hours: number;
        subtotal: number;
      }
    >();

    let totalRev = 0;
    for (const s of sorted) {
      const rev = s.total_revenue || 0;
      totalRev += rev;
      const { tier, bonusLabel, rate } = calculateShiftBonusAndRate(rev);
      const existing = tierMap.get(tier) || {
        tier,
        bonusLabel,
        rate,
        shiftCount: 0,
        hours: 0,
        subtotal: 0,
      };
      existing.shiftCount += 1;
      existing.hours += hoursPerShift;
      existing.subtotal += hoursPerShift * rate;
      tierMap.set(tier, existing);
    }

    const tierBreakdown = Array.from(tierMap.values()).sort((a, b) => a.tier - b.tier);

    result.push({
      info,
      summaries: sorted,
      totalRevenue: totalRev,
      shiftCount: sorted.length,
      tierBreakdown,
    });
  }

  return result.sort(
    (a, b) => new Date(b.info.startDate).getTime() - new Date(a.info.startDate).getTime()
  );
}

// ── Rate & Bonus Calculation Rules ────────────────────────
// - < $500: (No bonuses) -> Rate $1.75
// - $500: ($500 sales bonus) -> Rate $2.00
// - $1000: ($1,000 sales bonus) -> Rate $3.00
// - $1500: ($1,500 sales bonus) -> Rate $3.50
// - $2000: ($2,000 sales bonus) -> Rate $4.00
export function calculateShiftBonusAndRate(revenue: number) {
  if (revenue < 500) {
    return {
      bonusLabel: "No bonuses",
      rate: 1.75,
      tier: 0,
      formattedBonus: "No bonuses",
    };
  }

  const tier = Math.floor(revenue / 500) * 500;
  const formattedTier = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(tier);

  let rate = 2.0;
  if (tier >= 2000) {
    const extra = Math.floor((tier - 2000) / 500);
    rate = 4.0 + extra * 0.5;
  } else if (tier >= 1500) {
    rate = 3.5;
  } else if (tier >= 1000) {
    rate = 3.0;
  } else if (tier >= 500) {
    rate = 2.0;
  }

  return {
    bonusLabel: `${formattedTier} sales bonus`,
    rate,
    tier,
    formattedBonus: `${formattedTier} sales bonus`,
  };
}

export function formatShiftItemDescription(
  bonusLabel: string,
  shift: string = "0AM CET - 8AM CET",
  tl: string = "TL Lore"
): string {
  return `WE Social Media Management (${bonusLabel}) ${shift}\n${tl}`;
}

function InvoiceGeneratorContent() {
  const searchParams = useSearchParams();
  const summaryIdParam = searchParams.get("summaryId");
  const cutoffParam = searchParams.get("cutoff");
  const cutoffIdParam = searchParams.get("cutoffId");

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState<"editor" | "preview" | "split">("editor");

  // Invoice Form State
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [fromDetails, setFromDetails] = useState(DEFAULT_SENDER);
  const [billTo, setBillTo] = useState(DEFAULT_BILL_TO);
  const [shipTo, setShipTo] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("25");
  const [invoiceDate, setInvoiceDate] = useState("Sep 8, 2026");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [poNumber, setPoNumber] = useState("");

  // Items
  const [items, setItems] = useState<InvoiceItem[]>(DEFAULT_ITEMS);

  // Notes & Terms
  const [notes, setNotes] = useState(DEFAULT_NOTES);
  const [terms, setTerms] = useState("");

  // Summary adjustments
  const [taxRate, setTaxRate] = useState<number>(0);
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [showShipping, setShowShipping] = useState(false);
  const [shippingAmount, setShippingAmount] = useState<number>(0);
  const [amountPaid, setAmountPaid] = useState<number>(0);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Saved Summaries & Cutoff Auto-Fill State
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<"cutoff" | "single" | "presets">("cutoff");
  const [savedSummariesList, setSavedSummariesList] = useState<SavedSummary[]>([]);
  const [isLoadingSummaries, setIsLoadingSummaries] = useState(false);
  const [selectedSummaryId, setSelectedSummaryId] = useState<number | null>(null);
  const [selectedCutoffId, setSelectedCutoffId] = useState<string | null>(null);
  const [shiftTime, setShiftTime] = useState("0AM CET - 8AM CET");
  const [tlName, setTlName] = useState("TL Lore");
  const [shiftHours, setShiftHours] = useState(8);

  // Fetch summaries from API
  const fetchSummaries = async () => {
    setIsLoadingSummaries(true);
    try {
      const res = await fetch("/api/saved-summaries");
      if (!res.ok) throw new Error("Failed to fetch");
      const data: SavedSummary[] = await res.json();
      setSavedSummariesList(data);
      if (data.length > 0 && selectedSummaryId === null) {
        setSelectedSummaryId(data[0].id);
      }
    } catch {
      showToast("Could not load saved summaries from database");
    } finally {
      setIsLoadingSummaries(false);
    }
  };

  const handleOpenSummaryModal = (defaultTab: "cutoff" | "single" | "presets" = "cutoff") => {
    setModalTab(defaultTab);
    setIsSummaryModalOpen(true);
    fetchSummaries();
  };

  // Grouped Cutoffs computed from saved summaries
  const groupedCutoffs = useMemo(() => {
    return groupSummariesByCutoff(savedSummariesList, shiftHours);
  }, [savedSummariesList, shiftHours]);

  const selectedCutoff = useMemo(() => {
    if (selectedCutoffId) {
      return groupedCutoffs.find((c) => c.info.id === selectedCutoffId) || groupedCutoffs[0] || null;
    }
    return groupedCutoffs.find((c) => c.summaries.length > 0) || groupedCutoffs[0] || null;
  }, [groupedCutoffs, selectedCutoffId]);

  // Apply a Single Saved Summary to Invoice Line Items
  const handleApplySummary = (
    summary: SavedSummary,
    customShift: string = shiftTime,
    customTl: string = tlName,
    hours: number = shiftHours,
    mode: "replace" | "append" = "replace"
  ) => {
    const { bonusLabel, rate } = calculateShiftBonusAndRate(summary.total_revenue || 0);
    const description = formatShiftItemDescription(bonusLabel, customShift, customTl);

    const newItem: InvoiceItem = {
      id: `item-${Date.now()}`,
      description,
      quantity: hours,
      rate,
    };

    if (mode === "replace") {
      setItems([newItem]);
    } else {
      setItems((prev) => [...prev, newItem]);
    }

    if (summary.created_at) {
      const d = parseSummaryDate(summary);
      setInvoiceDate(
        d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      );
    }

    setIsSummaryModalOpen(false);
    showToast(
      `Applied ${bonusLabel} at $${rate}/hr (${hours} hrs = ${formatCurrency(hours * rate)})`
    );
  };

  // Apply an entire Cutoff Range to Invoice Line Items (groups identical tiers, separates different sales tiers)
  const handleApplyCutoff = (
    cutoff: GroupedCutoff,
    customShift: string = shiftTime,
    customTl: string = tlName,
    hours: number = shiftHours,
    mode: "replace" | "append" = "replace"
  ) => {
    if (cutoff.summaries.length === 0) {
      showToast(`Cutoff "${cutoff.info.label}" has no saved summaries yet.`);
      return;
    }

    // Group shifts by tier and calculate hours per tier
    const tierMap = new Map<
      number,
      {
        tier: number;
        bonusLabel: string;
        rate: number;
        shiftCount: number;
        hours: number;
      }
    >();

    for (const s of cutoff.summaries) {
      const rev = s.total_revenue || 0;
      const { tier, bonusLabel, rate } = calculateShiftBonusAndRate(rev);
      const existing = tierMap.get(tier) || {
        tier,
        bonusLabel,
        rate,
        shiftCount: 0,
        hours: 0,
      };
      existing.shiftCount += 1;
      existing.hours += hours;
      tierMap.set(tier, existing);
    }

    const sortedTiers = Array.from(tierMap.values()).sort((a, b) => a.tier - b.tier);

    const newItems: InvoiceItem[] = sortedTiers.map((g, idx) => ({
      id: `item-cutoff-${g.tier}-${Date.now()}-${idx}`,
      description: formatShiftItemDescription(g.bonusLabel, customShift, customTl),
      quantity: g.hours,
      rate: g.rate,
    }));

    if (mode === "replace") {
      setItems(newItems);
    } else {
      setItems((prev) => [...prev, ...newItems]);
    }

    // Set invoice date to Cutoff's End Date
    setInvoiceDate(cutoff.info.displayEndDate);

    setIsSummaryModalOpen(false);
    const totalHrs = sortedTiers.reduce((s, g) => s + g.hours, 0);
    const totalPay = sortedTiers.reduce((s, g) => s + g.hours * g.rate, 0);
    showToast(
      `Applied Cutoff (${cutoff.info.label}): ${cutoff.summaries.length} shifts, ${totalHrs} hrs = ${formatCurrency(totalPay)}`
    );
  };

  // Quick 1-click apply active/current cutoff
  const handleQuickFillCurrentCutoff = async () => {
    try {
      const res = await fetch("/api/saved-summaries");
      if (!res.ok) throw new Error("Failed to fetch");
      const data: SavedSummary[] = await res.json();
      setSavedSummariesList(data);
      const cutoffs = groupSummariesByCutoff(data, shiftHours);
      const current = cutoffs.find((c) => c.summaries.length > 0) || cutoffs[0];
      if (current && current.summaries.length > 0) {
        handleApplyCutoff(current, shiftTime, tlName, shiftHours, "replace");
      } else {
        showToast("No saved summaries found in current cutoff. Opening cutoff selector...");
        setIsSummaryModalOpen(true);
        setModalTab("cutoff");
      }
    } catch {
      showToast("Error loading cutoff summaries");
    }
  };

  // Quick apply custom preset tier ($500, $1000, $1500, $2000, No bonuses)
  const handleApplyPreset = (tierRevenue: number, mode: "replace" | "append" = "replace") => {
    const { bonusLabel, rate } = calculateShiftBonusAndRate(tierRevenue);
    const description = formatShiftItemDescription(bonusLabel, shiftTime, tlName);
    const newItem: InvoiceItem = {
      id: `item-${Date.now()}`,
      description,
      quantity: shiftHours,
      rate,
    };

    if (mode === "replace") {
      setItems([newItem]);
    } else {
      setItems((prev) => [...prev, newItem]);
    }

    setIsSummaryModalOpen(false);
    showToast(`Applied ${bonusLabel} at $${rate}/hr for ${shiftHours} hrs`);
  };

  // Auto-apply if URL has ?summaryId= or ?cutoff= or ?cutoffId=
  useEffect(() => {
    if (!summaryIdParam && !cutoffParam && !cutoffIdParam) return;
    const loadParamData = async () => {
      try {
        const res = await fetch("/api/saved-summaries");
        if (!res.ok) return;
        const list: SavedSummary[] = await res.json();
        setSavedSummariesList(list);

        if (summaryIdParam) {
          const target = list.find((s) => String(s.id) === String(summaryIdParam));
          if (target) {
            handleApplySummary(target, "0AM CET - 8AM CET", "TL Lore", 8, "replace");
          }
        } else if (cutoffIdParam) {
          const cutoffs = groupSummariesByCutoff(list, 8);
          const target = cutoffs.find((c) => c.info.id === cutoffIdParam);
          if (target && target.summaries.length > 0) {
            handleApplyCutoff(target, "0AM CET - 8AM CET", "TL Lore", 8, "replace");
          }
        } else if (cutoffParam) {
          const cutoffs = groupSummariesByCutoff(list, 8);
          const target =
            cutoffParam === "current"
              ? cutoffs.find((c) => c.summaries.length > 0) || cutoffs[0]
              : cutoffs.find((c) => c.info.type === cutoffParam && c.summaries.length > 0) || cutoffs[0];
          if (target && target.summaries.length > 0) {
            handleApplyCutoff(target, "0AM CET - 8AM CET", "TL Lore", 8, "replace");
          }
        }
      } catch {
        // Ignore
      }
    };
    loadParamData();
  }, [summaryIdParam, cutoffParam, cutoffIdParam]);

  // Selected summary in modal
  const selectedSummary = useMemo(() => {
    if (!selectedSummaryId) return savedSummariesList[0] ?? null;
    return savedSummariesList.find((s) => s.id === selectedSummaryId) ?? savedSummariesList[0] ?? null;
  }, [selectedSummaryId, savedSummariesList]);

  const activeBonusInfo = useMemo(() => {
    const rev = selectedSummary ? selectedSummary.total_revenue : 0;
    return calculateShiftBonusAndRate(rev);
  }, [selectedSummary]);

  // Calculations
  const subtotal = useMemo(() => {
    return items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.rate) || 0), 0);
  }, [items]);

  const taxAmount = useMemo(() => {
    return subtotal * ((Number(taxRate) || 0) / 100);
  }, [subtotal, taxRate]);

  const total = useMemo(() => {
    const disc = showDiscount ? Number(discountAmount) || 0 : 0;
    const ship = showShipping ? Number(shippingAmount) || 0 : 0;
    return Math.max(0, subtotal + taxAmount + ship - disc);
  }, [subtotal, taxAmount, showDiscount, discountAmount, showShipping, shippingAmount]);

  const balanceDue = useMemo(() => {
    return Math.max(0, total - (Number(amountPaid) || 0));
  }, [total, amountPaid]);

  // Keep the "Amount: $XX.XX" line in Notes in sync if user wishes or keep as template
  useEffect(() => {
    if (notes.includes("Amount:$")) {
      setNotes((prev) => prev.replace(/Amount:\$[0-9,.]+/g, `Amount:$${balanceDue.toFixed(2)}`));
    }
  }, [balanceDue]);

  // Line Item Handlers
  const handleAddItem = () => {
    const newItem: InvoiceItem = {
      id: `item-${Date.now()}`,
      description: "",
      quantity: 1,
      rate: 0,
    };
    setItems((prev) => [...prev, newItem]);
  };

  const handleUpdateItem = (id: string, field: keyof InvoiceItem, value: string | number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        return {
          ...item,
          [field]: field === "description" ? value : Number(value) || 0,
        };
      })
    );
  };

  const handleRemoveItem = (id: string) => {
    if (items.length <= 1) {
      setItems([{ id: `item-${Date.now()}`, description: "", quantity: 1, rate: 0 }]);
      return;
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  // Logo upload
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setLogoUrl(event.target?.result as string);
        showToast("Logo added successfully");
      };
      reader.readAsDataURL(file);
    }
  };

  // Reset to Image 2 sample
  const handleResetToSample = () => {
    setFromDetails(DEFAULT_SENDER);
    setBillTo(DEFAULT_BILL_TO);
    setShipTo("");
    setInvoiceNumber("25");
    setInvoiceDate("Sep 8, 2026");
    setItems(DEFAULT_ITEMS);
    setNotes(DEFAULT_NOTES);
    setTerms("");
    setTaxRate(0);
    setAmountPaid(0);
    setShowDiscount(false);
    setShowShipping(false);
    showToast("Reset to sample invoice data matching preview");
  };

  return (
    <div className="min-h-screen bg-[#120815] text-[#FCE0F0] flex flex-col font-sans selection:bg-[#E31B73]/40 selection:text-[#FFFDE6] print:min-h-0 print:bg-white print:text-black">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[#200d28]/95 border border-[#E31B73] text-[#FFFDE6] shadow-2xl shadow-[#E31B73]/30 backdrop-blur-md animate-slideDown text-xs font-semibold no-print">
          <CheckCircle2 size={16} className="text-[#FF77B9]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ── TOP NAVBAR ───────────────────────────────────────── */}
      <header className="h-16 border-b border-[#FFA4D2]/20 bg-[#19091e]/90 backdrop-blur-md px-4 md:px-6 flex items-center justify-between sticky top-0 z-30 shadow-md no-print">
        {/* Left branding */}
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
                <Receipt size={18} className="text-[#FF77B9]" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-sm tracking-tight text-[#FFFDE6] flex items-center gap-1.5">
                Sales Tracker
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-md bg-[#E31B73]/25 text-[#FF77B9] border border-[#E31B73]/40">
                  Invoice
                </span>
              </span>
              <span className="text-[10px] text-[#FFA4D2]/70 font-medium">
                Professional Invoice Generator
              </span>
            </div>
          </Link>
        </div>

        {/* Right View Switchers & Action Buttons */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Quick Cutoff Auto-Fill (8-23 or 24-7) */}
          <button
            type="button"
            onClick={handleQuickFillCurrentCutoff}
            title="Auto-fill line items from active cutoff period (8-23 or 24-7)"
            className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#E31B73]/25 to-[#FF77B9]/20 hover:from-[#E31B73]/40 hover:to-[#FF77B9]/30 border border-[#FF77B9]/40 text-xs font-semibold text-[#FFFDE6] transition cursor-pointer shadow-sm shadow-[#E31B73]/20"
          >
            <Calendar size={13} className="text-[#FF77B9]" />
            <span>Apply Cutoff (8-23 / 24-7)</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenSummaryModal("cutoff")}
            title="Pick a cutoff period or individual saved summary to auto-fill invoice"
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#250f2c] hover:bg-[#34143d] border border-[#FFA4D2]/20 text-xs font-semibold text-[#FFA4D2] hover:text-[#FFFDE6] transition cursor-pointer"
          >
            <Sparkles size={13} className="text-[#FF77B9]" />
            <span>Cutoffs &amp; Summaries</span>
          </button>

          <button
            type="button"
            onClick={handleResetToSample}
            title="Load sample matching preview"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#250f2c] hover:bg-[#34143d] border border-[#FFA4D2]/20 text-xs font-semibold text-[#FFA4D2] hover:text-[#FFFDE6] transition"
          >
            <RotateCcw size={13} />
            <span>Sample Data</span>
          </button>

          {/* View Mode Toggle */}
          <div className="flex items-center p-1 bg-[#130617] border border-[#FFA4D2]/25 rounded-xl text-xs">
            <button
              type="button"
              onClick={() => setViewMode("editor")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold transition ${
                viewMode === "editor"
                  ? "bg-gradient-to-r from-[#E31B73] to-[#FF77B9] text-[#FFFDE6] shadow-sm"
                  : "text-[#FFA4D2]/70 hover:text-[#FFFDE6]"
              }`}
            >
              <Edit3 size={13} />
              <span className="hidden sm:inline">Editor</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode("preview")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold transition ${
                viewMode === "preview"
                  ? "bg-gradient-to-r from-[#E31B73] to-[#FF77B9] text-[#FFFDE6] shadow-sm"
                  : "text-[#FFA4D2]/70 hover:text-[#FFFDE6]"
              }`}
            >
              <Eye size={13} />
              <span className="hidden sm:inline">Output Preview</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode("split")}
              className={`hidden xl:flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold transition ${
                viewMode === "split"
                  ? "bg-gradient-to-r from-[#E31B73] to-[#FF77B9] text-[#FFFDE6] shadow-sm"
                  : "text-[#FFA4D2]/70 hover:text-[#FFFDE6]"
              }`}
            >
              <Columns size={13} />
              <span>Split</span>
            </button>
          </div>

          {/* Print / Export Button */}
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#E31B73] to-[#FF77B9] hover:from-[#c91564] hover:to-[#ff5ea9] text-[#FFFDE6] text-xs font-bold shadow-lg shadow-[#E31B73]/25 transition cursor-pointer"
          >
            <Printer size={14} />
            <span>Print / PDF</span>
          </button>
        </div>
      </header>

      {/* ── APP BODY: SIDEBAR + MAIN WORKSPACE ───────────────── */}
      <div className="flex-1 flex overflow-hidden print:overflow-visible print:block">
        {/* ── LEFT SIDEBAR ─────────────────────────────────── */}
        <aside
          className={`bg-[#180a1c] border-r border-[#FFA4D2]/20 transition-all duration-300 flex flex-col shrink-0 z-20 no-print ${
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
                {isSidebarOpen && (
                  <span className="truncate">Saved Summaries</span>
                )}
              </div>
            </Link>

            {/* Invoice Generator Link (Active on this page) */}
            <Link
              href="/invoice"
              title="Invoice Generator"
              className={`w-full flex items-center ${
                isSidebarOpen ? "justify-between px-3.5" : "justify-center px-2"
              } py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-[#E31B73]/30 via-[#FF77B9]/20 to-[#E31B73]/20 text-[#FFFDE6] border border-[#E31B73]/50 shadow-md shadow-[#E31B73]/15 transition group`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Receipt
                  size={18}
                  className="text-[#FF77B9] group-hover:scale-110 transition-transform shrink-0"
                />
                {isSidebarOpen && (
                  <span className="truncate">Invoice Generator</span>
                )}
              </div>
            </Link>
          </div>
        </aside>

        {/* ── MAIN CONTENT WORKSPACE ───────────────────────── */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 flex justify-center bg-[#120815] print:p-0 print:m-0 print:bg-white print:overflow-visible print:block">
          <div
            className={`w-full max-w-7xl flex gap-8 print:block print:w-full print:max-w-none ${
              viewMode === "split" ? "grid grid-cols-1 xl:grid-cols-2" : "justify-center"
            }`}
          >
            {/* ═══════════════════════════════════════════════════
                IMAGE 1: INPUT FORM (EDITOR VIEW)
                ═══════════════════════════════════════════════════ */}
            <div
              className={`w-full max-w-3xl bg-white text-[#111827] rounded-xl shadow-2xl p-6 md:p-10 border border-gray-200 no-print print:hidden flex-col gap-6 ${
                viewMode === "preview" ? "hidden" : "flex"
              }`}
            >
                
                {/* Top Row: Logo & Sender (Left), INVOICE Title & Meta (Right) */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-start">
                  
                  {/* Left Column: Logo + "Who is this from?" */}
                  <div className="sm:col-span-7 flex flex-col gap-4">
                    {/* Add Logo Box */}
                    <div className="relative">
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                      {logoUrl ? (
                        <div className="relative w-48 h-28 rounded-lg border border-gray-300 overflow-hidden group bg-gray-50 flex items-center justify-center p-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={logoUrl}
                            alt="Uploaded invoice logo"
                            className="max-h-full max-w-full object-contain"
                          />
                          <button
                            type="button"
                            onClick={() => setLogoUrl(null)}
                            className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-black text-white rounded-full opacity-0 group-hover:opacity-100 transition"
                            title="Remove logo"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-48 h-28 border border-gray-300 hover:border-gray-400 rounded-lg flex items-center justify-center text-gray-500 text-sm font-medium hover:bg-gray-50 transition cursor-pointer"
                        >
                          <div className="flex items-center gap-1.5">
                            <Plus size={16} />
                            <span>Add Your Logo</span>
                          </div>
                        </button>
                      )}
                    </div>

                    {/* "Who is this from?" Textarea */}
                    <div>
                      <textarea
                        rows={4}
                        value={fromDetails}
                        onChange={(e) => setFromDetails(e.target.value)}
                        placeholder="Who is this from?"
                        className="w-full border border-gray-300 rounded-lg p-3 text-xs leading-relaxed text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-y"
                      />
                    </div>
                  </div>

                  {/* Right Column: "INVOICE", "#", and Date/Terms/Due/PO table */}
                  <div className="sm:col-span-5 flex flex-col items-end gap-3">
                    <h1 className="text-3xl md:text-4xl font-black text-[#111827] tracking-tight">
                      INVOICE
                    </h1>

                    {/* Invoice Number input */}
                    <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden w-40 bg-white focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
                      <span className="px-2.5 text-xs font-semibold text-gray-500 bg-gray-50 border-r border-gray-300">
                        #
                      </span>
                      <input
                        type="text"
                        value={invoiceNumber}
                        onChange={(e) => setInvoiceNumber(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs text-right font-medium text-gray-800 focus:outline-none"
                      />
                    </div>

                    {/* Meta stack: Date, Payment Terms, Due Date, PO Number */}
                    <div className="w-full flex flex-col gap-2 pt-2">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-xs text-gray-600 font-medium whitespace-nowrap">
                          Date
                        </label>
                        <input
                          type="text"
                          value={invoiceDate}
                          onChange={(e) => setInvoiceDate(e.target.value)}
                          placeholder="Date"
                          className="w-36 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-right text-gray-800 focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <label className="text-xs text-gray-600 font-medium whitespace-nowrap">
                          Payment Terms
                        </label>
                        <input
                          type="text"
                          value={paymentTerms}
                          onChange={(e) => setPaymentTerms(e.target.value)}
                          placeholder=""
                          className="w-36 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-right text-gray-800 focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <label className="text-xs text-gray-600 font-medium whitespace-nowrap">
                          Due Date
                        </label>
                        <input
                          type="text"
                          value={dueDate}
                          onChange={(e) => setDueDate(e.target.value)}
                          placeholder=""
                          className="w-36 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-right text-gray-800 focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <label className="text-xs text-gray-600 font-medium whitespace-nowrap">
                          PO Number
                        </label>
                        <input
                          type="text"
                          value={poNumber}
                          onChange={(e) => setPoNumber(e.target.value)}
                          placeholder=""
                          className="w-36 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-right text-gray-800 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Second Row: Bill To & Ship To */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-gray-700">Bill To</label>
                    <textarea
                      rows={4}
                      value={billTo}
                      onChange={(e) => setBillTo(e.target.value)}
                      placeholder="Who is this to?"
                      className="w-full border border-gray-300 rounded-lg p-3 text-xs leading-relaxed text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-y"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-gray-700">Ship To</label>
                    <textarea
                      rows={4}
                      value={shipTo}
                      onChange={(e) => setShipTo(e.target.value)}
                      placeholder="(optional)"
                      className="w-full border border-gray-300 rounded-lg p-3 text-xs leading-relaxed text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-y"
                    />
                  </div>
                </div>

                {/* Line Items Table (Matches Image 1) */}
                <div className="flex flex-col gap-2 pt-2">
                  <div className="rounded-lg overflow-hidden border border-gray-300">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-[#111827] text-white text-xs font-semibold">
                          <th className="py-2.5 px-3 font-semibold">Item</th>
                          <th className="py-2.5 px-3 text-center w-20 font-semibold">Quantity</th>
                          <th className="py-2.5 px-3 text-right w-28 font-semibold">Rate</th>
                          <th className="py-2.5 px-3 text-right w-24 font-semibold">Amount</th>
                          <th className="w-8 py-2.5 pr-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {items.map((item) => {
                          const itemAmount = (Number(item.quantity) || 0) * (Number(item.rate) || 0);
                          return (
                            <tr key={item.id} className="group">
                              {/* Item Description */}
                              <td className="p-2">
                                <textarea
                                  rows={2}
                                  value={item.description}
                                  onChange={(e) => handleUpdateItem(item.id, "description", e.target.value)}
                                  placeholder="Description of item/service..."
                                  className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-500 resize-y leading-snug"
                                />
                              </td>

                              {/* Quantity */}
                              <td className="p-2">
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={item.quantity}
                                  onChange={(e) => handleUpdateItem(item.id, "quantity", e.target.value)}
                                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs text-center text-gray-800 focus:outline-none focus:border-blue-500"
                                />
                              </td>

                              {/* Rate */}
                              <td className="p-2">
                                <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:border-blue-500">
                                  <span className="px-2 text-xs text-gray-500 bg-gray-50 border-r border-gray-200">
                                    $
                                  </span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={item.rate}
                                    onChange={(e) => handleUpdateItem(item.id, "rate", e.target.value)}
                                    className="w-full px-2 py-1.5 text-xs text-right text-gray-800 focus:outline-none"
                                  />
                                </div>
                              </td>

                              {/* Amount */}
                              <td className="p-2 text-right font-medium text-gray-800 whitespace-nowrap">
                                {formatCurrency(itemAmount)}
                              </td>

                              {/* Delete Button */}
                              <td className="p-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItem(item.id)}
                                  className="text-gray-300 hover:text-red-500 transition p-1"
                                  title="Delete row"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* "+ Line Item" Button */}
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="w-full py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold transition flex items-center justify-center gap-1.5 border border-gray-200"
                  >
                    <Plus size={14} />
                    <span>Line Item</span>
                  </button>
                </div>

                {/* Bottom Section: Notes/Terms (Left) and Subtotal/Tax/Total (Right) */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-8 pt-4">
                  {/* Left Column: Notes & Terms */}
                  <div className="sm:col-span-6 flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-gray-700">Notes</label>
                      <textarea
                        rows={6}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Notes - any relevant information not already covered"
                        className="w-full border border-gray-300 rounded-lg p-2.5 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-500 resize-y font-mono leading-relaxed"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-gray-700">Terms</label>
                      <textarea
                        rows={3}
                        value={terms}
                        onChange={(e) => setTerms(e.target.value)}
                        placeholder="Terms and conditions - late fees, payment methods, delivery schedule"
                        className="w-full border border-gray-300 rounded-lg p-2.5 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-500 resize-y"
                      />
                    </div>
                  </div>

                  {/* Right Column: Subtotal, Tax, Discount, Shipping, Total, Balance Due */}
                  <div className="sm:col-span-6 flex flex-col gap-2.5">
                    {/* Subtotal */}
                    <div className="flex items-center justify-between text-xs py-1">
                      <span className="text-gray-600 font-medium">Subtotal</span>
                      <span className="font-semibold text-gray-800">{formatCurrency(subtotal)}</span>
                    </div>

                    {/* Tax */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-600 font-medium">Tax</span>
                      <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden w-32 bg-white">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={taxRate}
                          onChange={(e) => setTaxRate(Number(e.target.value) || 0)}
                          className="w-full px-2 py-1 text-xs text-right text-gray-800 focus:outline-none"
                        />
                        <span className="px-2 text-xs text-gray-500 bg-gray-50 border-l border-gray-200">
                          %
                        </span>
                      </div>
                    </div>

                    {/* Discount & Shipping link triggers */}
                    <div className="flex items-center gap-3 text-xs pt-1">
                      {!showDiscount ? (
                        <button
                          type="button"
                          onClick={() => setShowDiscount(true)}
                          className="text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1"
                        >
                          + Discount
                        </button>
                      ) : (
                        <div className="flex items-center justify-between w-full">
                          <span className="text-gray-600">Discount</span>
                          <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden w-32">
                            <span className="px-2 text-xs text-gray-500 bg-gray-50">$</span>
                            <input
                              type="number"
                              min="0"
                              value={discountAmount}
                              onChange={(e) => setDiscountAmount(Number(e.target.value) || 0)}
                              className="w-full px-2 py-1 text-xs text-right text-gray-800 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setShowDiscount(false);
                                setDiscountAmount(0);
                              }}
                              className="px-1 text-gray-400 hover:text-red-500"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        </div>
                      )}

                      {!showShipping ? (
                        <button
                          type="button"
                          onClick={() => setShowShipping(true)}
                          className="text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1"
                        >
                          + Shipping
                        </button>
                      ) : (
                        <div className="flex items-center justify-between w-full">
                          <span className="text-gray-600">Shipping</span>
                          <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden w-32">
                            <span className="px-2 text-xs text-gray-500 bg-gray-50">$</span>
                            <input
                              type="number"
                              min="0"
                              value={shippingAmount}
                              onChange={(e) => setShippingAmount(Number(e.target.value) || 0)}
                              className="w-full px-2 py-1 text-xs text-right text-gray-800 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setShowShipping(false);
                                setShippingAmount(0);
                              }}
                              className="px-1 text-gray-400 hover:text-red-500"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <hr className="my-1 border-gray-200" />

                    {/* Total */}
                    <div className="flex items-center justify-between text-xs py-1">
                      <span className="text-gray-900 font-bold">Total</span>
                      <span className="font-bold text-gray-900 text-sm">{formatCurrency(total)}</span>
                    </div>

                    {/* Amount Paid */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-600 font-medium">Amount Paid</span>
                      <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden w-32 bg-white">
                        <span className="px-2 text-xs text-gray-500 bg-gray-50 border-r border-gray-200">
                          $
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={amountPaid}
                          onChange={(e) => setAmountPaid(Number(e.target.value) || 0)}
                          className="w-full px-2 py-1 text-xs text-right text-gray-800 focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Balance Due */}
                    <div className="flex items-center justify-between text-sm pt-2">
                      <span className="font-black text-gray-900">Balance Due</span>
                      <span className="font-black text-gray-900 text-base">
                        {formatCurrency(balanceDue)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

            {/* ═══════════════════════════════════════════════════
                IMAGE 2: OUTPUT / CLEAN PREVIEW / PRINTABLE SHEET
                ═══════════════════════════════════════════════════ */}
            <div
              id="invoice-print-area"
              className={`invoice-printable-sheet w-full max-w-[8.5in] min-h-[11in] bg-white text-[#111827] rounded-md shadow-2xl p-10 sm:p-14 border border-gray-200 flex-col justify-between font-sans leading-relaxed ${
                viewMode === "editor" ? "hidden print:flex" : "flex"
              }`}
            >
              <div className="flex flex-col">
                {/* Top Section: Sender (Left) & INVOICE Title (Right) */}
                <div className="flex items-start justify-between gap-8">
                  {/* Sender Details */}
                  <div className="flex flex-col text-[13px] leading-[1.4] max-w-xs">
                    {logoUrl && (
                      <div className="mb-3 max-w-[150px] max-h-[70px]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={logoUrl}
                          alt="Company Logo"
                          className="max-h-full object-contain"
                        />
                      </div>
                    )}
                    <span className="font-semibold text-gray-900 block text-[13px]">
                      {fromDetails.split("\n")[0]}
                    </span>
                    <span className="text-gray-600 whitespace-pre-line block text-[13px]">
                      {fromDetails.split("\n").slice(1).join("\n")}
                    </span>
                  </div>

                  {/* INVOICE Title & # */}
                  <div className="flex flex-col items-end">
                    <h2 className="text-[38px] sm:text-[42px] font-light tracking-[0.08em] text-gray-800 leading-none">
                      INVOICE
                    </h2>
                    <span className="text-sm text-gray-500 mt-2 font-normal">
                      # {invoiceNumber}
                    </span>
                  </div>
                </div>

                {/* Sub-Header: Date & Balance Due on Right, Bill To on Left */}
                <div className="mt-8 flex flex-col sm:flex-row sm:justify-between items-start gap-4">
                  {/* Left: Bill To */}
                  <div className="flex flex-col text-[13px] leading-[1.4]">
                    <span className="text-gray-500 font-normal mb-1">Bill To:</span>
                    <span className="font-semibold text-gray-900 block text-[13px]">
                      {billTo.split("\n")[0]}
                    </span>
                    <span className="text-gray-600 whitespace-pre-line block text-[13px]">
                      {billTo.split("\n").slice(1).join("\n")}
                    </span>
                  </div>

                  {/* Right: Date and Balance Due Banner */}
                  <div className="w-full sm:w-[320px] flex flex-col gap-1.5 self-end sm:self-auto">
                    <div className="flex justify-between items-center text-[13px] px-4">
                      <span className="text-gray-500 font-normal">Date:</span>
                      <span className="text-gray-800 font-normal text-right">{invoiceDate}</span>
                    </div>

                    <div className="invoice-balance-banner bg-[#f2f4f7] rounded-[3px] py-2 px-4 flex items-center justify-between text-[13px]">
                      <span className="font-bold text-gray-800">Balance Due:</span>
                      <span className="font-bold text-gray-900 text-sm">
                        {formatCurrency(balanceDue)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Line Items Table */}
                <div className="mt-8">
                  <table className="w-full text-left text-[12.5px] border-collapse">
                    <thead>
                      <tr className="invoice-table-header bg-[#374151] text-white text-[12px]">
                        <th className="py-2.5 px-3.5 font-medium rounded-l-[4px]">Item</th>
                        <th className="py-2.5 px-3 text-center w-20 font-medium">Quantity</th>
                        <th className="py-2.5 px-3 text-right w-24 font-medium">Rate</th>
                        <th className="py-2.5 px-3.5 text-right w-24 font-medium rounded-r-[4px]">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="text-[12.5px]">
                      {items.map((item) => {
                        const itemAmount = (Number(item.quantity) || 0) * (Number(item.rate) || 0);
                        return (
                          <tr key={item.id}>
                            <td className="py-1.5 px-3.5 font-bold text-gray-900 leading-[1.25] whitespace-pre-line">
                              {item.description}
                            </td>
                            <td className="py-1.5 px-3 text-center text-gray-700 font-normal align-top leading-[1.25]">
                              {item.quantity}
                            </td>
                            <td className="py-1.5 px-3 text-right text-gray-700 font-normal align-top leading-[1.25]">
                              {formatCurrency(item.rate)}
                            </td>
                            <td className="py-1.5 px-3.5 text-right text-gray-900 font-normal align-top leading-[1.25]">
                              {formatCurrency(itemAmount)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Subtotal, Tax, Total Block on Right */}
                <div className="flex justify-end mt-7 text-[12.5px]">
                  <div className="w-56 flex flex-col gap-2 text-[12.5px]">
                    <div className="flex justify-between text-gray-500">
                      <span>Subtotal:</span>
                      <span className="text-gray-900 font-normal">{formatCurrency(subtotal)}</span>
                    </div>

                    <div className="flex justify-between text-gray-500">
                      <span>Tax ({taxRate}%):</span>
                      <span className="text-gray-900 font-normal">{formatCurrency(taxAmount)}</span>
                    </div>

                    {showDiscount && discountAmount > 0 && (
                      <div className="flex justify-between text-emerald-600">
                        <span>Discount:</span>
                        <span>-{formatCurrency(discountAmount)}</span>
                      </div>
                    )}

                    {showShipping && shippingAmount > 0 && (
                      <div className="flex justify-between text-gray-500">
                        <span>Shipping:</span>
                        <span>+{formatCurrency(shippingAmount)}</span>
                      </div>
                    )}

                    <div className="flex justify-between text-gray-500">
                      <span>Total:</span>
                      <span className="text-gray-900 font-normal">{formatCurrency(total)}</span>
                    </div>
                  </div>
                </div>

                {/* Notes Section (Matches PDF exactly) */}
                <div className="mt-8 text-[12.5px] text-gray-700">
                  <div className="text-gray-500 font-normal mb-1">
                    Notes:
                  </div>
                  <div className="whitespace-pre-line leading-[1.65] font-normal text-gray-700 font-sans">
                    {notes.replace(/^Notes:\s*/i, "")}
                  </div>
                  {terms && (
                    <div className="mt-4 pt-3 border-t border-gray-200 whitespace-pre-line leading-relaxed text-gray-600">
                      <strong className="text-gray-800 font-medium">Terms:</strong>
                      <br />
                      {terms}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* ═══════════════════════════════════════════════════
          SAVED SUMMARY & CUTOFF AUTO-FILL MODAL
          ═══════════════════════════════════════════════════ */}
      {isSummaryModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md no-print p-4 overflow-y-auto"
          onClick={() => setIsSummaryModalOpen(false)}
        >
          <div
            className="w-full max-w-2xl bg-[#1c0b20] border border-[#FFA4D2]/25 rounded-2xl shadow-2xl overflow-hidden my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#FFA4D2]/15 bg-[#200e26]">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-tr from-[#E31B73] to-[#FF77B9] p-[1px] flex items-center justify-center">
                  <div className="h-full w-full bg-[#18081d] rounded-[7px] flex items-center justify-center">
                    <Sparkles size={14} className="text-[#FF77B9]" />
                  </div>
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#FFFDE6]">Auto-Fill from Cutoff Periods &amp; Summaries</h3>
                  <p className="text-[10px] text-[#FFA4D2]/70">Auto-groups shifts by cutoff dates (8-23 &amp; 24-7) and separates distinct sales bonus tiers</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSummaryModalOpen(false)}
                className="p-1 rounded-lg hover:bg-[#FFA4D2]/15 text-[#FFA4D2] hover:text-[#FFFDE6] transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Tab Navigation */}
            <div className="flex items-center gap-1 px-5 pt-3 border-b border-[#FFA4D2]/15 bg-[#18081c]">
              <button
                type="button"
                onClick={() => setModalTab("cutoff")}
                className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-t-xl transition border-b-2 cursor-pointer ${
                  modalTab === "cutoff"
                    ? "border-[#FF77B9] text-[#FFFDE6] bg-[#220d29]"
                    : "border-transparent text-[#FFA4D2]/60 hover:text-[#FFA4D2] hover:bg-[#200b26]"
                }`}
              >
                <Calendar size={13} className={modalTab === "cutoff" ? "text-[#FF77B9]" : "text-[#FFA4D2]/50"} />
                <span>Cutoff Periods (8-23 &amp; 24-7)</span>
                {savedSummariesList.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-[#E31B73]/25 text-[#FF77B9] text-[9px] font-mono">
                    {savedSummariesList.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setModalTab("single")}
                className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-t-xl transition border-b-2 cursor-pointer ${
                  modalTab === "single"
                    ? "border-[#FF77B9] text-[#FFFDE6] bg-[#220d29]"
                    : "border-transparent text-[#FFA4D2]/60 hover:text-[#FFA4D2] hover:bg-[#200b26]"
                }`}
              >
                <FolderClock size={13} className={modalTab === "single" ? "text-[#FF77B9]" : "text-[#FFA4D2]/50"} />
                <span>Single Summary</span>
              </button>

              <button
                type="button"
                onClick={() => setModalTab("presets")}
                className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-t-xl transition border-b-2 cursor-pointer ${
                  modalTab === "presets"
                    ? "border-[#FF77B9] text-[#FFFDE6] bg-[#220d29]"
                    : "border-transparent text-[#FFA4D2]/60 hover:text-[#FFA4D2] hover:bg-[#200b26]"
                }`}
              >
                <Zap size={13} className={modalTab === "presets" ? "text-[#FF77B9]" : "text-[#FFA4D2]/50"} />
                <span>Quick Presets</span>
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
              {/* Shift Config Header */}
              <div className="p-3.5 rounded-xl bg-[#140918] border border-[#FFA4D2]/15 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#FFFDE6] flex items-center gap-1.5">
                    <Clock size={12} className="text-[#FF77B9]" />
                    <span>Shift &amp; Team Leader Settings</span>
                  </span>
                  <span className="text-[10px] text-[#FFA4D2]/60">Applied to each line item description</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[#FFA4D2]/70">Shift Time</label>
                    <input
                      type="text"
                      value={shiftTime}
                      onChange={(e) => setShiftTime(e.target.value)}
                      placeholder="0AM CET - 8AM CET"
                      className="bg-[#1c0b20] border border-[#FFA4D2]/25 rounded-lg px-2.5 py-1.5 text-xs text-[#FFFDE6] focus:outline-none focus:border-[#FF77B9]"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[#FFA4D2]/70">TL Name</label>
                    <input
                      type="text"
                      value={tlName}
                      onChange={(e) => setTlName(e.target.value)}
                      placeholder="TL Lore"
                      className="bg-[#1c0b20] border border-[#FFA4D2]/25 rounded-lg px-2.5 py-1.5 text-xs text-[#FFFDE6] focus:outline-none focus:border-[#FF77B9]"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[#FFA4D2]/70">Hours / Shift</label>
                    <input
                      type="number"
                      min="1"
                      value={shiftHours}
                      onChange={(e) => setShiftHours(Number(e.target.value) || 8)}
                      className="bg-[#1c0b20] border border-[#FFA4D2]/25 rounded-lg px-2.5 py-1.5 text-xs text-[#FFFDE6] focus:outline-none focus:border-[#FF77B9]"
                    />
                  </div>
                </div>
              </div>

              {/* ── TAB 1: CUTOFF PERIODS (8-23 & 24-7) ── */}
              {modalTab === "cutoff" && (
                <div className="flex flex-col gap-4">
                  {isLoadingSummaries ? (
                    <div className="text-center text-xs text-[#FFA4D2]/60 py-8">Loading cutoff periods...</div>
                  ) : groupedCutoffs.length === 0 ? (
                    <div className="text-center text-xs text-[#FFA4D2]/50 py-8">No cutoff periods found.</div>
                  ) : (
                    <>
                      {/* Cutoff Selector Cards */}
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#FFA4D2]/70">
                          Select Cutoff Period ({groupedCutoffs.length} detected)
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1">
                          {groupedCutoffs.map((cg) => {
                            const isSelected = selectedCutoff?.info.id === cg.info.id;
                            return (
                              <button
                                key={cg.info.id}
                                type="button"
                                onClick={() => setSelectedCutoffId(cg.info.id)}
                                className={`flex flex-col gap-1 p-3 rounded-xl border text-left transition cursor-pointer ${
                                  isSelected
                                    ? "bg-[#2d1035] border-[#E31B73] shadow-md shadow-[#E31B73]/20"
                                    : "bg-[#18081c] border-[#FFA4D2]/15 hover:border-[#FFA4D2]/35 hover:bg-[#200b26]"
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-xs text-[#FFFDE6] flex items-center gap-1.5">
                                    <Calendar size={12} className={cg.info.type === "8-23" ? "text-[#FF77B9]" : "text-[#FFA4D2]"} />
                                    {cg.info.label}
                                  </span>
                                  <span
                                    className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold ${
                                      cg.info.type === "8-23"
                                        ? "bg-[#E31B73]/25 text-[#FF77B9]"
                                        : "bg-[#FFA4D2]/20 text-[#FFFDE6]"
                                    }`}
                                  >
                                    Cutoff: {cg.info.type}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-[10px] text-[#FFA4D2]/70">
                                  <span>
                                    {cg.summaries.length} {cg.summaries.length === 1 ? "shift" : "shifts"} ({cg.summaries.length * shiftHours} hrs)
                                  </span>
                                  <span className="font-mono font-bold text-[#FF77B9]">
                                    {formatCurrency(cg.totalRevenue)}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Selected Cutoff Breakdown & Generated Items */}
                      {selectedCutoff && (
                        <div className="flex flex-col gap-3 p-4 rounded-xl bg-[#160819] border border-[#FFA4D2]/20">
                          <div className="flex items-center justify-between border-b border-[#FFA4D2]/15 pb-2.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-extrabold text-[#FFFDE6]">
                                Invoice Items for {selectedCutoff.info.label}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-[#E31B73]/20 text-[#FF77B9] text-[10px] font-bold">
                                {selectedCutoff.summaries.length} shifts
                              </span>
                            </div>
                            <div className="text-[11px] font-mono font-bold text-[#FF77B9]">
                              {selectedCutoff.tierBreakdown.length} line {selectedCutoff.tierBreakdown.length === 1 ? "item" : "items"}
                            </div>
                          </div>

                          {selectedCutoff.summaries.length === 0 ? (
                            <div className="text-center py-4 text-xs text-[#FFA4D2]/50">
                              No saved summaries in this cutoff period yet. Save shift exports on the Dashboard to auto-fill here.
                            </div>
                          ) : (
                            <>
                              {/* Line Items Table Preview */}
                              <div className="flex flex-col gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-[#FFA4D2]/60">
                                  Generated Line Items (Grouped by Sales Tier)
                                </span>
                                <div className="flex flex-col gap-1.5 max-h-[180px] overflow-y-auto">
                                  {selectedCutoff.tierBreakdown.map((tb, idx) => {
                                    const currentHours = tb.shiftCount * shiftHours;
                                    const currentSubtotal = currentHours * tb.rate;
                                    return (
                                      <div
                                        key={idx}
                                        className="flex items-start justify-between p-2.5 rounded-lg bg-[#200e26] border border-[#FFA4D2]/15 text-xs"
                                      >
                                        <div className="flex flex-col gap-1 pr-3">
                                          <span className="font-mono text-[11px] text-[#FFFDE6] whitespace-pre-line leading-tight">
                                            {formatShiftItemDescription(tb.bonusLabel, shiftTime, tlName)}
                                          </span>
                                          <span className="text-[10px] text-[#FFA4D2]/65">
                                            {tb.shiftCount} {tb.shiftCount === 1 ? "shift" : "shifts"} × {shiftHours} hrs ={" "}
                                            <strong className="text-[#FFFDE6] font-mono">{currentHours} hrs</strong>
                                          </span>
                                        </div>
                                        <div className="flex flex-col items-end gap-0.5 shrink-0">
                                          <span className="font-mono font-bold text-[#FF77B9]">
                                            {formatCurrency(currentSubtotal)}
                                          </span>
                                          <span className="text-[10px] text-[#FFA4D2]/60 font-mono">
                                            ${tb.rate}/hr
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Summary Footer & Apply Buttons */}
                              <div className="pt-2 border-t border-[#FFA4D2]/15 flex items-center justify-between text-xs">
                                <span className="text-[#FFA4D2]/70 text-[11px]">
                                  Total Hours:{" "}
                                  <strong className="text-[#FFFDE6] font-mono">
                                    {selectedCutoff.summaries.length * shiftHours} hrs
                                  </strong>{" "}
                                  &middot; Total Sales:{" "}
                                  <strong className="text-[#FF77B9] font-mono">
                                    {formatCurrency(selectedCutoff.totalRevenue)}
                                  </strong>
                                </span>
                                <span className="font-mono font-extrabold text-[#FFFDE6]">
                                  Est. Balance:{" "}
                                  <span className="text-[#FF77B9]">
                                    {formatCurrency(
                                      selectedCutoff.tierBreakdown.reduce(
                                        (s, g) => s + g.shiftCount * shiftHours * g.rate,
                                        0
                                      )
                                    )}
                                  </span>
                                </span>
                              </div>

                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleApplyCutoff(selectedCutoff, shiftTime, tlName, shiftHours, "replace")
                                  }
                                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#E31B73] to-[#FF77B9] text-[#FFFDE6] text-xs font-bold shadow-lg shadow-[#E31B73]/25 transition cursor-pointer hover:shadow-[#E31B73]/40"
                                >
                                  <ArrowRight size={13} />
                                  <span>Replace Invoice Items with this Cutoff</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleApplyCutoff(selectedCutoff, shiftTime, tlName, shiftHours, "append")
                                  }
                                  className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#250f2c] hover:bg-[#34143d] border border-[#FFA4D2]/20 text-xs font-semibold text-[#FFA4D2] hover:text-[#FFFDE6] transition cursor-pointer"
                                >
                                  <Plus size={13} />
                                  <span>Append</span>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── TAB 2: SINGLE SUMMARY ── */}
              {modalTab === "single" && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#FFA4D2]/70">
                      Pick a Saved Summary Snapshot
                    </span>
                    {isLoadingSummaries ? (
                      <div className="text-center text-xs text-[#FFA4D2]/60 py-6">Loading summaries...</div>
                    ) : savedSummariesList.length === 0 ? (
                      <div className="text-center text-xs text-[#FFA4D2]/50 py-6">No saved summaries found.</div>
                    ) : (
                      <div className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto">
                        {savedSummariesList.map((s) => {
                          const info = calculateShiftBonusAndRate(s.total_revenue || 0);
                          const isSelected = selectedSummaryId === s.id;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => setSelectedSummaryId(s.id)}
                              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-xs transition cursor-pointer ${
                                isSelected
                                  ? "bg-[#E31B73]/15 border-[#E31B73]/50 text-[#FFFDE6]"
                                  : "bg-[#200e26] border-[#FFA4D2]/15 text-[#FFA4D2] hover:border-[#FFA4D2]/30 hover:bg-[#250f2c]"
                              }`}
                            >
                              <div className="flex flex-col items-start gap-0.5">
                                <span className="font-bold text-[#FFFDE6] truncate max-w-[220px]">{s.export_filename}</span>
                                <span className="text-[10px] text-[#FFA4D2]/60">
                                  {new Date(s.created_at).toLocaleDateString()} &middot; {s.sales_count} sales
                                </span>
                              </div>
                              <div className="flex flex-col items-end gap-0.5">
                                <span className="font-mono font-bold text-[#FF77B9]">{formatCurrency(s.total_revenue)}</span>
                                <span className="text-[10px] text-[#FFA4D2]/60">{info.bonusLabel} &middot; ${info.rate}/hr</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {selectedSummary && (
                    <div className="p-3.5 rounded-xl bg-[#140918] border border-[#FFA4D2]/15">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-[#FFFDE6]">Line Item Preview</span>
                        <span className="text-[10px] font-mono text-[#FF77B9]">
                          {activeBonusInfo.bonusLabel} → ${activeBonusInfo.rate}/hr × {shiftHours}hrs = {formatCurrency(activeBonusInfo.rate * shiftHours)}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#FFA4D2]/80 whitespace-pre-line leading-snug mb-3 font-mono bg-[#1c0b20] rounded-lg p-2.5 border border-[#FFA4D2]/10">
                        {formatShiftItemDescription(activeBonusInfo.bonusLabel, shiftTime, tlName)}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleApplySummary(selectedSummary, shiftTime, tlName, shiftHours, "replace")}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-[#E31B73] to-[#FF77B9] text-[#FFFDE6] text-xs font-bold shadow-lg shadow-[#E31B73]/25 transition cursor-pointer hover:shadow-[#E31B73]/40"
                        >
                          <ArrowRight size={13} />
                          <span>Replace Items</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApplySummary(selectedSummary, shiftTime, tlName, shiftHours, "append")}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#250f2c] hover:bg-[#34143d] border border-[#FFA4D2]/20 text-xs font-semibold text-[#FFA4D2] hover:text-[#FFFDE6] transition cursor-pointer"
                        >
                          <Plus size={13} />
                          <span>Append</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB 3: QUICK PRESETS ── */}
              {modalTab === "presets" && (
                <div className="flex flex-col gap-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#FFA4D2]/70">
                    Quick Preset by Sales Tier
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {[0, 500, 1000, 1500, 2000].map((tierRev) => {
                      const info = calculateShiftBonusAndRate(tierRev);
                      return (
                        <div
                          key={tierRev}
                          className="flex items-center justify-between p-3 rounded-xl bg-[#200e26] border border-[#FFA4D2]/15 hover:border-[#E31B73]/40 transition"
                        >
                          <div className="flex flex-col gap-0.5">
                            <span className="font-bold text-xs text-[#FFFDE6]">
                              {tierRev === 0 ? "No bonuses (<$500)" : `$${tierRev.toLocaleString()} Sales Tier`}
                            </span>
                            <span className="text-[10px] text-[#FFA4D2]/70 font-mono">
                              Rate: ${info.rate}/hr &middot; {shiftHours} hrs = {formatCurrency(info.rate * shiftHours)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleApplyPreset(tierRev, "replace")}
                              className="px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-[#E31B73] to-[#FF77B9] text-[#FFFDE6] text-[11px] font-bold cursor-pointer hover:shadow-sm"
                            >
                              Apply
                            </button>
                            <button
                              type="button"
                              onClick={() => handleApplyPreset(tierRev, "append")}
                              className="px-2 py-1.5 rounded-lg bg-[#250f2c] border border-[#FFA4D2]/20 text-[#FFA4D2] hover:text-[#FFFDE6] text-[11px] font-semibold cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InvoiceGeneratorPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#120815] flex items-center justify-center text-[#FFA4D2]">Loading invoice...</div>}>
      <InvoiceGeneratorContent />
    </Suspense>
  );
}
