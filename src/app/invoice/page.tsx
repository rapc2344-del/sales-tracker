"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
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
} from "lucide-react";
import type { Sale } from "@/lib/types";

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
    description: "WE Social Media Management (No bonuses) 0AM CET - 8AM CET TL Lore",
    quantity: 16,
    rate: 1.75,
  },
  {
    id: "item-2",
    description: "WE Social Media Management ($1,500 sales bonus) 0AM CET - 8AM CET TL Lore",
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

export default function InvoiceGeneratorPage() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState<"editor" | "preview" | "split">("editor");

  // Invoice Form State (Image 1 cells & inputs)
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

  // Populate from Today's Sales
  const handleLoadSalesData = async () => {
    try {
      const res = await fetch("/api/sales");
      if (!res.ok) throw new Error("Failed to fetch sales");
      const sales: Sale[] = await res.json();

      if (!sales || sales.length === 0) {
        showToast("No sales records found for today. Add sales first or use sample data.");
        return;
      }

      // Group sales by model & sale type to create meaningful line items
      const groups: Record<string, { count: number; totalAmount: number; model: string; saleType: string }> = {};
      sales.forEach((s) => {
        const key = `${s.model || "General"} - ${s.sale_type || "Sale"}`;
        if (!groups[key]) {
          groups[key] = { count: 0, totalAmount: 0, model: s.model || "General", saleType: s.sale_type || "Sale" };
        }
        groups[key].count += 1;
        groups[key].totalAmount += Number(s.amount || 0);
      });

      const newItems: InvoiceItem[] = Object.entries(groups).map(([key, data], idx) => {
        const avgRate = data.count > 0 ? Number((data.totalAmount / data.count).toFixed(2)) : data.totalAmount;
        return {
          id: `item-sale-${idx}`,
          description: `Social Media Services (${data.model} - ${data.saleType})`,
          quantity: data.count,
          rate: avgRate,
        };
      });

      setItems(newItems);
      showToast(`Loaded ${sales.length} sales into ${newItems.length} invoice line items!`);
    } catch {
      showToast("Error loading sales data from database");
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
    <div className="min-h-screen bg-[#120815] text-[#FCE0F0] flex flex-col font-sans selection:bg-[#E31B73]/40 selection:text-[#FFFDE6]">
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
          {/* Data Import Tools */}
          <button
            type="button"
            onClick={handleLoadSalesData}
            title="Auto-fill line items with today's logged sales"
            className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#250f2c] hover:bg-[#34143d] border border-[#FFA4D2]/20 text-xs font-semibold text-[#FFA4D2] hover:text-[#FFFDE6] transition"
          >
            <Sparkles size={13} className="text-[#FF77B9]" />
            <span>Load Today&apos;s Sales</span>
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
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#E31B73] to-[#FF77B9] hover:from-[#c91564] hover:to-[#ff5ea9] text-[#FFFDE6] text-xs font-bold shadow-lg shadow-[#E31B73]/25 transition"
          >
            <Printer size={14} />
            <span>Print / PDF</span>
          </button>
        </div>
      </header>

      {/* ── APP BODY: SIDEBAR + MAIN WORKSPACE ───────────────── */}
      <div className="flex-1 flex overflow-hidden">
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
        <main className="flex-1 overflow-y-auto p-4 md:p-8 flex justify-center bg-[#120815]">
          <div
            className={`w-full max-w-7xl flex gap-8 ${
              viewMode === "split" ? "grid grid-cols-1 xl:grid-cols-2" : "justify-center"
            }`}
          >
            {/* ═══════════════════════════════════════════════════
                IMAGE 1: INPUT FORM (EDITOR VIEW)
                ═══════════════════════════════════════════════════ */}
            {(viewMode === "editor" || viewMode === "split") && (
              <div className="w-full max-w-3xl bg-white text-[#111827] rounded-xl shadow-2xl p-6 md:p-10 border border-gray-200 no-print flex flex-col gap-6">
                
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
                                <input
                                  type="text"
                                  value={item.description}
                                  onChange={(e) => handleUpdateItem(item.id, "description", e.target.value)}
                                  placeholder="Description of item/service..."
                                  className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-500"
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
            )}

            {/* ═══════════════════════════════════════════════════
                IMAGE 2: OUTPUT / CLEAN PREVIEW / PRINTABLE SHEET
                ═══════════════════════════════════════════════════ */}
            {/* ═══════════════════════════════════════════════════
                EXACT 1:1 OUTPUT DOCUMENT (MATCHES PDF EXACTLY)
                ═══════════════════════════════════════════════════ */}
            {(viewMode === "preview" || viewMode === "split") && (
              <div className="invoice-printable-sheet w-full max-w-[800px] min-h-[1050px] bg-white text-[#111827] rounded-lg shadow-2xl p-10 md:p-14 border border-gray-200 flex flex-col justify-between font-sans leading-relaxed">
                <div className="flex flex-col">
                  {/* Top Section: Sender (Left) & INVOICE Title (Right) */}
                  <div className="flex items-start justify-between gap-8">
                    {/* Sender Details */}
                    <div className="flex flex-col text-xs leading-[1.5] max-w-xs">
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
                      <span className="font-bold text-gray-900 block text-xs">
                        {fromDetails.split("\n")[0]}
                      </span>
                      <span className="text-gray-700 whitespace-pre-line block text-xs">
                        {fromDetails.split("\n").slice(1).join("\n")}
                      </span>
                    </div>

                    {/* INVOICE Title & # */}
                    <div className="flex flex-col items-end">
                      <h2 className="text-[42px] font-normal tracking-[0.05em] text-gray-800 leading-none">
                        INVOICE
                      </h2>
                      <span className="text-sm text-gray-600 mt-2 font-normal">
                        # {invoiceNumber}
                      </span>
                    </div>
                  </div>

                  {/* Sub-Header: Date & Balance Due on Right, Bill To on Left */}
                  <div className="mt-8 flex flex-col gap-2">
                    {/* Date row (aligned right above banner) */}
                    <div className="flex justify-end text-xs text-gray-600 font-normal">
                      <span className="text-gray-500 mr-8">Date:</span>
                      <span className="text-gray-900 font-normal">{invoiceDate}</span>
                    </div>

                    {/* Bill To (Left) and Balance Due Banner (Right) */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
                      <div className="sm:col-span-6 flex flex-col text-xs leading-[1.5]">
                        <span className="text-gray-500 font-normal mb-0.5">Bill To:</span>
                        <span className="font-bold text-gray-900 block text-xs">
                          {billTo.split("\n")[0]}
                        </span>
                        <span className="text-gray-700 whitespace-pre-line block text-xs">
                          {billTo.split("\n").slice(1).join("\n")}
                        </span>
                      </div>

                      <div className="sm:col-span-6 flex justify-end">
                        <div className="w-full sm:w-[320px] bg-[#f2f4f7] rounded py-2 px-4 flex items-center justify-between text-xs">
                          <span className="font-bold text-gray-800">Balance Due:</span>
                          <span className="font-bold text-gray-900 text-sm">
                            {formatCurrency(balanceDue)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Line Items Table */}
                  <div className="mt-7">
                    <div className="overflow-hidden">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-[#374151] text-white text-xs font-semibold">
                            <th className="py-2.5 px-3 font-semibold">Item</th>
                            <th className="py-2.5 px-3 text-center w-20 font-semibold">Quantity</th>
                            <th className="py-2.5 px-3 text-right w-24 font-semibold">Rate</th>
                            <th className="py-2.5 px-3 text-right w-24 font-semibold">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-xs">
                          {items.map((item) => {
                            const itemAmount = (Number(item.quantity) || 0) * (Number(item.rate) || 0);
                            return (
                              <tr key={item.id}>
                                <td className="py-3.5 px-3 font-bold text-gray-900 leading-snug max-w-[360px]">
                                  {item.description}
                                </td>
                                <td className="py-3.5 px-3 text-center text-gray-800 font-normal">
                                  {item.quantity}
                                </td>
                                <td className="py-3.5 px-3 text-right text-gray-800 font-normal">
                                  {formatCurrency(item.rate)}
                                </td>
                                <td className="py-3.5 px-3 text-right text-gray-900 font-normal">
                                  {formatCurrency(itemAmount)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Subtotal, Tax, Total Block on Right */}
                  <div className="flex justify-end mt-7 text-xs">
                    <div className="w-56 flex flex-col gap-2 text-xs">
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

                      <div className="flex justify-between text-gray-500 pt-1">
                        <span>Total:</span>
                        <span className="text-gray-900 font-normal">{formatCurrency(total)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Notes Section (Matches PDF exactly) */}
                  <div className="mt-10 text-xs text-gray-800">
                    <div className="text-gray-600 font-normal mb-1">
                      Notes:
                    </div>
                    <div className="whitespace-pre-line leading-[1.65] font-normal text-gray-800">
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
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
