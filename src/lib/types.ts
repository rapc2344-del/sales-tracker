export interface Model {
  id: number;
  name: string;
  created_at?: string;
}

export type Tier = "free" | "vip" | "none";

export interface Sale {
  id: number;
  name: string;
  username: string;
  amount: number;
  sale_type: string;
  model: string;
  tier: Tier;
  date: string;
  raw_text?: string | null;
  created_at?: string;
}

export interface ParsedPurchase {
  name: string;
  username: string;
  sale_type: string;
  amount: number;
  date: string;
}

export interface SaleInput {
  name: string;
  username: string;
  amount: number;
  sale_type: string;
  model: string;
  tier: Tier;
  date?: string;
  raw_text?: string | null;
}

export interface SummaryData {
  total_revenue: number;
  sales_count: number;
  vip_subtotal: number;
  free_subtotal: number;
  none_subtotal: number;
  by_model: { model: string; revenue: number; count: number }[];
  by_sale_type: { sale_type: string; revenue: number; count: number }[];
  top_buyer: { name: string; username: string; total_spend: number; count: number } | null;
  date_range: { min_date: string | null; max_date: string | null };
}
