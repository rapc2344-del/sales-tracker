import type { SavedSummary } from "@/lib/types";
export { formatMDY, formatLongDate } from "@/lib/gsheet";

export interface CutoffPeriodInfo {
  id: string; // e.g. "2026-09-24_2026-10-07"
  label: string; // e.g. "Sep 24 – Oct 7, 2026"
  type: "8-23" | "24-7";
  startDate: string;
  endDate: string;
  displayStartDate: string;
  displayEndDate: string;
  isCurrent: boolean;
}

export function parseSummaryDate(summary: SavedSummary): Date {
  if (summary.created_at) {
    const d = new Date(summary.created_at);
    if (!isNaN(d.getTime())) return d;
  }
  // Fallback to export_filename if contains YYYY-MM-DD
  const match = summary.export_filename?.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const d = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00`);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

/**
 * Calculates the Cutoff Period for a given date according to standard rules:
 * - 8th to 23rd of month (type: "8-23")
 * - 24th of month to 7th of next month (type: "24-7")
 */
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
    // day <= 7 (part of 24th of prev month to 7th of current month)
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

/**
 * Returns the currently active cutoff based on right now.
 */
export function getCurrentCutoff(): CutoffPeriodInfo {
  return getCutoffForDate(new Date());
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

// ── Rate & Bonus Calculation Rules ────────────────────────
// - < $500: (No bonuses) -> Rate $1.75
// - $500: ($500 sales bonus) -> Rate $2.00
// - $1000: ($1,000 sales bonus) -> Rate $3.00
// - $1500: ($1,500 sales bonus) -> Rate $3.50
// - $2000+: ($2,000 sales bonus) -> Rate $4.00 (+$0.50 per $500 above)
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

  // Ensure CURRENT cutoff is always present even if 0 summaries logged yet
  const currentCutoff = getCutoffForDate(new Date());
  if (!map.has(currentCutoff.id)) {
    map.set(currentCutoff.id, { info: currentCutoff, summaries: [] });
  } else {
    // Make sure the isCurrent flag is set to true
    const entry = map.get(currentCutoff.id);
    if (entry) {
      entry.info.isCurrent = true;
    }
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

  // Sort: current cutoff first, then newest start date to oldest
  return result.sort((a, b) => {
    if (a.info.isCurrent) return -1;
    if (b.info.isCurrent) return 1;
    return new Date(b.info.startDate).getTime() - new Date(a.info.startDate).getTime();
  });
}
