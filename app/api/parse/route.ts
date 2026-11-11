import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { naira } from "@/lib/format";

export const runtime = "nodejs";
export const maxDuration = 30;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

const KINDS = ["sale", "expense", "credit_sale", "payment_received", "stock_note", "day_total"] as const;
type Kind = (typeof KINDS)[number];

type Parsed = {
  events: { kind: Kind; amount_naira: number | null; unit_price_naira: number | null; quantity: number | null; item: string | null; customer: string | null; due_date: string | null; note: string | null; confidence: number }[];
  question: string | null;
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["events", "question"],
  properties: {
    events: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "amount_naira", "unit_price_naira", "quantity", "item", "customer", "due_date", "note", "confidence"],
        properties: {
          kind: { type: "string", enum: [...KINDS] },
          amount_naira: { type: ["number", "null"] },
          unit_price_naira: { type: ["number", "null"] },
          quantity: { type: ["number", "null"] },
          item: { type: ["string", "null"] },
          customer: { type: ["string", "null"] },
          due_date: { type: ["string", "null"] },
          note: { type: ["string", "null"] },
          confidence: { type: "number" },
        },
      },
    },
    question: { type: ["string", "null"] },
  },
} as const;

const SYSTEM = `You turn a shop owner's note into records for her shop books. She writes or speaks casually, in English or Nigerian Pidgin. Amounts are Nigerian naira. "k" means thousand (40k = 40000) and "m" means million.

Rules:
- Record only what she said. Never invent amounts, names, items or dates.
- sale: money received now for goods. If she gives one total for several items, return ONE sale event with that total, no item, and list the items in note (for example "2 milk, 1 sugar"). If she gives a separate price for each item, return one event per item.
- credit_sale: someone took goods and will pay later ("on credit", "she go pay Friday", "owes me"). Set due_date (YYYY-MM-DD) only if she names a day or date, resolved against today's date given below; otherwise null.
- payment_received: a customer pays money they owed from before.
- expense: money she spent. Put what it was for in note as a short noun phrase ("fuel", "transport", "stock from the market"), never a sentence and never the verb she used.
- day_total: she gives only an overall figure for the day ("I made about 40k today").
- stock_note: a fact about stock with no money ("milk is running low", "restocked rice").
- Never do arithmetic. Use amount_naira exactly as she said it. If she gives only a unit price and a quantity, fill unit_price_naira and quantity and leave amount_naira null.
- customer: if she means someone in the known customers list, use that exact name. Otherwise use the name as she said it. Leave null if she names nobody.
- If you cannot tell the amount, or the note is not about the shop at all, return no events and ONE short friendly question (under 15 words, same style she writes in). Do not ask about things you can leave out such as the customer or the items.
- confidence is 0 to 1: how sure you are that you read the amount and meaning right.`;

const lagosToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit", weekday: "long" }).formatToParts(new Date());

function todayLine() {
  const p = Object.fromEntries(lagosToday().map((x) => [x.type, x.value]));
  return `${p.weekday} ${p.year}-${p.month}-${p.day}`;
}

const clean = (s: string | null | undefined) => (s ?? "").trim();
const norm = (s: string) => s.trim().toLowerCase();

function fmtDue(d: string) {
  const dt = new Date(d + "T12:00:00Z");
  if (Number.isNaN(dt.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(dt);
}

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { capture_id?: string; context?: string } | null;
  if (!body?.capture_id) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  // Every read and write below runs as the signed-in shop (row-level security applies).
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: capture } = await sb.from("capture").select("id, shop_id, text_content, transcript").eq("id", body.capture_id).maybeSingle();
  if (!capture) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const note = clean(capture.text_content) || clean(capture.transcript);
  if (!note) return NextResponse.json({ error: "empty" }, { status: 400 });

  const [{ data: shop }, { data: customers }, { data: items }] = await Promise.all([
    sb.from("shop").select("owner_name, name, sells").eq("id", capture.shop_id).maybeSingle(),
    sb.from("customer").select("id, name, aliases").eq("shop_id", capture.shop_id).limit(300),
    sb.from("item").select("id, name, aliases").eq("shop_id", capture.shop_id).limit(300),
  ]);

  const userMsg = [
    `Today is ${todayLine()} (Lagos time).`,
    `Shop: ${shop?.name ?? "unknown"}; she sells: ${shop?.sells ?? "unknown"}.`,
    `Known customers: ${(customers ?? []).map((c) => c.name).join(", ") || "none yet"}.`,
    `Known items: ${(items ?? []).map((i) => i.name).join(", ") || "none yet"}.`,
    body.context ? `Earlier note and your question: ${body.context}\nHer answer:` : "Her note:",
    note,
  ].join("\n");

  let parsed: Parsed;
  try {
    const client = new Anthropic();
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> } },
      system: SYSTEM,
      messages: [{ role: "user", content: userMsg }],
    });
    if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") throw new Error(`stop:${res.stop_reason}`);
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") throw new Error("no text");
    parsed = JSON.parse(text.text) as Parsed;
  } catch (e) {
    console.error("parse failed", e instanceof Error ? e.message : e);
    await sb.from("capture").update({ status: "failed" }).eq("id", capture.id);
    return NextResponse.json({ status: "failed" }, { status: 502 });
  }

  // Validate. Money is computed here, never by the model.
  type Row = { kind: Kind; amount_kobo: number | null; quantity: number | null; customer: string; item: string; due_date: string | null; note: string | null; confidence: number };
  const rows: Row[] = [];
  for (const e of parsed.events ?? []) {
    if (!KINDS.includes(e.kind)) continue;
    let naira$ = e.amount_naira;
    if (naira$ == null && e.unit_price_naira != null && e.quantity != null) naira$ = e.unit_price_naira * e.quantity;
    const needsMoney = e.kind !== "stock_note";
    if (needsMoney && (naira$ == null || !Number.isFinite(naira$) || naira$ <= 0 || naira$ > 1_000_000_000)) continue;
    rows.push({
      kind: e.kind,
      amount_kobo: naira$ == null ? null : Math.round(naira$ * 100),
      quantity: e.quantity != null && e.quantity > 0 ? e.quantity : null,
      customer: clean(e.customer),
      item: clean(e.item),
      due_date: e.due_date && /^\d{4}-\d{2}-\d{2}$/.test(e.due_date) ? e.due_date : null,
      note: clean(e.note) || null,
      confidence: Math.min(1, Math.max(0, e.confidence ?? 0.5)),
    });
  }

  const question = clean(parsed.question);
  if (!rows.length) {
    await sb.from("capture").update({ status: "needs_answer" }).eq("id", capture.id);
    return NextResponse.json({ status: "needs_answer", lines: [], question: question || "Sorry, I didn't catch that. How much was it?" });
  }

  // Match or create customers and items.
  const custIndex = new Map<string, string>();
  for (const c of customers ?? []) [c.name, ...(c.aliases ?? [])].forEach((n: string) => custIndex.set(norm(n), c.id));
  const itemIndex = new Map<string, string>();
  for (const i of items ?? []) [i.name, ...(i.aliases ?? [])].forEach((n: string) => itemIndex.set(norm(n), i.id));

  async function resolve(table: "customer" | "item", index: Map<string, string>, name: string) {
    if (!name) return null;
    const hit = index.get(norm(name));
    if (hit) return hit;
    const { data } = await sb.from(table).insert({ shop_id: capture!.shop_id, name }).select("id").single();
    if (data) index.set(norm(name), data.id);
    return data?.id ?? null;
  }

  const out: Record<string, unknown>[] = [];
  const lines: string[] = [];
  for (const r of rows) {
    const customer_id = await resolve("customer", custIndex, r.customer);
    const item_id = await resolve("item", itemIndex, r.item);
    out.push({ shop_id: capture.shop_id, capture_id: capture.id, kind: r.kind, amount_kobo: r.amount_kobo, customer_id, item_id, quantity: r.quantity, due_date: r.due_date, note: r.note, confidence: r.confidence });
    const amt = r.amount_kobo != null ? naira(r.amount_kobo) : "";
    const who = r.customer;
    const what = r.item ? ` (${r.quantity ? r.quantity + " " : ""}${r.item})` : r.note && r.kind === "sale" ? ` (${r.note})` : "";
    lines.push(
      r.kind === "sale" ? `Sale${who ? " to " + who : ""}, ${amt}${what}`
        : r.kind === "credit_sale" ? `${amt} on credit${who ? " for " + who : ""}${r.due_date ? ", due " + fmtDue(r.due_date) : ""}${what}`
        : r.kind === "payment_received" ? `${who || "A customer"} paid ${amt}`
        : r.kind === "expense" ? `Spent ${amt}${r.note ? " on " + r.note : ""}`
        : r.kind === "day_total" ? `About ${amt} for the day`
        : `Noted: ${r.note ?? r.item ?? "stock"}`,
    );
  }

  const { error: insErr } = await sb.from("event").insert(out);
  if (insErr) {
    console.error("event insert failed", insErr.message);
    await sb.from("capture").update({ status: "failed" }).eq("id", capture.id);
    return NextResponse.json({ status: "failed" }, { status: 500 });
  }
  const names = rows.map((r) => r.customer).filter(Boolean);
  if (names.length) await sb.from("customer").update({ last_seen_at: new Date().toISOString() }).in("id", out.map((o) => o.customer_id as string).filter(Boolean));
  await sb.from("capture").update({ status: "parsed" }).eq("id", capture.id);

  return NextResponse.json({ status: "parsed", lines, question: question || null });
}
