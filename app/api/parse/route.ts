import Anthropic from "@anthropic-ai/sdk";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { naira } from "@/lib/format";
import { actionKobo, changedFields, describe, describeRow, noonLagos, recordsList, rescaleKobo, type EventRow } from "@/lib/records";

export const runtime = "nodejs";
export const maxDuration = 30;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const KINDS = ["sale", "expense", "credit_sale", "payment_received", "stock_note", "day_total"] as const;
type Kind = (typeof KINDS)[number];

type Action = {
  op: "add" | "update" | "delete"; target: string | null; kind: Kind | null;
  amount_naira: number | null; unit_price_naira: number | null; quantity: number | null;
  item: string | null; customer: string | null; due_date: string | null; note: string | null; occurred_on: string | null; confidence: number;
};
type Parsed = { actions: Action[]; question: string | null };

const nullable = (t: string) => ({ type: [t, "null"] });
const SCHEMA = {
  type: "object", additionalProperties: false, required: ["actions", "question"],
  properties: {
    actions: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["op", "target", "kind", "amount_naira", "unit_price_naira", "quantity", "item", "customer", "due_date", "note", "occurred_on", "confidence"],
        properties: {
          op: { type: "string", enum: ["add", "update", "delete"] },
          target: nullable("string"),
          kind: { type: ["string", "null"], enum: [...KINDS, null] },
          amount_naira: nullable("number"), unit_price_naira: nullable("number"), quantity: nullable("number"),
          item: nullable("string"), customer: nullable("string"), due_date: nullable("string"), note: nullable("string"), occurred_on: nullable("string"),
          confidence: { type: "number" },
        },
      },
    },
    question: nullable("string"),
  },
} as const;

const SYSTEM = `You keep the books for a small shop owner, from notes she types or speaks, in English or Nigerian Pidgin. Amounts are Nigerian naira: "k" means thousand (40k = 40000) and "m" means million.

You can add new records AND fix or remove records that are already saved, the way a good shop assistant goes back to the book when told something was wrong. You are given her recent records, each with an id such as r1. Her note is NEW information, a CORRECTION of something already saved, or both.

Actions (return a list):
- add: a new record.
- update: change a saved record. Set target to its id. Fill in ONLY the fields that change and leave every other field null.
- delete: remove a saved record she says was wrong, a duplicate, or should not be there. Set target.
Use update or delete, never a second add, when she is fixing something already saved ("I meant", "that was wrong", "change it to", "only three paid", "remove that", "last Tuesday's ..."). If she corrects what she just told you, that is the newest record. Use the dates and times to find the right record, including older days. If you cannot tell which record she means, ask.

Record kinds: sale (money received now), credit_sale (took goods and will pay later; it MUST name the customer, so the debt can be tracked), payment_received (a customer pays money they owed from before), expense (money she spent), day_total (only an overall figure for the day), stock_note (a fact about stock, no money).

Rules:
- Record only what she said. Never invent amounts, names, items or dates.
- Never do arithmetic. Give amount_naira exactly as said, as the total for that record. Or give unit_price_naira and quantity and leave amount_naira null, and the system will multiply.
- If a price comes with a number of people or items and she does not say whether the price is each or in total ("sold pepper soup to four people for 5,000"), do not guess. Ask one short question: is it each, or all together?
- If some buyers paid and some owe, make separate records: one sale for those who paid (quantity = how many), and a credit_sale for each person who owes. If she has not said who owes, record the paid part and ask who owes. Never put calculated amounts in a question.
- One total for several different items: one sale with that total, no item, and the items listed in note ("2 milk, 1 sugar"). A separate price for each item: one record per item.
- For an expense, note is what it was for, as a short noun phrase ("fuel", "transport"), never a sentence.
- customer: if she means someone in the known customers list, use that exact name. Otherwise the name as she said it. Null if nobody is named.
- If she is telling you about an earlier day ("yesterday", "last Tuesday", a date), set occurred_on (YYYY-MM-DD) on added records. Otherwise null.
- Ask at most ONE short friendly question (under 15 words, in her own style) when you cannot tell the amount, which record she means, or anything above. You may return actions and a question together when part of her note is clear. If her note is not about the shop at all, return no actions and ask what she meant.
- confidence is 0 to 1: how sure you are you read it right.`;

const lagosToday = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit", weekday: "long" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.weekday} ${p.year}-${p.month}-${p.day}`;
};
const clean = (s: string | null | undefined) => (s ?? "").trim();
const norm = (s: string) => s.trim().toLowerCase();

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { capture_id?: string; context?: string } | null;
  if (!body?.capture_id) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  // Every read and write below runs as the signed-in shop (row-level security applies).
  const sb: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: within, error: limErr } = await sb.rpc("bump_usage", { p_kind: "parse", p_max: 150 });
  if (limErr) console.warn("usage limit not active:", limErr.message);
  else if (within === false) return NextResponse.json({ status: "limited" }, { status: 429 });

  const { data: capture } = await sb.from("capture").select("id, shop_id, text_content, transcript").eq("id", body.capture_id).maybeSingle();
  if (!capture) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const note = (clean(capture.text_content) || clean(capture.transcript)).slice(0, 1500);
  if (!note) return NextResponse.json({ error: "empty" }, { status: 400 });
  const shopId = capture.shop_id as string;

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const [{ data: shop }, { data: customers }, { data: items }, { data: recentRaw }] = await Promise.all([
    sb.from("shop").select("owner_name, name, sells").eq("id", shopId).maybeSingle(),
    sb.from("customer").select("id, name, aliases").eq("shop_id", shopId).limit(300),
    sb.from("item").select("id, name, aliases").eq("shop_id", shopId).limit(300),
    sb.from("event").select("*").eq("shop_id", shopId).gte("occurred_at", since).order("occurred_at", { ascending: false }).limit(80),
  ]);

  const custName = new Map((customers ?? []).map((c) => [c.id as string, c.name as string]));
  const itemName = new Map((items ?? []).map((i) => [i.id as string, i.name as string]));
  const { text: recordsText, byRef } = recordsList((recentRaw ?? []) as EventRow[], custName, itemName);

  const userMsg = [
    `Today is ${lagosToday()} (Lagos time).`,
    `Shop: ${shop?.name ?? "unknown"}; she sells: ${shop?.sells ?? "unknown"}.`,
    `Known customers: ${(customers ?? []).map((c) => c.name).join(", ") || "none yet"}.`,
    `Known items: ${(items ?? []).map((i) => i.name).join(", ") || "none yet"}.`,
    `Her recent records, newest first (id | time | kind | amount | what | customer):\n${recordsText || "(none yet)"}`,
    body.context ? `Earlier note and your question: ${body.context}\nHer answer:` : "Her note:",
    note,
  ].join("\n");

  let parsed: Parsed;
  try {
    const client = new Anthropic();
    const res = await client.beta.messages.create({
      model: MODEL, max_tokens: 3000,
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> } },
      system: SYSTEM, messages: [{ role: "user", content: userMsg }],
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

  // Find or create the person or item she named.
  const custIndex = new Map<string, string>();
  for (const c of customers ?? []) [c.name, ...(c.aliases ?? [])].forEach((n: string) => custIndex.set(norm(n), c.id));
  const itemIndex = new Map<string, string>();
  for (const i of items ?? []) [i.name, ...(i.aliases ?? [])].forEach((n: string) => itemIndex.set(norm(n), i.id));
  async function resolve(table: "customer" | "item", index: Map<string, string>, names: Map<string, string>, name: string) {
    if (!name) return null;
    const hit = index.get(norm(name));
    if (hit) return hit;
    const { data } = await sb.from(table).insert({ shop_id: shopId, name }).select("id").single();
    if (data) { index.set(norm(name), data.id); names.set(data.id, name); }
    return data?.id ?? null;
  }

  const lines: string[] = [];
  let changed = false, wrote = 0, missed = 0;
  const touchedCustomers: string[] = [];

  for (const a of parsed.actions ?? []) {
    if (a.op === "add") {
      if (!a.kind || !KINDS.includes(a.kind)) continue;
      const kobo = actionKobo(a);
      if (a.kind !== "stock_note" && kobo == null) continue;
      const customer = clean(a.customer), item = clean(a.item);
      if (a.kind === "credit_sale" && !customer) continue; // a debt with no name cannot be tracked; the question asks who
      const customer_id = await resolve("customer", custIndex, custName, customer);
      const item_id = await resolve("item", itemIndex, itemName, item);
      const row = {
        shop_id: shopId, capture_id: capture.id, kind: a.kind, amount_kobo: kobo, customer_id, item_id,
        quantity: a.quantity != null && a.quantity > 0 ? a.quantity : null,
        due_date: a.due_date && /^\d{4}-\d{2}-\d{2}$/.test(a.due_date) ? a.due_date : null,
        note: clean(a.note) || null, confidence: Math.min(1, Math.max(0, a.confidence ?? 0.5)),
        ...(noonLagos(a.occurred_on) ? { occurred_at: noonLagos(a.occurred_on) } : {}),
      };
      const { error } = await sb.from("event").insert(row);
      if (error) { missed++; continue; }
      wrote++;
      if (customer_id) touchedCustomers.push(customer_id);
      lines.push(describe({ kind: a.kind, amount_kobo: kobo, customer, item, quantity: row.quantity, note: row.note, due: row.due_date }));
      continue;
    }

    // update or delete: must point at a record she really has
    const before = a.target ? byRef.get(a.target) : undefined;
    if (!before) { missed++; continue; }
    const beforeText = describeRow(before, custName, itemName);

    if (a.op === "delete") {
      const { error: he } = await sb.from("event_history").insert({ shop_id: shopId, capture_id: capture.id, event_id: before.id, action: "delete", before });
      if (he) { console.error("history failed", he.message); missed++; continue; }
      const { error } = await sb.from("event").delete().eq("id", before.id);
      if (error) { missed++; continue; }
      byRef.delete(a.target!);
      wrote++; changed = true;
      lines.push(`Removed: ${beforeText}`);
      continue;
    }

    // update: only fields she changed
    const patch: Partial<EventRow> = {};
    if (a.kind && KINDS.includes(a.kind)) patch.kind = a.kind;
    const qty = a.quantity != null && a.quantity > 0 ? a.quantity : null;
    if (qty != null) patch.quantity = qty;
    let kobo = actionKobo(a);
    if (kobo == null && qty != null && a.amount_naira == null && a.unit_price_naira == null) kobo = rescaleKobo(before, qty); // "only three paid" keeps the price each
    if (kobo != null) patch.amount_kobo = kobo;
    if (clean(a.customer)) patch.customer_id = await resolve("customer", custIndex, custName, clean(a.customer));
    if (clean(a.item)) patch.item_id = await resolve("item", itemIndex, itemName, clean(a.item));
    if (clean(a.note)) patch.note = clean(a.note);
    if (a.due_date && /^\d{4}-\d{2}-\d{2}$/.test(a.due_date)) patch.due_date = a.due_date;
    const diff = changedFields(before as unknown as Record<string, unknown>, patch as Record<string, unknown>) as Partial<EventRow>;
    const finalKind = diff.kind ?? before.kind;
    if (finalKind === "credit_sale" && !(diff.customer_id ?? before.customer_id)) { missed++; continue; } // a debt needs a name
    if (!Object.keys(diff).length) continue;

    const { error: he } = await sb.from("event_history").insert({ shop_id: shopId, capture_id: capture.id, event_id: before.id, action: "update", before });
    if (he) { console.error("history failed", he.message); missed++; continue; }
    const { error } = await sb.from("event").update(diff).eq("id", before.id);
    if (error) { missed++; continue; }
    const after: EventRow = { ...before, ...diff };
    byRef.set(a.target!, after);
    wrote++; changed = true;
    if (after.customer_id) touchedCustomers.push(after.customer_id);
    const was = before.amount_kobo != null && diff.amount_kobo != null ? ` (was ${naira(before.amount_kobo)})` : "";
    lines.push(`Updated: ${describeRow(after, custName, itemName)}${was}`);
  }

  if (touchedCustomers.length) await sb.from("customer").update({ last_seen_at: new Date().toISOString() }).in("id", [...new Set(touchedCustomers)]);

  let question = clean(parsed.question);
  if (!wrote) {
    await sb.from("capture").update({ status: "needs_answer" }).eq("id", capture.id);
    if (!question) question = missed ? "Which one do you mean? Tell me a bit more." : "Sorry, I didn't catch that. How much was it?";
    return NextResponse.json({ status: "needs_answer", lines: [], question, changed: false });
  }
  await sb.from("capture").update({ status: "parsed" }).eq("id", capture.id);
  return NextResponse.json({ status: "parsed", lines, question: question || null, changed });
}
