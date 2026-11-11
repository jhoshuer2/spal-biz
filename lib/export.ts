import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;

/** Read every row of a table, a thousand at a time (the database returns at most that many per request). */
async function all(sb: SupabaseClient, table: string, order = "created_at"): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await sb.from(table).select("*").order(order, { ascending: true }).range(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const KIND: Record<string, string> = { sale: "Sale", credit_sale: "On credit", payment_received: "Paid you", expense: "Spent", day_total: "Day figure", stock_note: "Stock note" };
const cell = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** Everything she has told Spal, as a spreadsheet she can open in Excel, and as a complete copy. */
export async function buildExport(sb: SupabaseClient) {
  const [shop, customer, item, event, capture, day_close, proposal] = await Promise.all([
    all(sb, "shop"), all(sb, "customer"), all(sb, "item"), all(sb, "event", "occurred_at"),
    all(sb, "capture"), all(sb, "day_close", "day"), all(sb, "proposal"),
  ]);
  const cust = new Map(customer.map((c) => [c.id as string, c.name as string]));
  const itm = new Map(item.map((i) => [i.id as string, i.name as string]));

  const head = ["Date", "Time", "Type", "What", "How many", "Amount (NGN)", "Customer", "Pays on", "Note"];
  const lines = event.map((e) => {
    const d = new Date(e.occurred_at as string);
    const naira = e.amount_kobo == null ? "" : (Number(e.amount_kobo) / 100).toString();
    return [d.toLocaleDateString("en-CA"), d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), KIND[e.kind as string] ?? e.kind, e.item_id ? itm.get(e.item_id as string) : "", e.quantity, naira, e.customer_id ? cust.get(e.customer_id as string) : "", e.due_date, e.note].map(cell).join(",");
  });
  const csv = "﻿" + [head.join(","), ...lines].join("\r\n");

  // Her own words and customers. Audio files are not included; they can be requested.
  const json = JSON.stringify({ exported_at: new Date().toISOString(), shop: shop[0] ? { ...shop[0], avatar: shop[0].avatar ? "(photo)" : null } : null, customers: customer, items: item, records: event, notes: capture.map((c) => ({ when: c.created_at, kind: c.kind, text: c.text_content, heard: c.transcript, status: c.status })), days_closed: day_close, reminders: proposal }, null, 2);
  return { csv, json, count: event.length };
}

export function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
