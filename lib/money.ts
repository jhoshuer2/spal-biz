export type Ev = { kind: string; amount_kobo: number | null; occurred_at: string };

/**
 * Sales so far for a set of events (all from the same day).
 * Itemised sales (cash + credit) win. If she only gave an overall figure, use the latest of those.
 */
export function salesKobo(events: Ev[]): number {
  const itemised = events.filter((e) => e.kind === "sale" || e.kind === "credit_sale").reduce((s, e) => s + (e.amount_kobo ?? 0), 0);
  if (itemised > 0) return itemised;
  const totals = events.filter((e) => e.kind === "day_total" && e.amount_kobo != null).sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  return totals.length ? (totals[totals.length - 1].amount_kobo ?? 0) : 0;
}

export const spentKobo = (events: Ev[]) => events.filter((e) => e.kind === "expense").reduce((s, e) => s + (e.amount_kobo ?? 0), 0);
