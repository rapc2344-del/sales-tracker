import type { ParsedPurchase } from "./types";

/**
 * Parsing logic (parsePurchaseText)
 * Plain string/regex function, works on the confirmed sample format.
 *
 * Example input:
 * 🐳(Kody)
 * @u80636081
 * XXXtreme Spenders-V8Ctalking rn 10/14/25
 * has purchased your message for $30.99!
 */
export function parsePurchaseText(text: string): ParsedPurchase | null {
  if (!text || typeof text !== "string") return null;

  const nameMatch = text.match(/\(([^)]+)\)/);
  const usernameMatch = text.match(/@(\S+)/);
  const dateMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  const saleMatch = text.match(/purchased your (\w+) for \$([\d.]+)/i);

  if (!nameMatch || !usernameMatch || !saleMatch) {
    return null; // unrecognized format — cannot save
  }

  let date = new Date().toISOString().slice(0, 10);
  if (dateMatch) {
    const [, month, day, year] = dateMatch;
    const fullYear = year.length === 2 ? `20${year}` : year;
    date = `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return {
    name: nameMatch[1].trim(),
    username: `@${usernameMatch[1].replace(/[^a-zA-Z0-9_]/g, "")}`,
    sale_type: saleMatch[1].toLowerCase(),
    amount: parseFloat(saleMatch[2]),
    date,
  };
}
