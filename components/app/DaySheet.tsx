"use client";
import { useEffect, useState } from "react";
import { DeltaPill, Icon, Sheet } from "@/components/ui";
import { dayKey, salesOf, spentOf, type DayEvent } from "@/lib/day";
import { naira } from "@/lib/format";
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = DayEvent & { id: string; customer_id: string | null; note: string | null; due_date: string | null };

const parseKey = (k: string) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const shift = (k: string, by: number) => { const d = parseKey(k); d.setDate(d.getDate() + by); return dayKey(d); };
const clock = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso)).replace(/\s/g, " ");
const dayName = (k: string, today: string) =>
  k === today ? "Today" : k === shift(today, -1) ? "Yesterday" : new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(parseKey(k));

const SECTIONS: { kinds: string[]; title: string }[] = [
  { kinds: ["sale"], title: "Sold" },
  { kinds: ["credit_sale"], title: "On credit" },
  { kinds: ["payment_received"], title: "Paid you" },
  { kinds: ["expense"], title: "Spent" },
  { kinds: ["day_total"], title: "Your day figure" },
  { kinds: ["stock_note"], title: "Stock notes" },
];

/** Everything behind the number: what was sold, who owes, what was spent. Opens from a tap, and she can step back through days. */
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
    const from = parseKey(key), to = parseKey(shift(key, 1));
    sb.from("event").select("id, kind, amount_kobo, occurred_at, item_id, quantity, customer_id, note, due_date")
      .gte("occurred_at", from.toISOString()).lt("occurred_at", to.toISOString()).order("occurred_at", { ascending: true })
      .then(({ data }) => { if (live) setRows((data ?? []) as Row[]); });
    return () => { live = false; };
  }, [open, key, sb]);

  const sales = rows ? salesOf(rows) : 0;
  const spent = rows ? spentOf(rows) : 0;

  const title = (r: Row) => {
    const item = r.item_id ? itemNames.get(r.item_id) : null;
    const base = item ? `${r.quantity && r.quantity !== 1 ? r.quantity + " × " : ""}${item}` : r.note;
    if (r.kind === "payment_received") return `${(r.customer_id && custNames.get(r.customer_id)) || "A customer"} paid`;
    return base ? base[0].toUpperCase() + base.slice(1) : r.kind === "expense" ? "Spent" : r.kind === "day_total" ? "Total for the day" : "Sale";
  };
  const sub = (r: Row) => {
    const who = r.customer_id ? custNames.get(r.customer_id) : null;
    const due = r.kind === "credit_sale" && r.due_date ? `due ${new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(parseKey(r.due_date))}` : null;
    return [who && r.kind !== "payment_received" ? who : null, due, clock(r.occurred_at)].filter(Boolean).join(" · ");
  };

  return (
    <Sheet open={open} onClose={onClose} title="Day details">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <button className="icon-btn" style={{ background: "var(--surface-2)" }} aria-label="Earlier day" onClick={() => setKey(shift(key, -1))}><span style={{ transform: "rotate(180deg)", display: "grid" }}><Icon name="chevron" /></span></button>
        <h2 className="head" style={{ fontSize: 24, margin: 0 }}>{dayName(key, todayKey)}</h2>
        <button className="icon-btn" style={{ background: "var(--surface-2)", opacity: key >= todayKey ? 0.3 : 1 }} aria-label="Later day" disabled={key >= todayKey} onClick={() => setKey(shift(key, 1))}><Icon name="chevron" /></button>
      </div>

      {rows === null ? (
        <p className="label" style={{ textAlign: "center", margin: "32px 0" }}>One moment</p>
      ) : rows.length === 0 ? (
        <p className="label" style={{ textAlign: "center", margin: "32px 0", fontSize: 17 }}>Nothing recorded this day.</p>
      ) : (
        <>
          <div className="num" style={{ fontSize: 48 }}>{naira(sales)}</div>
          {spent > 0 && <div style={{ marginTop: 10 }}><DeltaPill tone="flat">Spent {naira(spent)}</DeltaPill></div>}
          {SECTIONS.map((sec) => {
            const list = rows.filter((r) => sec.kinds.includes(r.kind));
            if (!list.length) return null;
            return (
              <div key={sec.title} style={{ marginTop: 20 }}>
                <p className="label" style={{ margin: "0 0 2px" }}>{sec.title}</p>
                {list.map((r) => (
                  <div key={r.id} className="row" style={{ minHeight: 64, alignItems: "center" }}>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontWeight: 500 }}>{title(r)}</span>
                      <span className="label" style={{ display: "block", fontSize: 14 }}>{sub(r)}</span>
                    </span>
                    {r.amount_kobo != null && <span style={{ fontWeight: 600, whiteSpace: "nowrap", color: r.kind === "expense" ? "var(--ink-2)" : r.kind === "credit_sale" ? "var(--care-text)" : "var(--ink)" }}>{naira(r.amount_kobo)}</span>}
                  </div>
                ))}
              </div>
            );
          })}
        </>
      )}
    </Sheet>
  );
}
