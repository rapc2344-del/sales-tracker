import type { ParsedPurchase } from "./types";

const MONTH_MAP: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

/**
 * Parsing logic (parsePurchaseText)
 * Parses purchases and tips from notification texts.
 *
 * Supported formats:
 * - Message purchase:
 *     Mo
 *     @zainmarforq
 *     $$ - Medium Spenders-LKB
 *     has purchased your [message](https://onlyfans.com/...) for $20.00!
 *     Sep. 18, 2026 at 4:15 AM
 *
 * - Tip:
 *     JoeJoe SouthBX
 *     @joejoe_southbx
 *     Add to favorites and other lists
 *     paid you a tip of $1.00
 *     Sep. 13, 2026 at 7:09 PM
 *
 * - Legacy format:
 *     🐳(Kody)
 *     @u80636081
 *     XXXtreme Spenders-V8Ctalking rn 10/14/25
 *     has purchased your message for $30.99!
 */
export function parsePurchaseText(text: string): ParsedPurchase | null {
  if (!text || typeof text !== "string") return null;

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // 1. Username
  const usernameMatch = text.match(/@([a-zA-Z0-9_]+)/);
  if (!usernameMatch) {
    return null; // Username is required
  }
  const cleanUsername = usernameMatch[1].replace(/[^a-zA-Z0-9_]/g, "");

  // 2. Name
  let name = "";
  const userLineIdx = lines.findIndex((l) => l.includes(`@${usernameMatch[1]}`));
  if (userLineIdx > 0) {
    const candidate = lines[userLineIdx - 1];
    const parenMatch = candidate.match(/\(([^)]+)\)/);
    if (parenMatch) {
      name = parenMatch[1].trim();
    } else {
      name = candidate.trim();
    }
  }

  if (!name) {
    const parenMatch = text.match(/\(([^)]+)\)/);
    if (parenMatch) {
      name = parenMatch[1].trim();
    } else if (lines.length > 0 && !lines[0].startsWith("@")) {
      name = lines[0].trim();
    }
  }

  if (!name) {
    return null; // Name is required
  }

  // 3. Sale Type & Amount
  // Check for purchase first: "purchased your [message](...) for $20.00!" or "purchased your message for $30.99!"
  const purchaseMatch = text.match(/purchased your (?:\[(\w+)\]|(\w+))(?:\([^)]*\))?\s+for\s+\$([\d.,]+)/i);

  // Check for tip: "paid you a tip of $1.00", "sent you a tip of $1.00", "sent you a $1.00 tip", "tipped you $1.00"
  const tipMatch =
    text.match(/(?:paid|sent)\s+(?:you\s+)?(?:a\s+)?tip\s+(?:of\s+)?\$([\d.,]+)/i) ||
    text.match(/(?:sent|paid)\s+(?:you\s+)?\$([\d.,]+)\s+tip/i) ||
    text.match(/tipped(?:\s+you)?\s+(?:for\s+)?\$([\d.,]+)/i) ||
    text.match(/tip\s+of\s+\$([\d.,]+)/i);

  let sale_type = "";
  let amount = 0;

  if (purchaseMatch) {
    sale_type = (purchaseMatch[1] || purchaseMatch[2]).toLowerCase();
    amount = parseFloat(purchaseMatch[3].replace(/,/g, ""));
  } else if (tipMatch) {
    sale_type = "tip";
    amount = parseFloat(tipMatch[1].replace(/,/g, ""));
  } else {
    return null; // Unrecognized purchase/tip format
  }

  if (isNaN(amount)) {
    return null;
  }

  // 4. Date extraction
  let date = new Date().toISOString().slice(0, 10);

  // Check for written date: "Sep. 18, 2026 at 4:15 AM" or "Sep 13, 2026"
  const writtenDateMatch = text.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2}),\s+(\d{4})/i);
  // Check for numeric date: "10/14/25" or "10/14/2025"
  const numericDateMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);

  if (writtenDateMatch) {
    const monthKey = writtenDateMatch[1].slice(0, 3).toLowerCase();
    const monthNum = MONTH_MAP[monthKey];
    if (monthNum) {
      const day = writtenDateMatch[2].padStart(2, "0");
      const year = writtenDateMatch[3];
      date = `${year}-${monthNum}-${day}`;
    }
  } else if (numericDateMatch) {
    const [, month, day, year] = numericDateMatch;
    const fullYear = year.length === 2 ? `20${year}` : year;
    date = `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return {
    name,
    username: `@${cleanUsername}`,
    sale_type,
    amount,
    date,
  };
}

