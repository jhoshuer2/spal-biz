import type { SupabaseClient } from "@supabase/supabase-js";
import { naira } from "./format";
import { actionKobo, changedFields, describe, describeRow, noonLagos, rescaleKobo, type EventRow } from "./records";

export const KINDS = ["sale", "expense", "credit_sale", "payment_received", "stock_note", "day_total"] as const;
export type Kind = (typeof KINDS)[number];

export type Action = {
  op: "add" | "update" | "delete"; target: string | null; kind: Kind | "none" | null;
  amount_naira: number | null; unit_price_naira: number | null; quantity: number | null;
  item: string | null; customer: string | null; due_date: string | null; note: string | null; occurred_on: string | null; confidence: number;
};
export type Parsed = { actions: Action[]; question: string | null };

const clean = (s: string | null | undefined) => (s ?? "").trim();
const norm = (s: string) => s.trim().toLowerCase();
const isKind = (k: unknown): k is Kind => typeof k === "string" && (KINDS as readonly string[]).includes(k);
const isDate = (d: string | null) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);

export type Ctx = {
  sb: SupabaseClient; shopId: string; captureId: string;
  byRef: Map<string, EventRow>;
  capturedAt?: string; // when she really said it, for notes that waited for signal
  custName: Map<string, string>; itemName: Map<string, string>;
  custIndex: Map<string, string>; itemIndex: Map<string, string>;
};

/** Carry out what the model asked for: add records, fix saved ones, remove saved ones. Every update or removal keeps a copy of how it was, so it can be undone. */
export async function applyActions(ctx: Ctx, actions: Action[]) {
  const { sb, shopId, captureId, byRef, custName, itemName, custIndex, itemIndex, capturedAt } = ctx;
  const lines: string[] = [];
  let changed = false, wrote = 0, missed = 0, historyFailed = false;
  const touchedCustomers: string[] = [];
  const boughtCustomers: string[] = []; // customers who bought, from new records (for "they came back")

  async function resolve(table: "customer" | "item", index: Map<string, string>, names: Map<string, string>, name: string) {
    if (!name) return null;
    const hit = index.get(norm(name));
    if (hit) return hit;
    const { data } = await sb.from(table).insert({ shop_id: shopId, name }).select("id").single();
    if (data) { index.set(norm(name), data.id); names.set(data.id, name); }
    return data?.id ?? null;
  }

  for (const a of actions ?? []) {
    if (a.op === "add") {
      if (!isKind(a.kind)) continue;
      const kobo = actionKobo(a);
      if (a.kind !== "stock_note" && kobo == null) continue;
      const customer = clean(a.customer), item = clean(a.item);
      if (a.kind === "credit_sale" && !customer) continue; // a debt with no name cannot be tracked; the question asks who
      const customer_id = await resolve("customer", custIndex, custName, customer);
      const item_id = await resolve("item", itemIndex, itemName, item);
      const when = noonLagos(a.occurred_on);
      const row = {
        shop_id: shopId, capture_id: captureId, kind: a.kind, amount_kobo: kobo, customer_id, item_id,
        quantity: a.quantity != null && a.quantity > 0 ? a.quantity : null,
        due_date: isDate(a.due_date) ? a.due_date : null,
        note: clean(a.note) || null, confidence: Math.min(1, Math.max(0, a.confidence ?? 0.5)),
        ...(when ? { occurred_at: when } : capturedAt && Date.now() - new Date(capturedAt).getTime() > 120_000 ? { occurred_at: capturedAt } : {}),
      };
      const { error } = await sb.from("event").insert(row);
      if (error) { console.error("add failed", error.message); missed++; continue; }
      wrote++;
      if (customer_id) { touchedCustomers.push(customer_id); if (a.kind === "sale" || a.kind === "credit_sale") boughtCustomers.push(customer_id); }
      lines.push(describe({ kind: a.kind, amount_kobo: kobo, customer, item, quantity: row.quantity, note: row.note, due: row.due_date }));
      continue;
    }

    // update or delete: must point at a record she really has
    const before = a.target ? byRef.get(a.target) : undefined;
    if (!before) { missed++; continue; }
    const beforeText = describeRow(before, custName, itemName);

    if (a.op === "delete") {
      const { error: he } = await sb.from("event_history").insert({ shop_id: shopId, capture_id: captureId, event_id: before.id, action: "delete", before });
      if (he) { console.error("history failed", he.message); historyFailed = true; missed++; continue; }
      const { error } = await sb.from("event").delete().eq("id", before.id);
      if (error) { console.error("delete failed", error.message); missed++; continue; }
      byRef.delete(a.target!);
      wrote++; changed = true;
      lines.push(`Removed: ${beforeText}`);
      continue;
    }

    // update: only the fields she changed
    const patch: Partial<EventRow> = {};
    if (isKind(a.kind)) patch.kind = a.kind;
    const qty = a.quantity != null && a.quantity > 0 ? a.quantity : null;
    if (qty != null) patch.quantity = qty;
    let kobo = actionKobo(a);
    if (kobo == null && qty != null && a.amount_naira == null && a.unit_price_naira == null) kobo = rescaleKobo(before, qty); // "only three paid" keeps the price each
    if (kobo != null) patch.amount_kobo = kobo;
    if (clean(a.customer)) patch.customer_id = await resolve("customer", custIndex, custName, clean(a.customer));
    if (clean(a.item)) patch.item_id = await resolve("item", itemIndex, itemName, clean(a.item));
    if (clean(a.note)) patch.note = clean(a.note);
    if (isDate(a.due_date)) patch.due_date = a.due_date;
    const diff = changedFields(before as unknown as Record<string, unknown>, patch as Record<string, unknown>) as Partial<EventRow>;
    const finalKind = diff.kind ?? before.kind;
    if (finalKind === "credit_sale" && !(diff.customer_id ?? before.customer_id)) { missed++; continue; } // a debt needs a name
    if (!Object.keys(diff).length) continue;

    const { error: he } = await sb.from("event_history").insert({ shop_id: shopId, capture_id: captureId, event_id: before.id, action: "update", before });
    if (he) { console.error("history failed", he.message); historyFailed = true; missed++; continue; }
    const { error } = await sb.from("event").update(diff).eq("id", before.id);
    if (error) { console.error("update failed", error.message); missed++; continue; }
    const after: EventRow = { ...before, ...diff };
    byRef.set(a.target!, after);
    wrote++; changed = true;
    if (after.customer_id) touchedCustomers.push(after.customer_id);
    const was = before.amount_kobo != null && diff.amount_kobo != null ? ` (was ${naira(before.amount_kobo)})` : "";
    lines.push(`Updated: ${describeRow(after, custName, itemName)}${was}`);
  }

  return { lines, changed, wrote, missed, touchedCustomers, boughtCustomers, historyFailed };
}
