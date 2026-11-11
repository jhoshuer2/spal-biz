import { naira } from "./format";

export type Visit = { customer_id: string; occurred_at: string; item_id: string | null };
export type Lapsed = { customerId: string; visits: number; daysSince: number; usualGap: number | null; topItemId: string | null };

const DAY = 86_400_000;
const lagosDay = (iso: string | Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const dayNum = (key: string) => { const [y, m, d] = key.split("-").map(Number); return Date.UTC(y, m - 1, d) / DAY; };

export const MIN_VISIT_DAYS = 3;   // someone who bought on at least 3 different days is a regular
export const MIN_QUIET_DAYS = 7;   // never call anyone lapsed before a week
export const MAX_QUIET_DAYS = 90;  // after three months they have probably moved on; leave it

/**
 * Regulars who have gone quiet: people who used to buy often and have not been in for longer than they usually leave.
 * "Longer than usual" is 1.5 times their own normal gap, and never less than a week.
 */
export function lapsedRegulars(visits: Visit[], now = new Date(), owing: Set<string> = new Set()): Lapsed[] {
  const by = new Map<string, Visit[]>();
  for (const v of visits) by.set(v.customer_id, [...(by.get(v.customer_id) ?? []), v]);
  const today = dayNum(lagosDay(now));
  const out: Lapsed[] = [];
  for (const [id, vs] of by) {
    if (owing.has(id)) continue; // someone who owes money gets a debt reminder, not a "we miss you"
    const days = [...new Set(vs.map((v) => dayNum(lagosDay(v.occurred_at))))].sort((a, b) => a - b);
    if (days.length < MIN_VISIT_DAYS) continue;
    const gaps = days.slice(1).map((d, i) => d - days[i]).sort((a, b) => a - b);
    const usual = Math.max(1, gaps[Math.floor(gaps.length / 2)]);
    const since = today - days[days.length - 1];
    if (since < Math.max(MIN_QUIET_DAYS, Math.ceil(usual * 1.5)) || since > MAX_QUIET_DAYS) continue;
    const counts = new Map<string, number>();
    for (const v of vs) if (v.item_id) counts.set(v.item_id, (counts.get(v.item_id) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    out.push({ customerId: id, visits: days.length, daysSince: since, usualGap: usual, topItemId: top ? top[0] : null });
  }
  return out.sort((a, b) => b.visits - a.visits || a.daysSince - b.daysSince);
}

/** "9 days" or "2 weeks", the way she would say it. */
export const quietFor = (days: number) => (days < 14 ? `${days} days` : `${Math.round(days / 7)} weeks`);

export const winBackTitle = (name: string, days: number) => `${name} hasn't been in for ${quietFor(days)}. Want me to send a message?`;

/** Warm and short, with no offer and no pressure. She can change every word before it goes. */
export function draftWinBack(a: { name: string; shop: string; item?: string | null }) {
  const usual = a.item ? ` Your usual ${a.item} is available.` : "";
  return `Hi ${a.name}, it's ${a.shop || "us"}. We haven't seen you in a while and we miss you!${usual} Come by any time.`;
}

export { naira };
