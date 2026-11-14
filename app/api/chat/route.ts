import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { naira } from "@/lib/format";

export const runtime = "nodejs";
export const maxDuration = 30;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
type Msg = { role: "user" | "assistant"; content: string };
type Ev = { kind: string; amount_kobo: number | null; occurred_at: string; item_id: string | null; quantity: number | null; customer_id: string | null; note: string | null };

const lagosDay = (iso: string | Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const lagosNow = () => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
const clock = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
const dayName = (k: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date(k + "T12:00:00Z"));

const GUIDE = `How Spal works (explain this simply when she asks how to use it):
- The big green button at the bottom: tap it once, say what happened ("I sold three bags of rice, forty five thousand"; "Blessing took bread on credit, three thousand"; "I bought fuel for three thousand"), tap it again when done. Spal saves it and says it back.
- "Type instead" lets her type the same thing. "Add a photo" lets her photograph a notebook page or receipt, from the camera or gallery.
- To fix or remove something, she just says so: "remove the pepper soup", "only three paid", "that was five thousand".
- The three cards on the home screen are Sold today, Spent today and Owed to you. Tap a card at the back to bring it forward, tap the front card to see every entry behind the number.
- Every change has an Undo right after it. Closing the day: in the evening Spal asks how the day went.
- Reminders: Spal can remind her about debts and quiet regulars and opens WhatsApp with the message ready; she taps send, nothing goes out without her.
- Her profile (the person icon, top right): photo, theme, reminders, Spal's voice on or off, download or delete her data.`;

const SYSTEM = `You are Spal, a warm, friendly assistant for a small shop owner in Nigeria. You talk with her like a trusted shop assistant talking with her boss: natural, kind, brief, never robotic. She may write in English or Pidgin; answer in the language she uses.

This is CHAT: you do not record or change anything here. If she tells you about a sale, expense or debt, say warmly that you'll save it if she taps the big green button and tells you, so it goes in her book.

You can talk about her shop using ONLY the facts given below, and about running a small business in general (stock, pricing, customers, saving, how to follow up a debt politely). Rules:
- Reply in one to three short sentences, plain words, no lists, no markdown, no emojis. Your reply may be read aloud.
- Quote numbers only as given below. Never add up or calculate new totals; if she needs a figure that is not below, say you can't give it exactly and suggest tapping the card on her home screen.
- Never invent sales, customers, debts or dates. If you don't know, say so.
- Money: write amounts like ₦4,500.
- If she is stressed or just chatting, be kind first, business second.
- If she asks how to use Spal, use the guide below.

${GUIDE}`;

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { messages?: Msg[] } | null;
  const messages = (body?.messages ?? []).filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim()).slice(-12).map((m) => ({ role: m.role, content: m.content.slice(0, 800) }));
  if (!messages.length || messages[messages.length - 1].role !== "user") return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: within, error: limErr } = await sb.rpc("bump_usage", { p_kind: "chat", p_max: 80 });
  if (limErr) console.warn("usage limit not active:", limErr.message);
  else if (within === false) return NextResponse.json({ error: "limited" }, { status: 429 });

  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data: shop }, { data: evs }, { data: items }, { data: custs }, { data: debts }] = await Promise.all([
    sb.from("shop").select("id, owner_name, name, sells").limit(1).maybeSingle(),
    sb.from("event").select("kind, amount_kobo, occurred_at, item_id, quantity, customer_id, note").gte("occurred_at", since).order("occurred_at", { ascending: false }).limit(800),
    sb.from("item").select("id, name").limit(300),
    sb.from("customer").select("id, name").limit(300),
    sb.from("debt").select("customer_id, owed_kobo").limit(300),
  ]);
  if (!shop) return NextResponse.json({ error: "no_shop" }, { status: 404 });

  const itemName = new Map((items ?? []).map((i) => [i.id as string, i.name as string]));
  const custName = new Map((custs ?? []).map((c) => [c.id as string, c.name as string]));
  const events = (evs ?? []) as Ev[];
  const isSale = (e: Ev) => e.kind === "sale" || e.kind === "credit_sale";
  const today = lagosDay(new Date());
  const byDay = new Map<string, { sold: number; spent: number; n: number }>();
  for (const e of events) {
    const k = lagosDay(e.occurred_at);
    const d = byDay.get(k) ?? { sold: 0, spent: 0, n: 0 };
    if (isSale(e)) { d.sold += e.amount_kobo ?? 0; d.n++; }
    if (e.kind === "expense") d.spent += e.amount_kobo ?? 0;
    byDay.set(k, d);
  }
  const days = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 7);
  const t = byDay.get(today) ?? { sold: 0, spent: 0, n: 0 };
  const todays = events.filter((e) => lagosDay(e.occurred_at) === today).reverse().slice(-25).map((e) => {
    const what = e.item_id ? `${e.quantity ?? 1} x ${itemName.get(e.item_id)}` : e.note ?? "";
    const who = e.customer_id ? ` (${custName.get(e.customer_id)})` : "";
    return `- ${clock(e.occurred_at)} ${e.kind} ${e.amount_kobo != null ? naira(e.amount_kobo) : ""} ${what}${who}`.trim();
  });
  const itemTotals = new Map<string, number>();
  for (const e of events) if (isSale(e) && e.item_id) itemTotals.set(e.item_id, (itemTotals.get(e.item_id) ?? 0) + (e.amount_kobo ?? 0));
  const top = [...itemTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, v]) => `${itemName.get(id)} ${naira(v)}`);
  const owed = ((debts ?? []) as { customer_id: string; owed_kobo: number }[]).filter((d) => Number(d.owed_kobo) > 0).sort((a, b) => Number(b.owed_kobo) - Number(a.owed_kobo));
  const owedTotal = owed.reduce((s, d) => s + Number(d.owed_kobo), 0);

  const facts = [
    `It is ${lagosNow()} (Lagos).`,
    `Her name: ${shop.owner_name ?? "unknown"}. Shop: ${shop.name ?? "unknown"}. She sells: ${shop.sells ?? "unknown"}.`,
    `Today so far: sold ${naira(t.sold)} in ${t.n} sales; spent ${naira(t.spent)}.`,
    todays.length ? `Today's records:\n${todays.join("\n")}` : "Nothing recorded today yet.",
    days.length ? `Recent days:\n${days.map(([k, d]) => `- ${dayName(k)}: sold ${naira(d.sold)} (${d.n} sales), spent ${naira(d.spent)}`).join("\n")}` : "No earlier days yet.",
    top.length ? `Top sellers, last 30 days: ${top.join("; ")}.` : "",
    owed.length ? `Owed to her, total ${naira(owedTotal)}: ${owed.slice(0, 10).map((d) => `${custName.get(d.customer_id) ?? "Someone"} ${naira(Number(d.owed_kobo))}`).join("; ")}.` : "Nobody owes her anything right now.",
  ].filter(Boolean).join("\n");

  try {
    const client = new Anthropic();
    const res = await client.beta.messages.create({
      model: MODEL, max_tokens: 500, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      output_config: { effort: "low" },
      system: `${SYSTEM}\n\nFACTS ABOUT HER SHOP (the only numbers you may quote):\n${facts}`,
      messages,
    });
    const text = res.content.find((b) => b.type === "text");
    const reply = text && text.type === "text" ? text.text.trim() : "";
    if (!reply) throw new Error("empty");
    return NextResponse.json({ reply });
  } catch (e) {
    console.error("chat failed", e instanceof Error ? e.message.slice(0, 200) : e);
    return NextResponse.json({ error: "failed" }, { status: 502 });
  }
}
