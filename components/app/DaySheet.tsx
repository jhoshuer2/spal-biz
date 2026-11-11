"use client";
import { useEffect, useMemo, useState } from "react";
import { Button, Icon, Sheet, TextField } from "@/components/ui";
import { dayKey, salesOf, spentOf, type DayEvent } from "@/lib/day";
import { naira } from "@/lib/format";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Row = DayEvent & { id: string; customer_id: string | null; note: string | null; due_date: string | null };
type Tab = "sold" | "spent" | "paid" | "notes";

const PAGE = 80;
const parseKey = (k: string) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const shift = (k: string, by: number) => { const d = parseKey(k); d.setDate(d.getDate() + by); return dayKey(d); };
const clock = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
const short = (k: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(parseKey(k));
const dayName = (k: string, today: string) => (k === today ? "Today" : k === shift(today, -1) ? "Yesterday" : short(k));

/** Everything behind the number. Opens from a tap on "Today so far", and she can step back through days. */
export function DaySheet({ open, onClose, sb, startKey, todayKey, custNames, itemNames }: {
  open: boolean; onClose: () => void; sb: SupabaseClient; startKey: string; todayKey: string;
  custNames: Map<string, string>; itemNames: Map<string, string>;
}) {
  const [key, setKey] = useState(startKey);
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => { if (open) setKey(startKey); }, [open, startKey]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setRows(null);
    sb.from("event").select("id, kind, amount_kobo, occurred_at, item_id, quantity, customer_id, note, due_date")
      .gte("occurred_at", parseKey(key).toISOString()).lt("occurred_at", parseKey(shift(key, 1)).toISOString())
      .order("occurred_at", { ascending: false }).limit(2000)
      .then(({ data }) => { if (live) setRows((data ?? []) as Row[]); });
    return () => { live = false; };
  }, [open, key, sb]);

  const nav = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <button className="icon-btn" style={{ background: "var(--surface-2)" }} aria-label="Earlier day" onClick={() => setKey(shift(key, -1))}><span style={{ transform: "rotate(180deg)", display: "grid" }}><Icon name="chevron" /></span></button>
      <h2 className="head" style={{ fontSize: 24, margin: 0 }}>{dayName(key, todayKey)}</h2>
      <button className="icon-btn" style={{ background: "var(--surface-2)", opacity: key >= todayKey ? 0.3 : 1 }} aria-label="Later day" disabled={key >= todayKey} onClick={() => setKey(shift(key, 1))}><Icon name="chevron" /></button>
    </div>
  );

  return (
    <Sheet open={open} onClose={onClose} title="Day details">
      {rows === null ? (<>{nav}<p className="label" style={{ textAlign: "center", margin: "32px 0" }}>One moment</p></>) : (
        <DayDetail key={key} header={nav} rows={rows} custNames={custNames} itemNames={itemNames} />
      )}
    </Sheet>
  );
}

/**
 * The day as two clear halves, Sold and Spent, that stay on screen while she scrolls.
 * Built for a busy shop: search, a "By item" total, and pages of 80 instead of everything at once.
 */
export function DayDetail({ header, rows, custNames, itemNames }: { header?: React.ReactNode; rows: Row[]; custNames: Map<string, string>; itemNames: Map<string, string> }) {
  const sold = useMemo(() => rows.filter((r) => r.kind === "sale" || r.kind === "credit_sale"), [rows]);
  const spent = useMemo(() => rows.filter((r) => r.kind === "expense"), [rows]);
  const paid = useMemo(() => rows.filter((r) => r.kind === "payment_received"), [rows]);
  const notes = useMemo(() => rows.filter((r) => r.kind === "stock_note" || r.kind === "day_total"), [rows]);

  const [tab, setTab] = useState<Tab>(sold.length || !spent.length ? "sold" : "spent");
  const [by, setBy] = useState<"order" | "items">("order");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);
  const pick = (t: Tab) => { setTab(t); setQ(""); setShown(PAGE); setBy("order"); };

  const title = (r: Row) => {
    const item = r.item_id ? itemNames.get(r.item_id) : null;
    const base = item ? `${r.quantity && r.quantity !== 1 ? r.quantity + " × " : ""}${item}` : r.note;
    if (r.kind === "payment_received") return `${(r.customer_id && custNames.get(r.customer_id)) || "A customer"} paid`;
    return base ? base[0].toUpperCase() + base.slice(1) : r.kind === "expense" ? "Spent" : r.kind === "day_total" ? "Total for the day" : "Sale";
  };
  const sub = (r: Row) => {
    const who = r.customer_id ? custNames.get(r.customer_id) : null;
    const credit = r.kind === "credit_sale" ? `on credit${r.due_date ? `, due ${short(r.due_date)}` : ""}` : null;
    return [who && r.kind !== "payment_received" ? who : null, credit, clock(r.occurred_at)].filter(Boolean).join(" · ");
  };

  const lists: Record<Tab, Row[]> = { sold, spent, paid, notes };
  const list = lists[tab];
  const needle = q.trim().toLowerCase();
  const filtered = needle ? list.filter((r) => `${title(r)} ${sub(r)}`.toLowerCase().includes(needle)) : list;

  // "By item": what sold most. Sales with no single item (a note like "3 milk, 1 sugar") are grouped as Other sales.
  const grouped = useMemo(() => {
    const m = new Map<string, { name: string; qty: number; total: number }>();
    for (const r of filtered) {
      const k = r.item_id ?? "other";
      const name = r.item_id ? (itemNames.get(r.item_id) ?? "Item") : "Other sales";
      const g = m.get(k) ?? { name, qty: 0, total: 0 };
      g.qty += r.quantity ?? 1; g.total += r.amount_kobo ?? 0;
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [filtered, itemNames]);

  if (rows.length === 0) return <>{header}<p className="label" style={{ textAlign: "center", margin: "32px 0", fontSize: 17 }}>Nothing recorded this day.</p></>;

  const soldTotal = salesOf(rows), spentTotal = spentOf(rows);
  const Tile = ({ id, label, amount, count, hint }: { id: Tab; label: string; amount: number; count: number; hint: string }) => (
    <button className="day-tile" aria-pressed={tab === id} onClick={() => pick(id)}>
      <span style={{ fontSize: 15, fontWeight: 600 }}>{label}</span>
      <span className="num" style={{ fontSize: 30, display: "block", marginTop: 6, letterSpacing: "-0.03em" }}>{naira(amount)}</span>
      <span style={{ fontSize: 14, opacity: 0.8 }}>{count} {hint}</span>
    </button>
  );
  const headings: Record<Tab, string> = { sold: "What you sold", spent: "What you spent", paid: "Paid you", notes: "Stock notes and day figure" };
  const empties: Record<Tab, string> = { sold: "Nothing sold this day.", spent: "Nothing spent this day.", paid: "No payments this day.", notes: "No notes this day." };
  const total = tab === "sold" ? soldTotal : tab === "spent" ? spentTotal : tab === "paid" ? paid.reduce((s, r) => s + (r.amount_kobo ?? 0), 0) : null;

  return (
    <>
      <div className="day-sticky">
        {header}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Tile id="sold" label="Sold" amount={soldTotal} count={sold.length} hint={sold.length === 1 ? "sale" : "sales"} />
          <Tile id="spent" label="Spent" amount={spentTotal} count={spent.length} hint={spent.length === 1 ? "expense" : "expenses"} />
        </div>
        {(paid.length > 0 || notes.length > 0) && (
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {paid.length > 0 && <button className="chip" aria-pressed={tab === "paid"} onClick={() => pick("paid")}>Paid you ({paid.length})</button>}
            {notes.length > 0 && <button className="chip" aria-pressed={tab === "notes"} onClick={() => pick("notes")}>Notes ({notes.length})</button>}
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "20px 0 4px", gap: 12 }}>
        <h3 className="head" style={{ fontSize: 20, margin: 0 }}>{headings[tab]}</h3>
        <span className="label" style={{ fontSize: 14 }}>{filtered.length}{needle ? ` of ${list.length}` : ""} {list.length === 1 ? "entry" : "entries"}{total != null ? ` · ${naira(total)}` : ""}</span>
      </div>

      {list.length > 12 && (
        <div style={{ margin: "8px 0" }}><TextField value={q} onChange={(v) => { setQ(v); setShown(PAGE); }} placeholder="Search by item or name" /></div>
      )}
      {tab === "sold" && sold.length >= 10 && (
        <div className="seg" role="radiogroup" aria-label="Order" style={{ margin: "4px 0 8px" }}>
          <button role="radio" aria-checked={by === "order"} onClick={() => setBy("order")}>Newest first</button>
          <button role="radio" aria-checked={by === "items"} onClick={() => setBy("items")}>By item</button>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="label" style={{ textAlign: "center", margin: "24px 0", fontSize: 17 }}>{needle ? "Nothing matches that." : empties[tab]}</p>
      ) : by === "items" && tab === "sold" ? (
        grouped.map((g) => (
          <div key={g.name} className="row" style={{ minHeight: 64 }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 500 }}>{g.name[0].toUpperCase() + g.name.slice(1)}</span>
              <span className="label" style={{ display: "block", fontSize: 14 }}>{g.qty} sold</span>
            </span>
            <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{naira(g.total)}</span>
          </div>
        ))
      ) : (
        <>
          {filtered.slice(0, shown).map((r) => (
            <div key={r.id} className="row" style={{ minHeight: 64, alignItems: "center" }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 500 }}>{title(r)}</span>
                <span className="label" style={{ display: "block", fontSize: 14 }}>{sub(r)}</span>
              </span>
              {r.amount_kobo != null && <span style={{ fontWeight: 600, whiteSpace: "nowrap", color: r.kind === "credit_sale" ? "var(--care-text)" : r.kind === "expense" ? "var(--ink-2)" : "var(--ink)" }}>{naira(r.amount_kobo)}</span>}
            </div>
          ))}
          {filtered.length > shown && (
            <div style={{ marginTop: 12 }}><Button kind="secondary" block onClick={() => setShown(shown + PAGE)}>Show {Math.min(PAGE, filtered.length - shown)} more</Button></div>
          )}
        </>
      )}
    </>
  );
}
