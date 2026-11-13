import { naira } from "./format";

export type EventRow = {
  id: string; kind: string; amount_kobo: number | null; occurred_at: string;
  customer_id: string | null; item_id: string | null; quantity: number | null; due_date: string | null; note: string | null;
  shop_id?: string; capture_id?: string | null; confidence?: number | null; created_at?: string;
};

/** Money from a note. The model never multiplies: it gives a total, or a unit price and a quantity, and this does the sum. */
export function actionKobo(a: { amount_naira: number | null; unit_price_naira: number | null; quantity: number | null }): number | null {
  let n = a.amount_naira;
  if (n == null && a.unit_price_naira != null && a.quantity != null) n = a.unit_price_naira * a.quantity;
  if (n == null || !Number.isFinite(n) || n <= 0 || n > 1_000_000_000) return null;
  return Math.round(n * 100);
}

/** "Only three paid" on 4 × ₦5,000: the new quantity keeps the same price each, when it divides evenly. */
export function rescaleKobo(before: { amount_kobo: number | null; quantity: number | null }, newQty: number): number | null {
  const { amount_kobo: amt, quantity: q } = before;
  if (amt == null || !q || q <= 0 || newQty <= 0) return null;
  return amt % q === 0 ? (amt / q) * newQty : null;
}

type D = { kind: string; amount_kobo: number | null; customer: string; item: string; quantity: number | null; note: string | null; due: string | null };

const longDate = (d: string) => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));

/** One plain line about a record, the way Spal says it back to her. */
export function describe(d: D): string {
  const amt = d.amount_kobo != null ? naira(d.amount_kobo) : "";
  const what = d.item ? ` (${d.quantity && d.quantity !== 1 ? d.quantity + " " : ""}${d.item})` : d.note && d.kind !== "expense" && d.kind !== "stock_note" ? ` (${d.note})` : "";
  switch (d.kind) {
    case "sale": return `Sale${d.customer ? " to " + d.customer : ""}, ${amt}${what}`;
    case "credit_sale": return `${amt} on credit${d.customer ? " for " + d.customer : ""}${d.due ? ", due " + longDate(d.due) : ""}${what}`;
    case "payment_received": return `${d.customer || "A customer"} paid ${amt}`;
    case "expense": return `Spent ${amt}${d.note ? " on " + d.note : ""}`;
    case "day_total": return `About ${amt} for the day`;
    default: return `Noted: ${d.note ?? d.item ?? "stock"}`;
  }
}

export function describeRow(r: EventRow, cust: Map<string, string>, items: Map<string, string>) {
  return describe({ kind: r.kind, amount_kobo: r.amount_kobo, customer: (r.customer_id && cust.get(r.customer_id)) || "", item: (r.item_id && items.get(r.item_id)) || "", quantity: r.quantity, note: r.note, due: r.due_date });
}

const lagos = (iso: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Lagos" }).format(new Date(iso));

/** Her recent records with short ids (r1, r2, ...), newest first, so the model can point at the one she means. */
export function recordsList(rows: EventRow[], cust: Map<string, string>, items: Map<string, string>) {
  const byRef = new Map<string, EventRow>();
  const lines = rows.map((r, i) => {
    const ref = `r${i + 1}`;
    byRef.set(ref, r);
    const who = r.customer_id ? cust.get(r.customer_id) : null;
    const item = r.item_id ? items.get(r.item_id) : null;
    const parts = [ref, lagos(r.occurred_at), r.kind, r.amount_kobo != null ? naira(r.amount_kobo) : "-", item ? `${r.quantity ?? 1} x ${item}` : r.note ?? "-", who ? `customer: ${who}` : "", r.due_date ? `due ${r.due_date}` : ""].filter((x) => x !== "");
    return parts.join(" | ");
  });
  return { text: lines.join("\n"), byRef };
}

/** The fields that actually change, so an unchanged field is never written and never reported. */
export function changedFields<T extends Record<string, unknown>>(before: T, after: Partial<T>): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(after) as (keyof T)[]) if (after[k] !== undefined && after[k] !== before[k]) out[k] = after[k];
  return out;
}

/** Noon in Lagos on a given date, for records she tells Spal about from an earlier day. null if the date is not usable. */
export function noonLagos(day: string | null, now = new Date()): string | null {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const t = new Date(day + "T11:00:00Z"); // 12:00 in Lagos (UTC+1)
  if (Number.isNaN(t.getTime()) || t.getTime() > now.getTime() + 24 * 3600 * 1000 || t.getTime() < now.getTime() - 400 * 24 * 3600 * 1000) return null;
  return t.toISOString();
}

const lagosDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
/** "6:30 pm" in Lagos, for saying a time back to her. */
export const clockLagos = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Lagos" }).format(new Date(iso)).replace(/\s/g, " ");

/** The moment she said it happened. `time` is HH:MM, 24 hours, Lagos. `day` is YYYY-MM-DD; without it the day of `base` (when she told Spal, or the record being fixed) is used. null if unusable or still in the future. */
export function whenLagos(day: string | null, time: string | null, base: string | Date, now = new Date()): string | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec((time ?? "").trim());
  if (!m) return null;
  const d = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : lagosDay(new Date(base).toISOString());
  const t = new Date(`${d}T${m[1].padStart(2, "0")}:${m[2]}:00+01:00`); // Lagos is UTC+1 all year
  if (Number.isNaN(t.getTime()) || t.getTime() > now.getTime() + 10 * 60_000 || t.getTime() < now.getTime() - 400 * 24 * 3600 * 1000) return null;
  return t.toISOString();
}
