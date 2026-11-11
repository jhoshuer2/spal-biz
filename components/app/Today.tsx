"use client";
import { useCallback, useEffect, useState } from "react";
import { Button, DeltaPill, Icon, ListRow, Orb, Roll, Sheet, Surface, TabBar, TextField, type Place } from "@/components/ui";
import { sendNote, undoNote, type Reply } from "@/lib/capture";
import { dayKey, forDay, salesOf, spentOf, type DayEvent, type Summary } from "@/lib/day";
import { naira } from "@/lib/format";
import type { Shop } from "@/lib/supabase";
import { supabaseBrowser } from "@/lib/supabase";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { Closing } from "./Closing";

const greeting = (h: number) => (h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");
const CLOSING_FROM_HOUR = 18;

type Owing = { name: string; kobo: number };
type Close = { day: string; total_kobo: number | null; summary: string | null };

export function Today({ shop }: { shop: Shop }) {
  const { mode, setMode } = useTheme();
  const sb = supabaseBrowser();
  const [place, setPlace] = useState<Place>("today");
  const [talk, setTalk] = useState(false);
  const [profile, setProfile] = useState(false);
  const [closing, setClosing] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<Reply | null>(null);
  const [answer, setAnswer] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [recent, setRecent] = useState<DayEvent[]>([]);
  const [owing, setOwing] = useState<Owing[]>([]);
  const [itemNames, setItemNames] = useState<Map<string, string>>(new Map());
  const [closes, setCloses] = useState<Close[]>([]);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => setNow(new Date()), []);

  const hour = now.getHours();
  const todayKey = dayKey(now);
  const first = (shop.owner_name ?? "").split(/\s+/)[0] || "there";

  const refresh = useCallback(async () => {
    const since = new Date();
    since.setDate(since.getDate() - 14);
    since.setHours(0, 0, 0, 0);
    const [{ data: ev }, { data: debts }, { data: custs }, { data: items }, { data: dc }] = await Promise.all([
      sb.from("event").select("kind, amount_kobo, occurred_at, item_id, quantity").gte("occurred_at", since.toISOString()),
      sb.from("debt").select("customer_id, owed_kobo"),
      sb.from("customer").select("id, name"),
      sb.from("item").select("id, name"),
      sb.from("day_close").select("day, total_kobo, summary").order("day", { ascending: false }).limit(3),
    ]);
    setRecent((ev ?? []) as DayEvent[]);
    const names = new Map((custs ?? []).map((c) => [c.id as string, c.name as string]));
    setOwing(((debts ?? []) as { customer_id: string; owed_kobo: number }[]).map((d) => ({ name: names.get(d.customer_id) ?? "Someone", kobo: Number(d.owed_kobo) })).sort((a, b) => b.kobo - a.kobo));
    setItemNames(new Map((items ?? []).map((i) => [i.id as string, i.name as string])));
    setCloses((dc ?? []) as Close[]);
  }, [sb]);
  useEffect(() => { refresh(); }, [refresh]);

  const today = forDay(recent, todayKey);
  const sales = salesOf(today);
  const spent = spentOf(today);
  const hasToday = today.length > 0;
  const closedToday = closes.find((c) => c.day === todayKey);
  const lastClose = closes.find((c) => c.day < todayKey);
  const evening = hour >= CLOSING_FROM_HOUR;
  const mood = evening ? "evening" : "normal";

  async function send(text: string, context?: string) {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setErr(null);
    const { reply: r, keepFailed } = await sendNote(sb, shop.id, t, context);
    setBusy(false);
    if (keepFailed || !r) { setErr("I couldn't keep that. Please try again."); return; }
    setNote(""); setAnswer(""); setTalk(false); setReply(r);
    refresh();
  }

  async function undo() {
    if (!reply) return;
    await undoNote(sb, reply.captureId);
    setReply(null);
    setTalk(true);
    refresh();
  }

  async function closeDay(s: Summary) {
    await sb.from("day_close").upsert({ shop_id: shop.id, day: todayKey, summary: s.text, total_kobo: s.total }, { onConflict: "shop_id,day" });
    setClosing(false);
    setReply(null);
    refresh();
  }

  async function chooseTheme(m: ThemeMode) {
    setMode(m);
    await sb.from("shop").update({ theme: m }).eq("id", shop.id); // ignored until the theme column exists
  }

  const bigLine = { margin: 0, fontSize: 20, fontWeight: 500, lineHeight: 1.35 } as const;

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
              <Orb tone={evening ? "indigo" : "lilac"} size={hasToday ? 150 : 190} state={busy ? "thinking" : "idle"} />
            </div>
          </>
        ) : (
          <h1 className="head" style={{ fontSize: 40, margin: "8px 0 24px" }}>My business</h1>
        )}
      </div>

      <div style={{ padding: "8px 16px", maxWidth: 560, margin: "0 auto", display: "grid", gap: 12 }}>
        {place === "today" ? (
          <>
            {/* Spal speaks first: closing in the evening */}
            {evening && !closedToday && (
              <Surface>
                <p style={bigLine}>Ready to close? Did I miss anything?</p>
                <div style={{ marginTop: 16, display: "grid" }}><Button onClick={() => setClosing(true)}>Close the day</Button></div>
              </Surface>
            )}
            {closedToday && (
              <Surface>
                <span className="label">Day closed</span>
                <p style={{ ...bigLine, marginTop: 8 }}>{closedToday.summary}</p>
                <div style={{ marginTop: 12 }}><Button kind="ghost" small onClick={() => setClosing(true)}>Add something I missed</Button></div>
              </Surface>
            )}

            {reply && (
              <Surface>
                {reply.status === "failed" ? (
                  <>
                    <p style={bigLine}>I kept your note, but I couldn't read it just now. I'll try again in a moment.</p>
                    <div style={{ marginTop: 12 }}><Button kind="ghost" small onClick={() => setReply(null)}>OK</Button></div>
                  </>
                ) : reply.lines.length === 0 && reply.question ? (
                  <>
                    <p style={bigLine}>{reply.question}</p>
                    <div style={{ marginTop: 16 }}><TextField value={answer} onChange={setAnswer} placeholder="Type here" onSubmit={() => send(answer, `${reply.note} | Spal asked: ${reply.question}`)} /></div>
                    <div style={{ marginTop: 12, display: "grid" }}><Button onClick={() => send(answer, `${reply.note} | Spal asked: ${reply.question}`)} disabled={!answer.trim() || busy}>{busy ? "One moment" : "Send"}</Button></div>
                  </>
                ) : (
                  <>
                    <p className="label" style={{ margin: 0 }}>Got it</p>
                    <div style={{ marginTop: 8, display: "grid", gap: 6 }}>{reply.lines.map((l, i) => <p key={i} style={bigLine}>{l}</p>)}</div>
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
            ) : !reply && !evening ? (
              <Surface>
                <p style={bigLine}>
                  {lastClose?.total_kobo
                    ? `Yesterday was ${naira(lastClose.total_kobo)}. Let's beat it today.`
                    : `I'm here to help ${shop.name ?? "your shop"} sell more. When you make a sale today, just tell me.`}
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

      {closing && (
        <Closing sb={sb} shopId={shop.id} ownerFirst={first} today={today} recent={recent} todayKey={todayKey} itemNames={itemNames} owing={owing} refresh={refresh} onClose={() => setClosing(false)} onClosed={closeDay} />
      )}
    </main>
  );
}
