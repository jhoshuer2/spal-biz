import Anthropic from "@anthropic-ai/sdk";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { applyActions, KINDS, type Parsed } from "@/lib/apply";
import { recordsList, type EventRow } from "@/lib/records";
import { reportError } from "@/lib/report";

export const runtime = "nodejs";
export const maxDuration = 30;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const nullable = (t: string) => ({ type: [t, "null"] });
const SCHEMA = {
  type: "object", additionalProperties: false, required: ["actions", "question", "options", "read"],
  properties: {
    actions: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["op", "target", "kind", "amount_naira", "unit_price_naira", "quantity", "item", "customer", "due_date", "note", "occurred_on", "occurred_time", "confidence"],
        properties: {
          op: { type: "string", enum: ["add", "update", "delete"] },
          target: nullable("string"),
          kind: { type: "string", enum: [...KINDS, "none"] },
          amount_naira: nullable("number"), unit_price_naira: nullable("number"), quantity: nullable("number"),
          item: nullable("string"), customer: nullable("string"), due_date: nullable("string"), note: nullable("string"), occurred_on: nullable("string"), occurred_time: nullable("string"),
          confidence: { type: "number" },
        },
      },
    },
    question: nullable("string"),
    options: { type: ["array", "null"], items: { type: "string" } },
    read: nullable("string"),
  },
} as const;

const SYSTEM = `You keep the books for a small shop owner, from notes she types or speaks, in English or Nigerian Pidgin. Amounts are Nigerian naira: "k" means thousand (40k = 40000) and "m" means million.

You can add new records AND fix or remove records that are already saved, the way a good shop assistant goes back to the book when told something was wrong. You are given her recent records, each with an id such as r1. Her note is NEW information, a CORRECTION of something already saved, or both.

Actions (return a list):
- add: a new record.
- update: change a saved record. Set target to its id. Fill in ONLY the fields that change; leave every other field null, and set kind to "none" when the kind does not change.
- delete: remove a saved record she says was wrong, a duplicate, or should not be there. Set target, and set kind to "none" and every other field to null.
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
- Dates and times are part of what she says, so listen for them like a person would. If she says when something happened ("at 6:30", "around 4", "4:05 this afternoon", "an hour ago", "after church", "before 9"), set occurred_time (HH:MM, 24 hours, Lagos) on that record. Work out am or pm from the kind of shop and the time of her note: a shop sells in the day, so "6:30" told at 7:12 in the evening is 18:30, never a time after her note was recorded. Work out "an hour ago" and "just now" from the time her note was recorded. Different times for different sales mean separate records, each with its own occurred_time ("apple juice 500 at 4:05 and 2,000 at 6:30" is two sales). A time that covers several things ("this morning I sold ...") with no exact hour: leave occurred_time null. If she gives no time at all, occurred_time is null and the system uses the moment she told you, so never invent one. You may also set occurred_time on an update when she corrects when something happened ("that was at 5, not 6").
- If she is telling you about an earlier day ("yesterday", "last Tuesday", a date), set occurred_on (YYYY-MM-DD) on added records. Otherwise null. With a time and no day, the day is the day of her note.
- When you ask a question and two or three answers are likely, phrase it as a choice ("Did you mean 5,000 each, or 5,000 in all?") and put those answers in options, short and in her own words ("5,000 each", "5,000 in all"). The choices are tappable buttons for a busy owner, so keep each under 6 words. If there are no likely answers, options is null.
- Ask at most ONE short friendly question (under 15 words, in her own style) when you cannot tell the amount, which record she means, or anything above. You may return actions and a question together when part of her note is clear. If her note is not about the shop at all, return no actions and ask what she meant.
- Sometimes her note is a PHOTO: her notebook page, a receipt, a handwritten list of sales or debts, a price list, or a shelf. Read it like a careful assistant. Record only what is clearly written or shown; if a number or name is hard to read, do not guess: ask one short question about that part and record the rest. Dates written in the photo are occurred_on. Put a short plain-text copy of what you read in read (for example "2 rice 3000; Blessing owes 2500"), so she can see what you understood. For text and voice notes, read is null.
- Her answer to your question may be something else entirely (a new sale, or "delete the last record"). Do what she now says; never insist on the old question.
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

  const { data: capture } = await sb.from("capture").select("id, shop_id, kind, media_path, text_content, transcript, created_at").eq("id", body.capture_id).maybeSingle();
  if (!capture) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const isPhoto = capture.kind === "photo";
  let photo: { data: string } | null = null;
  if (isPhoto) {
    if (!capture.media_path) return NextResponse.json({ error: "empty" }, { status: 400 });
    const { data: ok } = await sb.rpc("bump_usage", { p_kind: "photo", p_max: 30 });
    if (ok === false) return NextResponse.json({ status: "limited" }, { status: 429 });
    const { data: file } = await sb.storage.from("captures").download(capture.media_path as string);
    if (!file || file.size > 4_500_000) return NextResponse.json({ error: "empty" }, { status: 400 });
    photo = { data: Buffer.from(await file.arrayBuffer()).toString("base64") };
  }
  const note = (clean(capture.text_content) || clean(capture.transcript) || (isPhoto ? "(She sent a photo.)" : "")).slice(0, 1500);
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
    `Today is ${lagosToday()} (Lagos time). Her note was recorded at ${new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Lagos" }).format(new Date(capture.created_at as string))}.`,
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
    const ask = (structured: boolean) => client.beta.messages.create({
      model: MODEL, max_tokens: 3000,
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      ...(structured ? { output_config: { effort: (photo ? "medium" : "low") as "low" | "medium", format: { type: "json_schema" as const, schema: SCHEMA as unknown as Record<string, unknown> } } } : { output_config: { effort: (photo ? "medium" : "low") as "low" | "medium" } }),
      system: structured ? SYSTEM : `${SYSTEM}\n\nReply with ONLY a JSON object, no other text, shaped like: ${JSON.stringify(SCHEMA)}`,
      messages: [{ role: "user", content: photo ? [{ type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data: photo.data } }, { type: "text" as const, text: userMsg }] : userMsg }],
    });
    let res;
    try {
      res = await ask(true);
    } catch (e) {
      // If the structured format itself is refused, try once more in plain JSON mode instead of failing her note.
      const status = (e as { status?: number }).status;
      console.error("structured call failed", status, e instanceof Error ? e.message.slice(0, 300) : e);
      if (status !== 400) throw e;
      res = await ask(false);
    }
    if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") throw new Error(`stop:${res.stop_reason}`);
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") throw new Error("no text");
    const raw = text.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
    parsed = JSON.parse(raw) as Parsed;
    if (!Array.isArray(parsed.actions)) throw new Error("bad shape");
  } catch (e) {
    const why = e instanceof Error ? e.message.slice(0, 300) : String(e);
    console.error("parse failed", why);
    await sb.from("capture").update({ status: "failed" }).eq("id", capture.id);
    await reportError(sb, shopId, "Could not read a note", { where: "parse", why, status: (e as { status?: number }).status ?? null, capture_id: capture.id });
    return NextResponse.json({ status: "failed", reason: "model" }, { status: 502 });
  }

  const custIndex = new Map<string, string>();
  for (const c of customers ?? []) [c.name, ...(c.aliases ?? [])].forEach((n: string) => custIndex.set(norm(n), c.id));
  const itemIndex = new Map<string, string>();
  for (const i of items ?? []) [i.name, ...(i.aliases ?? [])].forEach((n: string) => itemIndex.set(norm(n), i.id));

  const read = isPhoto ? clean(parsed.read).slice(0, 600) : "";
  if (read) await sb.from("capture").update({ transcript: read }).eq("id", capture.id);
  const options = (parsed.options ?? []).map((o) => clean(o)).filter(Boolean).slice(0, 3);
  const { lines, changed, wrote, missed, touchedCustomers, boughtCustomers, historyFailed } = await applyActions(
    { sb, shopId, captureId: capture.id as string, capturedAt: capture.created_at as string, byRef, custName, itemName, custIndex, itemIndex }, parsed.actions ?? []);

  // Did someone she messaged come back? Say so: it shows her that reaching out works.
  try {
    if (boughtCustomers.length) {
      const ids = [...new Set(boughtCustomers)];
      const { data: wins } = await sb.from("proposal").select("customer_id, decided_at").eq("kind", "win_back").in("status", ["approved", "edited"]).in("customer_id", ids).gte("decided_at", new Date(Date.now() - 21 * 86_400_000).toISOString());
      for (const w of wins ?? []) {
        const { count } = await sb.from("event").select("id", { count: "exact", head: true }).eq("customer_id", w.customer_id).in("kind", ["sale", "credit_sale"]).gte("occurred_at", w.decided_at).neq("capture_id", capture.id);
        if (!count) lines.push(`${custName.get(w.customer_id as string) ?? "They"} is back after your message.`);
      }
    }
  } catch { /* a nice-to-have, never worth failing her note */ }

  if (touchedCustomers.length) await sb.from("customer").update({ last_seen_at: new Date().toISOString() }).in("id", [...new Set(touchedCustomers)]);

  let question = clean(parsed.question);
  if (!wrote) {
    await sb.from("capture").update({ status: "needs_answer" }).eq("id", capture.id);
    if (historyFailed) {
      await reportError(sb, shopId, "Correction history table is missing", { where: "parse", capture_id: capture.id });
      return NextResponse.json({ status: "needs_answer", lines: [], question: "I can't change saved records just yet. My setup isn't finished.", changed: false, reason: "history_missing" });
    }
    if (!question) question = missed ? "Which one do you mean? Tell me a bit more." : "I didn't quite get that. Tell me what you sold or spent, or who owes you, or ask me to fix or remove something.";
    return NextResponse.json({ status: "needs_answer", lines: [], question, options, read, changed: false });
  }
  await sb.from("capture").update({ status: "parsed" }).eq("id", capture.id);
  return NextResponse.json({ status: "parsed", lines, question: question || null, options: question ? options : [], read, changed });
}
