"use client";
import { useState } from "react";
import { Button, Icon, Sheet } from "@/components/ui";
import { buildExport, download } from "@/lib/export";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Her records are hers: take them away, or delete everything. */
export function YourData({ open, onClose, sb, shopName }: { open: boolean; onClose: () => void; sb: SupabaseClient; shopName: string | null }) {
  const [busy, setBusy] = useState<"csv" | "json" | "delete" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function close() { setConfirm(false); setNote(null); setErr(null); onClose(); }
  const stamp = new Date().toLocaleDateString("en-CA");

  async function get(kind: "csv" | "json") {
    setBusy(kind); setNote(null); setErr(null);
    try {
      const x = await buildExport(sb);
      if (kind === "csv") download(`spal-records-${stamp}.csv`, x.csv, "text/csv;charset=utf-8");
      else download(`spal-everything-${stamp}.json`, x.json, "application/json");
      setNote(x.count ? `Downloaded ${x.count} ${x.count === 1 ? "entry" : "entries"}.` : "You have no entries yet, but your file is ready.");
    } catch { setErr("I couldn't prepare that. Please try again."); }
    setBusy(null);
  }

  async function remove() {
    setBusy("delete"); setErr(null);
    try {
      const { data: { session } } = await sb.auth.getSession();
      const r = await fetch("/api/account/delete", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` }, body: JSON.stringify({ confirm: true }) });
      if (!r.ok) throw new Error(String(r.status));
      await sb.auth.signOut().catch(() => {});
      try { localStorage.clear(); indexedDB.deleteDatabase("spal-outbox"); } catch {}
      window.location.href = "/";
    } catch {
      setBusy(null);
      setErr("I couldn't delete everything just now. Nothing was lost. Please try again, or write to us.");
    }
  }

  return (
    <Sheet open={open} onClose={close} title="Your data">
      {confirm ? (
        <>
          <h2 className="head" style={{ fontSize: 26, margin: "0 0 8px" }}>Delete everything?</h2>
          <p className="label" style={{ margin: "0 0 12px", fontSize: 17 }}>This removes {shopName ? `${shopName}, ` : ""}all your sales, debts, customers, recordings and your photo, and signs you out. It cannot be undone.</p>
          <p className="label" style={{ margin: "0 0 20px", fontSize: 17 }}>If you want a copy first, go back and download it.</p>
          {err && <p role="alert" style={{ color: "var(--care-text)", margin: "0 0 12px" }}>{err}</p>}
          <div style={{ display: "grid", gap: 8 }}>
            <Button block onClick={remove} disabled={busy === "delete"}>{busy === "delete" ? "Deleting" : "Yes, delete everything"}</Button>
            <Button kind="ghost" block onClick={() => setConfirm(false)} disabled={busy === "delete"}>Go back</Button>
          </div>
        </>
      ) : (
        <>
          <h2 className="head" style={{ fontSize: 28, margin: "0 0 8px" }}>Your data</h2>
          <p className="label" style={{ margin: "0 0 16px", fontSize: 17 }}>Everything you told Spal is yours. Take a copy any time.</p>
          <div style={{ display: "grid", gap: 8 }}>
            <Button block kind="secondary" onClick={() => get("csv")} disabled={!!busy}>{busy === "csv" ? "One moment" : "Download my records (Excel)"}</Button>
            <Button block kind="secondary" onClick={() => get("json")} disabled={!!busy}>{busy === "json" ? "One moment" : "Download everything"}</Button>
          </div>
          {note && <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--good-text)", marginTop: 12, fontWeight: 600 }}><Icon name="check" size={20} />{note}</div>}
          {err && <p role="alert" style={{ color: "var(--care-text)", margin: "12px 0 0" }}>{err}</p>}
          <p className="label" style={{ margin: "28px 0 8px" }}>Leaving Spal</p>
          <Button block kind="ghost" onClick={() => setConfirm(true)}>Delete my account and data</Button>
        </>
      )}
    </Sheet>
  );
}
