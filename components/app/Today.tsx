"use client";
import { useCallback, useEffect, useState } from "react";
import { Button, DeltaPill, Icon, ListRow, Orb, Roll, Sheet, Surface, TabBar, TextField, type Place } from "@/components/ui";
import { naira } from "@/lib/format";
import { salesKobo, spentKobo, type Ev } from "@/lib/money";
import type { Shop } from "@/lib/supabase";
import { supabaseBrowser } from "@/lib/supabase";
import { useTheme, type ThemeMode } from "@/lib/theme";

function greeting(h: number) {
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

type Reply = { captureId: string; note: string; lines: string[]; question: string | null; status: "parsed" | "needs_answer" | "failed" };
type Owing = { name: string; kobo: number };

export function Today({ shop }: { shop: Shop }) {
  const { mode, setMode } = useTheme();
  const [place, setPlace] = useState<Place>("today");
  const [talk, setTalk] = useState(false);
  const [profile, setProfile] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<Reply | null>(null);
  const [answer, setAnswer] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [events, setEvents] = useState<Ev[]>([]);
  const [owing, setOwing] = useState<Owing[]>([]);
  const [hour, setHour] = useState(12);
  useEffect(() => setHour(new Date().getHours()), []);

  const first = (shop.owner_name ?? "").split(/\s+/)[0] || "there";
  const mood = hour >= 19 ? "evening" : "normal";
  const sb = supabaseBrowser();

  const refresh = useCallback(async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const [{ data: ev }, { data: debts }, { data: custs }] = await Promise.all([
      sb.from("event").select("kind, amount_kobo, occurred_at").gte("occurred_at", start.toISOString()),
      sb.from("debt").select("customer_id, owed_kobo"),
      sb.from("customer").select("id, name"),
    ]);
    setEvents((ev ?? []) as Ev[]);
    const names = new Map((custs ?? []).map((c) => [c.id as string, c.name as string]));
    setOwing(((debts ?? []) as { customer_id: string; owed_kobo: number }[]).map((d) => ({ name: names.get(d.customer_id) ?? "Someone", kobo: Number(d.owed_kobo) })).sort((a, b) => b.kobo - a.kobo));
  }, [sb]);
  useEffect(() => { refresh(); }, [refresh]);

  async function send(text: string, context?: string) {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setErr(null);
    const { data: cap, error } = await sb.from("capture").insert({ shop_id: shop.id, kind: "text", text_content: t }).select("id").single();
    if (error || !cap) { setBusy(false); setErr("I couldn't keep that. Please try again."); return; }
    setNote("");
    setAnswer("");
    setTalk(false);
    try {
      const { data: { session } } = await sb.auth.getSession();
      const r = await fetch("/api/parse", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` }, body: JSON.stringify({ capture_id: cap.id, context }) });
      const j = await r.json();
      if (!r.ok || j.status === "failed") setReply({ captureId: cap.id, note: t, lines: [], question: null, status: "failed" });
      else setReply({ captureId: cap.id, note: t, lines: j.lines ?? [], question: j.question ?? null, status: j.status });
    } catch {
      setReply({ captureId: cap.id, note: t, lines: [], question: null, status: "failed" });
    }
    setBusy(false);
    refresh();
  }

  async function undo() {
    if (!reply) return;
    await sb.from("event").delete().eq("capture_id", reply.captureId);
    await sb.from("capture").update({ status: "new" }).eq("id", reply.captureId);
    setReply(null);
    setTalk(true);
    refresh();
  }

  async function chooseTheme(m: ThemeMode) {
    setMode(m);
    await sb.from("shop").update({ theme: m }).eq("id", shop.id); // ignored until the theme column exists
  }

  const sales = salesKobo(events);
  const spent = spentKobo(events);
  const hasToday = events.length > 0;

  return (
    <main data-mood={mood} style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: 140 }}>
      <div className="mood-field" style={{ padding: "20px 24px 8px" }}>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="icon-btn" aria-label="Profile" onClick={() => setProfile(true)}><Icon name="user" /></button>
        </div>
        {place === "today" ? (
          <>
            <h1 className="head" style={{ fontSize: 40, margin: "8px 0 0" }}>{greeting(hour)}, {first}</h1>
            <div style={{ display: "grid", placeItems: "center", padding: "16px 0 8px" }}>
              <Orb tone={mood === "evening" ? "indigo" : "lilac"} size={hasToday ? 150 : 190} state={busy ? "thinking" : "idle"} />
            </div>
          </>
        ) : (
          <h1 className="head" style={{ fontSize: 40, margin: "8px 0 24px" }}>My business</h1>
        )}
      </div>

      <div style={{ padding: "8px 16px", maxWidth: 560, margin: "0 auto", display: "grid", gap: 12 }}>
        {place === "today" ? (
          <>
            {reply && (
              <Surface>
                {reply.status === "failed" ? (
                  <>
                    <p style={{ margin: 0, fontSize: 20, fontWeight: 500, lineHeight: 1.35 }}>I kept your note, but I couldn't read it just now. I'll try again in a moment.</p>
                    <div style={{ marginTop: 12 }}><Button kind="ghost" small onClick={() => setReply(null)}>OK</Button></div>
                  </>
                ) : reply.lines.length === 0 && reply.question ? (
                  <>
                    <p style={{ margin: 0, fontSize: 20, fontWeight: 500, lineHeight: 1.35 }}>{reply.question}</p>
                    <div style={{ marginTop: 16 }}><TextField value={answer} onChange={setAnswer} placeholder="Type here" onSubmit={() => send(answer, `${reply.note} | Spal asked: ${reply.question}`)} /></div>
                    <div style={{ marginTop: 12, display: "grid" }}><Button onClick={() => send(answer, `${reply.note} | Spal asked: ${reply.question}`)} disabled={!answer.trim() || busy}>{busy ? "One moment" : "Send"}</Button></div>
                  </>
                ) : (
                  <>
                    <p className="label" style={{ margin: 0 }}>Got it</p>
                    <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                      {reply.lines.map((l, i) => <p key={i} style={{ margin: 0, fontSize: 20, fontWeight: 500, lineHeight: 1.35 }}>{l}</p>)}
                    </div>
                    {reply.question && <p className="label" style={{ margin: "12px 0 0", fontSize: 16 }}>{reply.question}</p>}
                    <div style={{ marginTop: 12 }}><Button kind="ghost" small onClick={undo}>Not right? Undo</Button></div>
                  </>
                )}
              </Surface>
            )}

            {hasToday ? (
              <Surface>
                <span className="label">Today so far</span>
                <div className="num" style={{ fontSize: 64, marginTop: 14 }}><Roll prefix="₦" value={Math.round(sales / 100)} /></div>
                {spent > 0 && <div style={{ marginTop: 14 }}><DeltaPill tone="flat">Spent {naira(spent)}</DeltaPill></div>}
              </Surface>
            ) : !reply ? (
              <Surface>
                <p style={{ margin: 0, fontSize: 20, fontWeight: 500, lineHeight: 1.35 }}>
                  I'm here to help {shop.name ?? "your shop"} sell more. When you make a sale today, just tell me.
                </p>
              </Surface>
            ) : null}

            {owing.length > 0 && (
              <Surface>
                <span className="label">Owing you</span>
                <div style={{ marginTop: 4 }}>
                  {owing.slice(0, 3).map((o) => <ListRow key={o.name} label={o.name} value={<span style={{ color: "var(--care-text)", fontWeight: 600 }}>{naira(o.kobo)}</span>} chevron={false} />)}
                </div>
              </Surface>
            )}
          </>
        ) : (
          <Surface>
            <ListRow label="Shop" value={shop.name ?? ""} chevron={false} />
            <ListRow label="Sells" value={shop.sells ?? ""} chevron={false} />
            <ListRow label="Owing you" value={naira(owing.reduce((s, o) => s + o.kobo, 0))} chevron={false} />
          </Surface>
        )}
      </div>

      <div style={{ position: "fixed", left: 0, right: 0, bottom: 16, padding: "0 24px", maxWidth: 560, margin: "0 auto", zIndex: 20 }}>
        <TabBar place={place} onPlace={setPlace} onTalk={() => setTalk(true)} />
      </div>

      <Sheet open={talk} onClose={() => setTalk(false)} title="Tell Spal">
        <h2 className="head" style={{ fontSize: 26, margin: "0 0 16px" }}>What happened?</h2>
        <TextField value={note} onChange={setNote} onSubmit={() => send(note)} placeholder="Sold two tins of milk, ₦4,500" autoFocus />
        {err && <p role="alert" style={{ color: "var(--care-text)", margin: "12px 4px 0" }}>{err}</p>}
        <div style={{ marginTop: 16 }}><Button block onClick={() => send(note)} disabled={!note.trim() || busy}>{busy ? "One moment" : "Tell Spal"}</Button></div>
      </Sheet>

      <Sheet open={profile} onClose={() => setProfile(false)} title="Profile">
        <h2 className="head" style={{ fontSize: 26, margin: "0 0 4px" }}>{shop.owner_name}</h2>
        <p className="label" style={{ margin: "0 0 12px" }}>{shop.name}</p>
        <p className="label" style={{ margin: "16px 0 4px" }}>Theme</p>
        {(["light", "dark", "auto"] as ThemeMode[]).map((m) => (
          <button key={m} className="row" onClick={() => chooseTheme(m)}>
            <span>{m === "auto" ? "Auto (follows your phone)" : m[0].toUpperCase() + m.slice(1)}</span>
            {mode === m && <Icon name="check" size={22} />}
          </button>
        ))}
      </Sheet>
    </main>
  );
}
