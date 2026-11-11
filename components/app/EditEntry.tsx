"use client";
import { useState } from "react";
import { Button, Sheet, TextField } from "@/components/ui";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Row } from "./DaySheet";

const digits = (s: string) => s.replace(/[^\d.]/g, "");

/** Fix or remove one saved entry by hand. Opens when she taps a row in the day details. */
export function EditEntry({ row, sb, shopId, custNames, itemNames, onClose, onChanged }: {
  row: Row | null; sb: SupabaseClient; shopId: string; custNames: Map<string, string>; itemNames: Map<string, string>;
  onClose: () => void; onChanged: () => void;
}) {
  return (
    <Sheet open={!!row} onClose={onClose} title="Edit entry" layer={1}>
      {row && <Form key={row.id} row={row} sb={sb} shopId={shopId} custNames={custNames} itemNames={itemNames} onClose={onClose} onChanged={onChanged} />}
    </Sheet>
  );
}

function Form({ row, sb, shopId, custNames, itemNames, onClose, onChanged }: {
  row: Row; sb: SupabaseClient; shopId: string; custNames: Map<string, string>; itemNames: Map<string, string>; onClose: () => void; onChanged: () => void;
}) {
  const isSale = row.kind === "sale" || row.kind === "credit_sale";
  const itemOriginal = row.item_id ? itemNames.get(row.item_id) ?? "" : "";
  const whatOriginal = itemOriginal || row.note || "";
  const [what, setWhat] = useState(whatOriginal);
  const [qty, setQty] = useState(row.quantity ? String(row.quantity) : "");
  const [amount, setAmount] = useState(row.amount_kobo != null ? String(Math.round(row.amount_kobo / 100)) : "");
  const [who, setWho] = useState(row.customer_id ? custNames.get(row.customer_id) ?? "" : "");
  const [credit, setCredit] = useState(row.kind === "credit_sale");
  const [due, setDue] = useState(row.due_date ?? "");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const heading = row.kind === "expense" ? "Spent" : row.kind === "payment_received" ? "Payment" : row.kind === "day_total" ? "Day figure" : row.kind === "stock_note" ? "Stock note" : "Sale";
  const showWhat = row.kind !== "payment_received" && row.kind !== "day_total";
  const showQty = isSale;
  const showAmount = row.kind !== "stock_note";
  const showWho = isSale || row.kind === "payment_received";

  async function find(table: "customer" | "item", names: Map<string, string>, name: string) {
    if (!name) return null;
    for (const [id, n] of names) if (n.trim().toLowerCase() === name.trim().toLowerCase()) return id;
    const { data } = await sb.from(table).insert({ shop_id: shopId, name: name.trim() }).select("id").single();
    return data?.id ?? null;
  }

  async function save() {
    setErr(null);
    const naira = Number(digits(amount));
    if (showAmount && (!naira || naira <= 0)) { setErr("How much was it?"); return; }
    if (credit && isSale && !who.trim()) { setErr("Who owes you?"); return; }
    if (row.kind === "payment_received" && !who.trim()) { setErr("Who paid you?"); return; }
    setBusy(true);
    const patch: Record<string, unknown> = {};
    if (showAmount) patch.amount_kobo = Math.round(naira * 100);
    if (showQty) patch.quantity = qty ? Number(digits(qty)) || null : null;
    if (isSale) { patch.kind = credit ? "credit_sale" : "sale"; patch.due_date = credit && due ? due : null; }
    if (showWho) patch.customer_id = await find("customer", custNames, who);
    if (showWhat) {
      if (what.trim() === whatOriginal) { /* unchanged: keep the item link as it was */ }
      else {
        const known = [...itemNames].find(([, n]) => n.trim().toLowerCase() === what.trim().toLowerCase());
        if (known) { patch.item_id = known[0]; patch.note = null; } else { patch.item_id = null; patch.note = what.trim() || null; }
      }
    }
    const { error } = await sb.from("event").update(patch).eq("id", row.id);
    setBusy(false);
    if (error) { setErr("I couldn't save that. Please try again."); return; }
    onChanged();
    onClose();
  }

  async function remove() {
    setBusy(true);
    const { error } = await sb.from("event").delete().eq("id", row.id);
    setBusy(false);
    if (error) { setErr("I couldn't remove that. Please try again."); return; }
    onChanged();
    onClose();
  }

  if (confirm)
    return (
      <>
        <h2 className="head" style={{ fontSize: 26, margin: "0 0 8px" }}>Remove this entry?</h2>
        <p className="label" style={{ margin: "0 0 20px", fontSize: 17 }}>{whatOriginal || heading}{row.amount_kobo != null ? `, ₦${Math.round(row.amount_kobo / 100).toLocaleString("en-NG")}` : ""}. This takes it out of your totals.</p>
        {err && <p role="alert" style={{ color: "var(--care-text)", margin: "0 0 12px" }}>{err}</p>}
        <div style={{ display: "grid", gap: 8 }}>
          <Button block onClick={remove} disabled={busy}>{busy ? "One moment" : "Yes, remove it"}</Button>
          <Button kind="ghost" block onClick={() => setConfirm(false)}>Keep it</Button>
        </div>
      </>
    );

  return (
    <>
      <h2 className="head" style={{ fontSize: 26, margin: "0 0 16px" }}>Fix this entry</h2>
      <div style={{ display: "grid", gap: 14 }}>
        {isSale && (
          <div className="seg" role="radiogroup" aria-label="Paid or on credit">
            <button role="radio" aria-checked={!credit} onClick={() => setCredit(false)}>Paid now</button>
            <button role="radio" aria-checked={credit} onClick={() => setCredit(true)}>On credit</button>
          </div>
        )}
        {showWhat && <TextField label={row.kind === "expense" ? "What was it for?" : "What"} value={what} onChange={setWhat} placeholder="Pepper soup" />}
        {showQty && <TextField label="How many" value={qty} onChange={(v) => setQty(digits(v))} placeholder="1" />}
        {showAmount && <TextField label={isSale && qty && Number(qty) > 1 ? "Total amount (₦, for all of them)" : "Amount (₦)"} value={amount} onChange={(v) => setAmount(digits(v))} placeholder="5000" />}
        {showWho && <TextField label={credit ? "Who owes you" : row.kind === "payment_received" ? "Who paid" : "Customer (optional)"} value={who} onChange={setWho} placeholder="Blessing" />}
        {isSale && credit && (
          <div className="field">
            <label className="label" htmlFor="due">Pays on (optional)</label>
            <div className="input-wrap"><input id="due" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
          </div>
        )}
      </div>
      {err && <p role="alert" style={{ color: "var(--care-text)", margin: "12px 4px 0" }}>{err}</p>}
      <div style={{ display: "grid", gap: 8, marginTop: 20 }}>
        <Button block onClick={save} disabled={busy}>{busy ? "One moment" : "Save"}</Button>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Button kind="secondary" small onClick={() => setConfirm(true)}>Remove</Button>
          <Button kind="ghost" small onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </>
  );
}
