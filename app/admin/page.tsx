"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";

type Report = { id: string; kind: "error" | "feedback"; message: string; context: Record<string, unknown>; user_agent: string | null; created_at: string; shop: string | null };
type Shop = { id: string; shop: string; joined: string; notes: number; activeDays: number; last: string | null; closedDays: number; failed: number; voice: number; saved: boolean; winBacksSent: number; winBacksWorked: number };
type Data = { stats: Record<string, number>; reports: Report[]; pilot: Shop[] };
const ago = (iso: string | null) => { if (!iso) return "never"; const h = (Date.now() - new Date(iso).getTime()) / 3.6e6; return h < 1 ? "just now" : h < 24 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago`; };

const LABELS: [string, string][] = [
  ["shops", "Shops"], ["shopsThisWeek", "New this week"], ["activeLast24h", "Active today"], ["closedLast24h", "Closed a day today"],
  ["notes7d", "Notes (7 days)"], ["parsed7d", "Understood"], ["failed7d", "Couldn't read"], ["voice7d", "Voice notes"], ["errors7d", "App errors"],
];

/** For Joshua only. Shows how the pilot is going and what is going wrong. */
export default function Admin() {
  const [data, setData] = useState<Data | null>(null);
  const [msg, setMsg] = useState("One moment");
  const [filter, setFilter] = useState<"all" | "error" | "feedback">("all");

  useEffect(() => {
    (async () => {
      const sb = supabaseBrowser();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { setMsg("Sign in to Spal first, then come back to this page."); return; }
      const r = await fetch("/api/admin/summary", { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (r.status === 403) { setMsg("This page is only for the person running Spal."); return; }
      if (r.status === 503) { const j = await r.json().catch(() => ({})); setMsg(j.error === "wrong_service_key" ? `SUPABASE_SERVICE_ROLE_KEY in Vercel is the wrong key (${j.kind}). In Supabase go to Settings, API Keys, and copy the service_role (secret) key, then redeploy.` : "Not set up yet: add ADMIN_EMAIL and SUPABASE_SERVICE_ROLE_KEY in Vercel."); return; }
      if (!r.ok) { setMsg("Couldn't load."); return; }
      setData(await r.json());
    })();
  }, []);

  if (!data) return <main style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}><p className="label" style={{ fontSize: 17 }}>{msg}</p></main>;
  const rows = data.reports.filter((r) => filter === "all" || r.kind === filter);
  const rate = data.stats.notes7d ? Math.round((data.stats.failed7d / data.stats.notes7d) * 100) : 0;

  return (
    <main style={{ padding: "24px 16px 64px", maxWidth: 720, margin: "0 auto" }}>
      <meta name="robots" content="noindex" />
      <h1 className="head" style={{ fontSize: 32, margin: "0 0 16px" }}>Spal, behind the scenes</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10 }}>
        {LABELS.map(([k, l]) => (
          <div key={k} className="surface" style={{ padding: 14 }}>
            <div className="label" style={{ fontSize: 13 }}>{l}</div>
            <div className="num" style={{ fontSize: 32, marginTop: 6 }}>{data.stats[k]}</div>
          </div>
        ))}
      </div>
      <p className="label" style={{ margin: "12px 4px 0" }}>{rate}% of this week's notes couldn't be read.</p>

      <h2 className="head" style={{ fontSize: 22, margin: "32px 0 4px" }}>Owners</h2>
      <p className="label" style={{ margin: "0 0 8px", fontSize: 15 }}>The question for the pilot: did she record on day 1, and come back on day 2?</p>
      {data.pilot.length === 0 && <p className="label" style={{ fontSize: 17 }}>No shops yet.</p>}
      {data.pilot.map((p) => {
        const back = p.activeDays >= 2;
        return (
          <div key={p.id} className="surface" style={{ marginTop: 10, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
              <strong style={{ fontSize: 18 }}>{p.shop}</strong>
              <span className="pill" style={{ background: back ? "var(--good-fill)" : p.notes ? "var(--care-fill)" : "var(--surface-2)", color: back ? "var(--good-text)" : p.notes ? "var(--care-text)" : "var(--ink-2)" }}>{back ? "Came back" : p.notes ? "Day 1 only" : "No notes"}</span>
            </div>
            <p className="label" style={{ margin: "6px 0 0", fontSize: 14 }}>Joined {ago(p.joined)} · last active {ago(p.last)} · {p.saved ? "account saved" : "not saved yet"}</p>
            <p style={{ margin: "8px 0 0", fontSize: 16 }}>{p.notes} notes on {p.activeDays} {p.activeDays === 1 ? "day" : "days"} · {p.closedDays} days closed · {p.voice} voice · {p.failed} couldn't read{p.winBacksSent ? ` · win-backs: ${p.winBacksSent} sent, ${p.winBacksWorked} came back` : ""}</p>
          </div>
        );
      })}

      <div className="seg" role="radiogroup" aria-label="Show" style={{ margin: "24px 0 8px" }}>
        {(["all", "error", "feedback"] as const).map((f) => <button key={f} role="radio" aria-checked={filter === f} onClick={() => setFilter(f)}>{f === "all" ? "All" : f === "error" ? "Errors" : "Feedback"}</button>)}
      </div>
      {rows.length === 0 && <p className="label" style={{ fontSize: 17 }}>Nothing yet.</p>}
      {rows.map((r) => (
        <div key={r.id} className="surface" style={{ marginTop: 10, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }} className="label">
            <span style={{ color: r.kind === "error" ? "var(--care-text)" : "var(--good-text)", fontWeight: 600 }}>{r.kind === "error" ? "Error" : "Feedback"}{r.shop ? ` · ${r.shop}` : ""}</span>
            <span>{new Date(r.created_at).toLocaleString("en-GB")}</span>
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 17, wordBreak: "break-word" }}>{r.message}</p>
          <p className="label" style={{ margin: "8px 0 0", fontSize: 13, wordBreak: "break-all" }}>{JSON.stringify(r.context)}{r.user_agent ? ` · ${r.user_agent}` : ""}</p>
        </div>
      ))}
    </main>
  );
}
