"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Aura, Button, DeltaPill, Icon, ListRow, Sheet, Toggle, Surface, TabBar, TalkButton, TextField, type Place } from "@/components/ui";
import { parseCapture, sendNote, sendPhoto, undoNote, type Reply } from "@/lib/capture";
import { flush, newId, phoneStore, type NewItem, type OutboxItem } from "@/lib/outbox";
import { clockLabel, dayKey, forDay, keyOf, learnCloseMinutes, minutesOf, salesOf, spentOf, timeOf, type DayEvent, type Summary } from "@/lib/day";
import { reportError } from "@/lib/report";
import { readablePhoto, squarePhoto } from "@/lib/image";
import { naira } from "@/lib/format";
import type { Shop } from "@/lib/supabase";
import { supabaseBrowser } from "@/lib/supabase";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { micMessage, transcribe, useVoice } from "@/lib/voice";
import { Chat } from "./Chat";
import { bumpNotes, cueFor, introDone, setupSpeech, speakWhenAllowed, isNewOwner, micKnown, rememberMic, replyToSay, setSpeak, speak, speakOn, stopSpeaking, unlockSpeech } from "@/lib/speak";
import { Closing } from "./Closing";
import { ReminderCard } from "./Reminder";
import { draftReminder, reminderTitle } from "@/lib/reminders";
import { draftWinBack, lapsedRegulars, winBackTitle, type Visit } from "@/lib/regulars";
import { SaveAccount } from "./SaveAccount";
import { SetPassword } from "./SetPassword";
import { Feedback } from "./Feedback";
import { YourData } from "./YourData";
import { DaySheet, type Tab } from "./DaySheet";
import { CardStack, type CardId, type StackCard } from "./Cards";
import { ProfileReminders, ReminderPrompt, useReminders } from "./Reminders";

let greeted = false; // once per page load
const greeting = (h: number) => (h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");
const DEFAULT_CLOSE_MIN = 18 * 60; // until Spal has learned her habit

type Owing = { name: string; kobo: number };
type Close = { day: string; total_kobo: number | null; summary: string | null };
type Remind = { kind?: "debt_reminder" | "win_back"; proposalId: string; customerId: string; name: string; phone: string | null; title: string; draft: string };

export function Today({ shop, offline = false }: { shop: Shop; offline?: boolean }) {
  const { mode, setMode } = useTheme();
  const sb = supabaseBrowser();
  const [place, setPlace] = useState<Place>("today");
  const [talk, setTalk] = useState(false);
  const [starting, setStarting] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [intro, setIntro] = useState(false);
  const [speaksOn, setSpeaksOn] = useState(false);
  const [voiceTest, setVoiceTest] = useState<"" | "playing" | "silent" | "ok">("");
  useEffect(() => { setSpeaksOn(speakOn()); }, []);
  const [detailTab, setDetailTab] = useState<Tab | undefined>(undefined);
  const [owedOpen, setOwedOpen] = useState(false);
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
  const [detail, setDetail] = useState<string | null>(null);
  const [custNames, setCustNames] = useState<Map<string, string>>(new Map());
  const [avatar, setAvatar] = useState<string | null>(shop.avatar ?? null);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [closeMin, setCloseMin] = useState<number>(minutesOf(shop.usual_close_time) ?? DEFAULT_CLOSE_MIN);
  const [learned, setLearned] = useState(minutesOf(shop.usual_close_time) != null);
  const [remind, setRemind] = useState<Remind | null>(null);
  const creating = useRef(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const startedAt = useRef(0);
  const heard = useRef(false);
  const [nudge, setNudge] = useState("");
  const [reading, setReading] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [queued, setQueued] = useState(0);
  const [online, setOnline] = useState(true);
  const flushing = useRef(false);
  const [talkMode, setTalkMode] = useState<"voice" | "text">("text");
  const [now, setNow] = useState(() => new Date());
  const getToken = useCallback(async () => (await sb.auth.getSession()).data.session?.access_token ?? "", [sb]);
  const voice = useVoice(getToken);
  // If she taps and then says nothing, say so in plain words. Shown, not spoken: Spal's voice would be recorded.
  useEffect(() => {
    if (voice.state !== "recording") { setNudge(""); return; }
    const a = setTimeout(() => { if (!heard.current) setNudge("I'm listening. Go ahead and speak."); }, 7000);
    const b = setTimeout(() => { if (!heard.current) setNudge("I can't hear you yet. Hold the phone closer, or tap Type instead."); }, 20000);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [voice.state]);
  useEffect(() => { if (voice.level > 0.08) { heard.current = true; setNudge(""); } }, [voice.level]);
  const reminders = useReminders(sb, shop.id, getToken);
  useEffect(() => setNow(new Date()), []);

  const hour = now.getHours();
  const todayKey = dayKey(now);
  const first = (shop.owner_name ?? "").split(/\s+/)[0] || "there";

  const refresh = useCallback(async () => {
    const since = new Date();
    since.setDate(since.getDate() - 14);
    since.setHours(0, 0, 0, 0);
    const props = new Date();
    props.setDate(props.getDate() - 15);
    const [{ data: ev }, { data: debts }, { data: custs }, { data: items }, { data: dc }, { data: props_ }, { data: credits }, { data: visitsRaw }] = await Promise.all([
      sb.from("event").select("kind, amount_kobo, occurred_at, item_id, quantity").gte("occurred_at", since.toISOString()),
      sb.from("debt").select("customer_id, owed_kobo, next_due"),
      sb.from("customer").select("id, name, phone"),
      sb.from("item").select("id, name"),
      sb.from("day_close").select("day, total_kobo, summary").order("day", { ascending: false }).limit(3),
      sb.from("proposal").select("id, customer_id, kind, draft_text, status, created_at").in("kind", ["debt_reminder", "win_back"]).gte("created_at", props.toISOString()),
      sb.from("event").select("customer_id, note, item_id").eq("kind", "credit_sale").order("occurred_at", { ascending: false }).limit(200),
      sb.from("event").select("customer_id, occurred_at, item_id").in("kind", ["sale", "credit_sale"]).not("customer_id", "is", null).gte("occurred_at", new Date(Date.now() - 120 * 86_400_000).toISOString()).limit(3000),
    ]);
    setRecent((ev ?? []) as DayEvent[]);
    const names = new Map((custs ?? []).map((c) => [c.id as string, c.name as string]));
    setOwing(((debts ?? []) as { customer_id: string; owed_kobo: number }[]).map((d) => ({ name: names.get(d.customer_id) ?? "Someone", kobo: Number(d.owed_kobo) })).sort((a, b) => b.kobo - a.kobo));
    setItemNames(new Map((items ?? []).map((i) => [i.id as string, i.name as string])));
    setCustNames(names);
    setCloses((dc ?? []) as Close[]);
    setLoaded(true);

    // Spal's first offer to act: a debt that is due. One at a time, never the same person twice in a day.
    const todayK = dayKey(new Date());
    const phones = new Map((custs ?? []).map((c) => [c.id as string, (c.phone as string | null) ?? null]));
    const due = ((debts ?? []) as { customer_id: string; owed_kobo: number; next_due: string | null }[])
      .filter((d) => d.next_due && d.next_due <= todayK && Number(d.owed_kobo) > 0)
      .sort((a, b) => Number(b.owed_kobo) - Number(a.owed_kobo));
    const proposals = (props_ ?? []) as { id: string; customer_id: string; kind: string; draft_text: string | null; status: string; created_at: string }[];
    const itemMap = new Map((items ?? []).map((i) => [i.id as string, i.name as string]));
    let next: Remind | null = null;
    for (const d of due) {
      const name = names.get(d.customer_id) ?? "Someone";
      const mine = proposals.filter((p) => p.customer_id === d.customer_id && p.kind === "debt_reminder");
      const pending = mine.find((p) => p.status === "pending");
      const handledToday = mine.some((p) => p.status !== "pending" && keyOf(p.created_at) === todayK);
      if (handledToday) continue;
      const args = { name, owedKobo: Number(d.owed_kobo), dueDate: d.next_due as string, todayKey: todayK };
      if (pending) { next = { kind: "debt_reminder", proposalId: pending.id, customerId: d.customer_id, name, phone: phones.get(d.customer_id) ?? null, title: reminderTitle(args), draft: pending.draft_text ?? "" }; break; }
      if (creating.current) break;
      creating.current = true;
      const c = ((credits ?? []) as { customer_id: string; note: string | null; item_id: string | null }[]).find((x) => x.customer_id === d.customer_id);
      const forWhat = c?.item_id ? itemMap.get(c.item_id) : c?.note;
      const draft = draftReminder({ ...args, shop: shop.name ?? "", forWhat });
      const { data: row } = await sb.from("proposal").insert({ shop_id: shop.id, kind: "debt_reminder", customer_id: d.customer_id, draft_text: draft }).select("id").single();
      creating.current = false;
      if (row) next = { kind: "debt_reminder", proposalId: row.id as string, customerId: d.customer_id, name, phone: phones.get(d.customer_id) ?? null, title: reminderTitle(args), draft };
      break;
    }

    // No debt to chase: is a regular overdue a visit? One gentle offer at a time, and never the same person twice in two weeks.
    if (!next && !creating.current) {
      const owingSet = new Set(((debts ?? []) as { customer_id: string; owed_kobo: number }[]).filter((d) => Number(d.owed_kobo) > 0).map((d) => d.customer_id));
      const lapsed = lapsedRegulars((visitsRaw ?? []) as Visit[], new Date(), owingSet);
      const winProps = proposals.filter((p) => p.kind === "win_back");
      const pendingWin = winProps.find((p) => p.status === "pending" && lapsed.some((l) => l.customerId === p.customer_id));
      const pick = pendingWin ? lapsed.find((l) => l.customerId === pendingWin.customer_id) : lapsed.find((l) => !winProps.some((p) => p.customer_id === l.customerId));
      if (pick) {
        const name = names.get(pick.customerId) ?? "Someone";
        const title = winBackTitle(name, pick.daysSince);
        if (pendingWin) next = { kind: "win_back", proposalId: pendingWin.id, customerId: pick.customerId, name, phone: phones.get(pick.customerId) ?? null, title, draft: pendingWin.draft_text ?? "" };
        else {
          creating.current = true;
          const draft = draftWinBack({ name, shop: shop.name ?? "", item: pick.topItemId ? itemMap.get(pick.topItemId) : null });
          const { data: row } = await sb.from("proposal").insert({ shop_id: shop.id, kind: "win_back", customer_id: pick.customerId, draft_text: draft }).select("id").single();
          creating.current = false;
          if (row) next = { kind: "win_back", proposalId: row.id as string, customerId: pick.customerId, name, phone: phones.get(pick.customerId) ?? null, title, draft };
        }
      }
    }
    setRemind(next);
  }, [sb, shop.id, shop.name]);
  useEffect(() => { refresh(); }, [refresh]);

  // ---- No signal: keep her words on the phone and send them, in order, when it comes back ----
  const refreshQueue = useCallback(async () => { try { setQueued((await phoneStore.all()).length); } catch { /* storage unavailable */ } }, []);

  const keepForLater = useCallback(async (item: NewItem) => {
    try { await phoneStore.put({ ...item, id: newId(), at: new Date().toISOString() } as OutboxItem); } catch { /* storage unavailable */ }
    await refreshQueue();
  }, [refreshQueue]);

  const flushQueue = useCallback(async () => {
    if (flushing.current || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
    flushing.current = true;
    try {
      const out = await flush(phoneStore, async (it) => {
        const giveUp = async () => { // not a signal problem: try a few times, then stop so one bad note never blocks the rest
          const tries = ((it as { tries?: number }).tries ?? 0) + 1;
          if (tries >= 5) return "done" as const;
          await phoneStore.put({ ...it, tries });
          return "retry" as const;
        };
        if (it.kind === "parse") {
          const rep = await parseCapture(sb, it.captureId, it.text, it.context);
          return rep.offline ? "retry" : "done";
        }
        let text = it.text ?? "";
        if (!text && it.blob) {
          const t = await transcribe(it.blob, await getToken().catch(() => ""));
          if ("error" in t) return t.error === "offline" || t.error === "limited" ? "retry" : t.error === "empty" ? "done" : giveUp();
          text = t.text;
        }
        if (!text.trim()) return "done";
        const res = await sendNote(sb, shop.id, text, it.context, it.blob ? { blob: it.blob } : undefined, it.at);
        if (res.offline) return "retry";
        if (res.keepFailed) return giveUp();
        if (res.reply?.offline) { await phoneStore.put({ id: newId(), kind: "parse", at: it.at, captureId: res.reply.captureId, text: res.reply.note, context: it.context }); }
        return "done";
      });
      await refreshQueue();
      if (out.sent > 0) refresh();
    } finally { flushing.current = false; }
  }, [sb, shop.id, getToken, refresh, refreshQueue]);

  useEffect(() => {
    setOnline(navigator.onLine);
    refreshQueue().then(flushQueue);
    const on = () => { setOnline(true); flushQueue(); };
    const off = () => setOnline(false);
    const vis = () => { if (document.visibilityState === "visible") flushQueue(); };
    window.addEventListener("online", on); window.addEventListener("offline", off); document.addEventListener("visibilitychange", vis);
    const t = setInterval(flushQueue, 30_000);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); document.removeEventListener("visibilitychange", vis); clearInterval(t); };
  }, [refreshQueue, flushQueue]);
  const noSignal = offline || !online;
  useEffect(() => {
    sb.auth.getUser().then(({ data }) => { setAnonymous(!!data.user?.is_anonymous); setEmail(data.user?.email ?? null); });
  }, [sb]);

  const today = forDay(recent, todayKey);
  const sales = salesOf(today);
  const spent = spentOf(today);
  const hasToday = today.length > 0;
  const closedToday = closes.find((c) => c.day === todayKey);
  const lastClose = closes.find((c) => c.day < todayKey);
  const evening = hour * 60 + now.getMinutes() >= closeMin;
  const mood = evening ? "evening" : "normal";

  // Spal speaks first: a greeting once each time the app is opened. If the phone blocks sound until a tap, it waits for her first touch.
  useEffect(() => { setupSpeech(getToken, (what, ctx) => { reportError(sb, shop.id, what, ctx, navigator.userAgent); }); }, [getToken, sb, shop.id]);
  useEffect(() => {
    if (!loaded || greeted || !speakOn()) return;
    greeted = true;
    const g = `${greeting(hour)}, ${first}.`;
    const line = evening && !closedToday ? `${g} How did sales go today?`
      : hasToday && sales > 0 ? `${g} You've sold ${naira(sales)} so far today.`
      : isNewOwner() ? `${g} How was your day? Tap the green button to tell me, or tap Chat with Spal to ask me anything.`
      : lastClose?.total_kobo ? `${g} Yesterday was ${naira(lastClose.total_kobo)}. Let's beat it today.`
      : `${g} How's business today?`;
    speakWhenAllowed(line);
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(text: string, context?: string, voiceBlob?: Blob) {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setErr(null);
    const { reply: r, keepFailed, offline: gone } = await sendNote(sb, shop.id, t, context, voiceBlob ? { blob: voiceBlob } : undefined);
    setBusy(false);
    if (gone) { await keepForLater({ kind: "note", text: t, blob: voiceBlob, context }); setNote(""); setAnswer(""); setTalk(false); setReply(null); return; }
    if (keepFailed || !r) { setErr("I couldn't keep that. Please try again."); return; }
    if (r.offline) { await keepForLater({ kind: "parse", captureId: r.captureId, text: r.note, context }); setNote(""); setAnswer(""); setTalk(false); setReply(null); return; }
    setNote(""); setAnswer(""); setTalk(false); setReply(r);
    bumpNotes();
    if (speakOn()) { const s = replyToSay(r); if (s) speak(s); }
    refresh();
  }

  /** The big button: start listening, or stop and send what she said. She sees Spal react the instant she taps. */
  async function onTalk() {
    if (voice.state === "recording") {
      if (Date.now() - startedAt.current < 1500) return; // an accidental double tap must not end the recording
      return stopAndSend();
    }
    if (voice.state === "transcribing" || busy || starting) return;
    setErr(null);
    stopSpeaking();
    unlockSpeech();
    setTalk(true);
    if (!voice.supported) { setTalkMode("text"); return; }
    setTalkMode("voice");
    setStarting(true);
    // The first few times, Spal says how it works, then starts listening. Spoken before the mic opens so it is not recorded.
    const cue = speakOn() && micKnown() ? cueFor() : null;
    if (cue) { introDone(); setIntro(true); await speak(cue); setIntro(false); }
    const r = await voice.start();
    setStarting(false);
    if (r === "ok") { rememberMic(); startedAt.current = Date.now(); heard.current = false; try { navigator.vibrate?.(40); } catch { /* not every phone */ } } // a small buzz says "now"
    else { setTalkMode("text"); setErr(micMessage(r)); reportError(sb, shop.id, "Microphone could not start", { reason: r, error: voice.lastError.current }, navigator.userAgent); }
  }

  async function stopAndSend() {
    if (speakOn() && heard.current) speak("Got it."); // answers the tap at once; the full reply follows when it is ready
    const r = await voice.finish();
    if ("error" in r && r.error === "offline" && r.blob) { await keepForLater({ kind: "note", blob: r.blob }); setTalk(false); setTalkMode("text"); return; }
    if ("error" in r) {
      if (r.error === "empty") { setErr("I didn't hear anything. Tap the green button, wait for \"I'm listening\", then say it."); setTalk(false); setTalkMode("text"); return; }
      setErr(r.error === "limited" ? "That's a lot of talking for one day. You can still type to me." : "I couldn't hear that. You can type it instead.");
      setTalkMode("text");
      return;
    }
    await send(r.text, undefined, r.blob);
  }

  /** A photo of her notebook, a receipt or a list, from the camera or the gallery. */
  async function addPhoto(file?: File) {
    if (!file || busy) return;
    voice.cancel(); stopSpeaking(); unlockSpeech();
    setTalk(false); setTalkMode("text"); setErr(null); setReply(null);
    if (!online || offline) { setErr("I need signal to read a photo. Try again when you're back online."); return; }
    setBusy(true); setReading(true);
    if (speakOn()) speak("Let me read that.");
    const blob = await readablePhoto(file).catch(() => null);
    if (!blob) { setBusy(false); setReading(false); setErr("I couldn't open that photo. Please try another one."); return; }
    const res = await sendPhoto(sb, shop.id, blob);
    setBusy(false); setReading(false);
    if (!res.reply) { setErr(res.failed === "offline" ? "I need signal to read a photo. Try again when you're back online." : "I couldn't keep that photo. Please try again."); return; }
    setReply(res.reply);
    if (res.reply.status !== "failed") bumpNotes();
    if (speakOn()) { const s = replyToSay(res.reply); if (s) speak(s); }
    refresh();
  }
  const pickPhoto = () => { voice.cancel(); setTalkMode("text"); setTalk(false); photoInput.current?.click(); };

  function closeTalk() {
    voice.cancel();
    setTalk(false);
  }

  async function reminderSent(r: Remind, f: { text: string; edited: boolean; phone: string | null }) {
    if (f.phone && f.phone !== r.phone) await sb.from("customer").update({ phone: f.phone }).eq("id", r.customerId);
    await sb.from("proposal").update({ status: f.edited ? "edited" : "approved", draft_text: f.text, decided_at: new Date().toISOString() }).eq("id", r.proposalId);
  }

  async function reminderLater(r: Remind) {
    await sb.from("proposal").update({ status: "declined", decided_at: new Date().toISOString() }).eq("id", r.proposalId);
    setRemind(null);
  }

  async function undo() {
    if (!reply) return;
    await undoNote(sb, reply.captureId);
    setReply(null);
    setTalk(true);
    setTalkMode("text");
    refresh();
  }

  async function closeDay(s: Summary) {
    await sb.from("day_close").upsert({ shop_id: shop.id, day: todayKey, summary: s.text, total_kobo: s.total }, { onConflict: "shop_id,day" });
    // Learn her habit: the middle of when she closed on her last few days.
    const { data: last } = await sb.from("day_close").select("closed_at").order("day", { ascending: false }).limit(7);
    const found = learnCloseMinutes((last ?? []).map((c) => c.closed_at as string));
    if (found != null && found !== closeMin) {
      setCloseMin(found);
      setLearned(true);
      await sb.from("shop").update({ usual_close_time: timeOf(found) }).eq("id", shop.id);
    }
    setClosing(false);
    setReply(null);
    refresh();
    // She has something worth keeping now. Ask once a day at most.
    let asked = false;
    try { asked = localStorage.getItem("spal-save-asked") === todayKey; } catch {}
    if (anonymous && !asked) {
      setSaveOpen(true);
      try { localStorage.setItem("spal-save-asked", todayKey); } catch {}
    }
  }

  async function changePhoto(file: File | undefined) {
    if (!file) return;
    setPhotoErr(null);
    setPhotoBusy(true);
    try {
      const data = await squarePhoto(file);
      const { error } = await sb.from("shop").update({ avatar: data }).eq("id", shop.id);
      if (error) throw error;
      setAvatar(data);
    } catch {
      setPhotoErr("I couldn't use that photo. Try another one.");
    }
    setPhotoBusy(false);
  }

  async function removePhoto() {
    setAvatar(null);
    await sb.from("shop").update({ avatar: null }).eq("id", shop.id);
  }

  async function chooseTheme(m: ThemeMode) {
    setMode(m);
    await sb.from("shop").update({ theme: m }).eq("id", shop.id); // ignored until the theme column exists
  }

  // Days she has recorded, newest first, for the History list in My business.
  const dayList = [...new Set(recent.map((e) => keyOf(e.occurred_at)))].sort().reverse().slice(0, 14).map((k) => ({ k, total: salesOf(forDay(recent, k)) }));
  const dayLabel = (k: string) => (k === todayKey ? "Today" : new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "short" }).format(new Date(k + "T12:00:00")));
  const initial = (shop.owner_name ?? "?").trim()[0]?.toUpperCase() ?? "?";

  const listening = voice.state === "recording";
  const nSales = today.filter((e) => e.kind === "sale" || e.kind === "credit_sale").length;
  const nSpent = today.filter((e) => e.kind === "expense").length;
  const owedTotal = owing.reduce((s, o) => s + o.kobo, 0);
  const owedSorted = [...owing].sort((a, b) => b.kobo - a.kobo);
  const cards: StackCard[] = [
    { id: "sold", label: "Sold today", kobo: sales, empty: "Nothing sold yet. Tell me when you sell.", lines: nSales ? [{ label: nSales === 1 ? "1 sale" : `${nSales} sales` }] : [] },
    { id: "spent", label: "Spent today", kobo: spent, empty: "Nothing spent yet.", lines: nSpent ? [{ label: nSpent === 1 ? "1 expense" : `${nSpent} expenses` }] : [] },
    { id: "owed", label: "Owed to you", kobo: owedTotal, empty: "Nobody owes you. Lovely.", lines: owedSorted.slice(0, 3).map((o) => ({ label: o.name, value: naira(o.kobo) })) },
  ];
  function openCard(id: CardId) {
    if (id === "owed") { setOwedOpen(true); return; }
    setDetailTab(id === "spent" ? "spent" : "sold");
    setDetail(todayKey);
  }

  const bigLine = { margin: 0, fontSize: 20, fontWeight: 500, lineHeight: 1.35 } as const;

  return (
    <main data-mood={mood} style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: 140 }}>
      <div className="mood-field" style={{ padding: "20px 24px 8px" }}>
        {place === "today" && <Aura tone={evening ? "indigo" : "lilac"} state={voice.state === "recording" ? "listening" : starting || busy || voice.state === "transcribing" ? "thinking" : "idle"} level={voice.level} />}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className={`icon-btn ${avatar ? "photo" : ""}`} aria-label="Profile" onClick={() => setProfile(true)}>
            {avatar ? <img src={avatar} alt="" className="avatar" width={48} height={48} /> : <Icon name="user" />}
          </button>
        </div>
        {place === "today" ? (
          <>
            <h1 className="head" style={{ fontSize: 40, margin: "8px 0 0" }}>{greeting(hour)}, {first}</h1>
            <div className="coach" style={{ minHeight: hasToday || owing.length ? 120 : 150 }} aria-live="polite">
              {listening ? (
                <>
                  <p className="coach-big">{nudge ? "Go ahead, I'm here" : "I'm listening"}</p>
                  <p className="coach-sub">{nudge || "Talk like you would to a friend. When you're done, tap the green button."}</p>
                  <div className="coach-actions">
                    <Button kind="secondary" small onClick={() => { voice.cancel(); setTalkMode("text"); }}>Type instead</Button>
                    <Button kind="secondary" small onClick={pickPhoto}>Add a photo</Button>
                  </div>
                </>
              ) : starting ? (
                <>
                  <p className="coach-big">{intro ? "Listen first…" : "One moment…"}</p>
                  {intro && <Button kind="secondary" small onClick={() => stopSpeaking()}>Skip</Button>}
                </>
              ) : busy || voice.state === "transcribing" ? (
                <p className="coach-big">{reading ? "Reading your photo…" : "Got it. Writing it down…"}</p>
              ) : (
                <>
                  {isNewOwner() && !reply && !hasToday && (
                    <>
                      <p className="coach-big">How was your day?</p>
                      <p className="coach-sub">Tap the big green button and tell me what you sold, what you spent, or who owes you.</p>
                    </>
                  )}
                  {err && !talk && <p className="coach-sub" role="alert" style={{ color: "var(--care-text)" }}>{err}</p>}
                  <div className="coach-actions">
                    <Button kind="secondary" small onClick={() => { setTalkMode("text"); setTalk(true); }}>Type instead</Button>
                    <Button kind="secondary" small onClick={pickPhoto}>Add a photo</Button>
                    <Button kind="secondary" small onClick={() => { stopSpeaking(); setChatOpen(true); }}>Chat with Spal</Button>
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <h1 className="head" style={{ fontSize: 40, margin: "8px 0 24px" }}>My business</h1>
        )}
      </div>

      <div style={{ padding: "8px 16px", maxWidth: 560, margin: "0 auto", display: "grid", gap: 12 }}>
        {place === "today" ? (
          <>
            {remind && (
              <ReminderCard key={remind.proposalId} title={remind.title} draft={remind.draft} name={remind.name} phone={remind.phone}
                onSent={(f) => reminderSent(remind, f)} onLater={() => reminderLater(remind)} />
            )}

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

            {closes.length > 0 && <ReminderPrompt r={reminders} />}

            {reply && (
              <Surface>
                {reply.status === "failed" ? (
                  <>
                    <p style={bigLine}>{reply.limited ? "That's a lot for one day. I've kept your note and we'll carry on tomorrow." : "I kept your note, but I couldn't read it just now."}</p>
                    <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                      {!reply.limited && <Button small disabled={busy} onClick={async () => { setBusy(true); const again = await parseCapture(sb, reply.captureId, reply.note, undefined, reply.heard); setBusy(false); setReply(again); refresh(); }}>{busy ? "One moment" : "Try again"}</Button>}
                      <Button kind="ghost" small onClick={() => setReply(null)}>OK</Button>
                    </div>
                  </>
                ) : (
                  <>
                    {reply.lines.length > 0 && (
                      <>
                        <p className="label" style={{ margin: 0 }}>{reply.changed ? "Fixed" : "Got it"}</p>
                        {reply.heard && <p className="label" style={{ margin: "4px 0 0", fontStyle: "italic" }}>{reply.photo ? "I read" : "I heard"}: “{reply.heard.length > 180 ? reply.heard.slice(0, 180) + "…" : reply.heard}”</p>}
                        <div style={{ marginTop: 8, display: "grid", gap: 6 }}>{reply.lines.map((l, i) => <p key={i} style={bigLine}>{l}</p>)}</div>
                      </>
                    )}
                    {reply.question && (
                      <div style={{ marginTop: reply.lines.length ? 16 : 0 }}>
                        <p style={bigLine}>{reply.question}</p>
                        {(reply.options?.length ?? 0) > 0 && (
                          <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {reply.options!.map((o) => <button key={o} className="chip choice" disabled={busy} onClick={() => send(o, `${reply.note} | Spal asked: ${reply.question}`)}>{o}</button>)}
                          </div>
                        )}
                        <div style={{ marginTop: 12 }}><TextField value={answer} onChange={setAnswer} placeholder={(reply.options?.length ?? 0) > 0 ? "Or say it your own way" : "Answer here, or tell me something else"} onSubmit={() => send(answer, `${reply.note} | Spal asked: ${reply.question}`)} /></div>
                        <div style={{ marginTop: 12, display: "grid" }}><Button onClick={() => send(answer, `${reply.note} | Spal asked: ${reply.question}`)} disabled={!answer.trim() || busy}>{busy ? "One moment" : "Send"}</Button></div>
                      </div>
                    )}
                    {reply.lines.length > 0 && (
                      <>
                        <p className="label" style={{ margin: "12px 0 0", fontSize: 15 }}>Something wrong? Just tell me what to change.</p>
                        <div style={{ marginTop: 4 }}><Button kind="ghost" small onClick={undo}>Undo</Button></div>
                      </>
                    )}
                  </>
                )}
              </Surface>
            )}

            {(noSignal || queued > 0) && (
              <Surface>
                <p style={bigLine}>{noSignal ? "No signal. You can still tell me things." : `${queued} ${queued === 1 ? "note is" : "notes are"} waiting to be read.`}</p>
                <p className="label" style={{ margin: "8px 0 0", fontSize: 16 }}>
                  {queued > 0 ? `${queued} ${queued === 1 ? "note is" : "notes are"} saved on your phone. I'll read ${queued === 1 ? "it" : "them"} as soon as you're back online.` : "I'll keep what you say on your phone and read it when you're back online."}
                </p>
              </Surface>
            )}

            {!noSignal && (hasToday || owing.length > 0) ? (
              <CardStack cards={cards} onOpen={openCard} />            ) : !noSignal && !reply && !evening ? (
              <Surface>
                <p style={bigLine}>
                  {lastClose?.total_kobo
                    ? `Yesterday was ${naira(lastClose.total_kobo)}. Let's beat it today.`
                    : `I'm here to help ${shop.name ?? "your shop"} sell more. When you make a sale today, just tell me.`}
                </p>
              </Surface>
            ) : null}

          </>
        ) : (
          <>
          <Surface>
            <ListRow label="Shop" value={shop.name ?? ""} chevron={false} />
            <ListRow label="Sells" value={shop.sells ?? ""} chevron={false} />
            <ListRow label="Owing you" value={naira(owing.reduce((s, o) => s + o.kobo, 0))} chevron={false} />
          </Surface>
          <Surface>
            <span className="label">Your days</span>
            <div style={{ marginTop: 4 }}>
              {dayList.length === 0 && <p className="label" style={{ margin: "12px 0 4px", fontSize: 17 }}>Nothing yet. Tell me about your first sale.</p>}
              {dayList.map((d) => <ListRow key={d.k} label={dayLabel(d.k)} value={d.total > 0 ? naira(d.total) : ""} onClick={() => { setDetailTab(undefined); setDetail(d.k); }} />)}
            </div>
          </Surface>
          </>
        )}
      </div>

      <div style={{ position: "fixed", left: 0, right: 0, bottom: 16, padding: "0 24px", maxWidth: 560, margin: "0 auto", zIndex: 20 }}>
        <TabBar place={place} onPlace={setPlace} listening={voice.state === "recording"} level={voice.level} onTalk={onTalk} />
      </div>

      <Sheet open={talk && talkMode === "text"} onClose={closeTalk} title="Tell Spal">
        <h2 className="head" style={{ fontSize: 26, margin: "0 0 6px" }}>What should I do?</h2>
        <p className="label" style={{ margin: "0 0 14px", fontSize: 17 }}>Tell me what you sold or spent, or who owes you. Or ask me to fix or remove something.</p>
        <TextField value={note} onChange={setNote} onSubmit={() => send(note)} placeholder="Sold two tins of milk, ₦4,500, or: delete the last record" autoFocus
          onMic={voice.supported ? async () => { setErr(null); const r = await voice.start(); if (r === "ok") { setTalkMode("voice"); } else setErr(micMessage(r)); } : undefined} />
        {err && <p role="alert" style={{ color: "var(--care-text)", margin: "12px 4px 0" }}>{err}</p>}
        <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
          <Button block onClick={() => send(note)} disabled={!note.trim() || busy}>{busy ? "One moment" : "Tell Spal"}</Button>
          <Button block kind="ghost" onClick={pickPhoto}>Add a photo of your notebook or receipt</Button>
        </div>
      </Sheet>
      <input ref={photoInput} type="file" accept="image/*" style={{ display: "none" }} aria-hidden="true" tabIndex={-1} onChange={(e) => { addPhoto(e.target.files?.[0]); e.target.value = ""; }} />

      <Chat open={chatOpen} onClose={() => setChatOpen(false)} getToken={getToken} first={first} />

      <Sheet open={owedOpen} onClose={() => setOwedOpen(false)} title="Owed to you">
        <h2 className="head" style={{ fontSize: 26, margin: "0 0 4px" }}>Owed to you</h2>
        <p className="num" style={{ fontSize: 40, margin: "0 0 12px" }}>{naira(owedTotal)}</p>
        {owedSorted.length === 0 ? <p className="label" style={{ fontSize: 17 }}>Nobody owes you right now.</p> : (
          <div>{owedSorted.map((o) => <ListRow key={o.name} label={o.name} value={<span style={{ color: "var(--care-text)", fontWeight: 600 }}>{naira(o.kobo)}</span>} chevron={false} />)}</div>
        )}
      </Sheet>

      <Sheet open={profile} onClose={() => setProfile(false)} title="Profile">
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
          {avatar ? <img src={avatar} alt="Your photo" className="avatar" width={72} height={72} /> : <div className="avatar-fallback" style={{ width: 72, height: 72, fontSize: 30 }}>{initial}</div>}
          <div style={{ minWidth: 0 }}>
            <h2 className="head" style={{ fontSize: 26, margin: "0 0 2px" }}>{shop.owner_name}</h2>
            <p className="label" style={{ margin: 0 }}>{shop.name}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <label className="btn btn-secondary btn-sm" style={{ cursor: "pointer" }}>
            {photoBusy ? "One moment" : avatar ? "Change photo" : "Add a photo"}
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { changePhoto(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {avatar && <Button kind="ghost" small onClick={removePhoto}>Remove</Button>}
        </div>
        {photoErr && <p role="alert" style={{ color: "var(--care-text)", margin: "4px 0 8px" }}>{photoErr}</p>}
        <ProfileReminders r={reminders} />
        <p className="label" style={{ margin: "16px 0 4px" }}>Spal's voice</p>
        <div className="row"><span>Spal talks back to me</span><Toggle checked={speaksOn} label="Spal talks back to me" onChange={(v) => { setSpeak(v); setSpeaksOn(v); if (!v) stopSpeaking(); }} /></div>
        <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
          <span>Hear Spal's voice{voiceTest === "silent" && <span className="label" style={{ display: "block", fontSize: 15, marginTop: 4 }}>Nothing played. Check the phone isn't on silent and the volume is up. Some phones can't do this, and Spal will keep showing everything in writing.</span>}</span>
          <Button kind="secondary" small disabled={voiceTest === "playing"} onClick={async () => { unlockSpeech(); setVoiceTest("playing"); const ok = await speak("Hello, I'm Spal. Can you hear me? Tap the green button and tell me about your day."); setVoiceTest(ok ? "ok" : "silent"); }}>{voiceTest === "playing" ? "Playing…" : "Play"}</Button>
        </div>
        <p className="label" style={{ margin: "16px 0 4px" }}>Your data</p>
        <button className="row" onClick={() => { setProfile(false); setDataOpen(true); }}><span>Download or delete my data</span><Icon name="chevron" size={20} /></button>
        <p className="label" style={{ margin: "16px 0 4px" }}>Help</p>
        <button className="row" onClick={() => { setProfile(false); setFeedbackOpen(true); }}><span>Something wrong? Tell us</span><Icon name="chevron" size={20} /></button>
        <a className="row" href="/privacy" style={{ textDecoration: "none", color: "inherit" }}><span>Privacy</span><Icon name="chevron" size={20} /></a>
        <a className="row" href="/terms" style={{ textDecoration: "none", color: "inherit" }}><span>Terms</span><Icon name="chevron" size={20} /></a>
        <p className="label" style={{ margin: "16px 0 4px" }}>Closing time</p>
        <div className="row"><span>About {clockLabel(closeMin)}</span><span className="label" style={{ fontSize: 14 }}>{learned ? "learned from you" : "until I learn"}</span></div>
        <p className="label" style={{ margin: "16px 0 4px" }}>Account</p>
        {anonymous ? (
          <button className="row" onClick={() => { setProfile(false); setSaveOpen(true); }}><span>Save my account</span><Icon name="chevron" size={20} /></button>
        ) : (
          <>
            <div className="row"><span>{email ?? "Saved"}</span><Icon name="check" size={22} /></div>
            <button className="row" onClick={() => { setProfile(false); setPwOpen(true); }}><span>Password</span><span className="value">Set or change <Icon name="chevron" size={20} /></span></button>
          </>
        )}
        <p className="label" style={{ margin: "16px 0 4px" }}>Theme</p>
        {(["light", "dark", "auto"] as ThemeMode[]).map((m) => (
          <button key={m} className="row" onClick={() => chooseTheme(m)}>
            <span>{m === "auto" ? "Auto (follows your phone)" : m[0].toUpperCase() + m.slice(1)}</span>
            {mode === m && <Icon name="check" size={22} />}
          </button>
        ))}
      </Sheet>

      <DaySheet open={detail !== null} onClose={() => setDetail(null)} sb={sb} shopId={shop.id} onChanged={refresh} startKey={detail ?? todayKey} startTab={detailTab} todayKey={todayKey} custNames={custNames} itemNames={itemNames} />

      <YourData open={dataOpen} onClose={() => setDataOpen(false)} sb={sb} shopName={shop.name} />

      <Feedback open={feedbackOpen} onClose={() => setFeedbackOpen(false)} sb={sb} shopId={shop.id} lastCaptureId={reply?.captureId ?? null} />

      <SetPassword open={pwOpen} onClose={() => setPwOpen(false)} sb={sb} email={email} />

      <SaveAccount open={saveOpen} onClose={() => setSaveOpen(false)} sb={sb} ownerFirst={first} />

      {closing && (
        <Closing sb={sb} getToken={getToken} shopId={shop.id} ownerFirst={first} today={today} recent={recent} todayKey={todayKey} itemNames={itemNames} owing={owing} refresh={refresh} onOffline={(t, b, c) => keepForLater({ kind: "note", text: t, blob: b, context: c })} onClose={() => setClosing(false)} onClosed={closeDay} />
      )}
    </main>
  );
}
