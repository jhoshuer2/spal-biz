import { naira } from "./format";

export type DayEvent = { kind: string; amount_kobo: number | null; occurred_at: string; item_id: string | null; quantity: number | null };

export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const keyOf = (iso: string) => dayKey(new Date(iso));
const isSale = (e: DayEvent) => e.kind === "sale" || e.kind === "credit_sale";

export function forDay(events: DayEvent[], key: string) {
  return events.filter((e) => keyOf(e.occurred_at) === key);
}

/** Itemised sales win. If she only gave an overall figure, use the latest of those. */
export function salesOf(events: DayEvent[]) {
  const itemised = events.filter(isSale).reduce((s, e) => s + (e.amount_kobo ?? 0), 0);
  if (itemised > 0) return itemised;
  const totals = events.filter((e) => e.kind === "day_total" && e.amount_kobo != null).sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  return totals.length ? (totals[totals.length - 1].amount_kobo ?? 0) : 0;
}

export const countOf = (events: DayEvent[]) => events.filter(isSale).length;
export const spentOf = (events: DayEvent[]) => events.filter((e) => e.kind === "expense").reduce((s, e) => s + (e.amount_kobo ?? 0), 0);

/** Which closing question fits the day she had (PRODUCT.md: closing conversation). */
export function closingCase(today: DayEvent[], recent: DayEvent[], todayKey: string): "nothing" | "some" | "everything" {
  const n = countOf(today);
  if (today.length === 0) return "nothing";
  const past = new Map<string, number>();
  for (const e of recent) {
    const k = keyOf(e.occurred_at);
    if (k !== todayKey && isSale(e)) past.set(k, (past.get(k) ?? 0) + 1);
  }
  const counts = [...past.values()];
  const avg = counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;
  return avg > 0 && n >= avg * 0.9 ? "everything" : "some";
}

export type Summary = {
  total: number; count: number; spent: number; best: string | null; owing: { name: string; kobo: number }[];
  delta: { diff: number; weekday: string } | null; text: string;
};

export function summarize(today: DayEvent[], recent: DayEvent[], itemNames: Map<string, string>, owing: { name: string; kobo: number }[], now = new Date()): Summary {
  const total = salesOf(today);
  const count = countOf(today);
  const spent = spentOf(today);

  const byItem = new Map<string, number>();
  for (const e of today.filter(isSale)) if (e.item_id) byItem.set(e.item_id, (byItem.get(e.item_id) ?? 0) + (e.quantity ?? 1));
  const top = [...byItem.entries()].sort((a, b) => b[1] - a[1])[0];
  const best = top ? (itemNames.get(top[0]) ?? null) : null;

  const lastWeek = new Date(now);
  lastWeek.setDate(lastWeek.getDate() - 7);
  const prev = salesOf(forDay(recent, dayKey(lastWeek)));
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long" }).format(lastWeek);
  const delta = prev > 0 && total > 0 && total !== prev ? { diff: total - prev, weekday } : null;

  const parts = [count > 0 ? `${naira(total)} from ${count} ${count === 1 ? "sale" : "sales"}` : `About ${naira(total)}`];
  if (spent > 0) parts.push(`spent ${naira(spent)}`);
  if (best) parts.push(`${best[0].toUpperCase() + best.slice(1)} sold the most`);
  if (owing[0]) parts.push(`${owing[0].name} owes ${naira(owing[0].kobo)}`);
  return { total, count, spent, best, owing, delta, text: parts.join(". ") + "." };
}
