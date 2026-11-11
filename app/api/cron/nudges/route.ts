import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { decideNudges, lagosNow, type NudgeKind } from "@/lib/nudges";
import { pushReady, sendPush } from "@/lib/webpush";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const minutesOf = (t: string | null) => { const m = /^(\d{1,2}):(\d{2})/.exec(t ?? ""); return m ? Number(m[1]) * 60 + Number(m[2]) : 18 * 60; };

/**
 * Runs every few minutes from a scheduler. Decides, for each shop with a phone signed up, whether Spal
 * has something worth saying right now, and sends it. Uses the service key because it must see every shop.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET, svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !svc || !pushReady()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!same(given, secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, svc, { auth: { persistSession: false, autoRefreshToken: false } });
  const { day, minutes } = lagosNow();
  const since = new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString();

  const { data: subs } = await sb.from("push_subscription").select("id, shop_id, endpoint, p256dh, auth");
  const byShop = new Map<string, NonNullable<typeof subs>>();
  for (const s of subs ?? []) byShop.set(s.shop_id, [...(byShop.get(s.shop_id) ?? []), s]);

  let sent = 0, shops = 0;
  for (const [shopId, phones] of byShop) {
    const [{ data: shop }, { data: closed }, { data: recent }, { data: debts }, { data: props }, { data: log }, { data: custs }] = await Promise.all([
      sb.from("shop").select("owner_name, usual_close_time").eq("id", shopId).maybeSingle(),
      sb.from("day_close").select("day").eq("shop_id", shopId).eq("day", day).maybeSingle(),
      sb.from("event").select("id").eq("shop_id", shopId).gte("occurred_at", since).limit(1),
      sb.from("debt").select("customer_id, owed_kobo, next_due").eq("shop_id", shopId),
      sb.from("proposal").select("customer_id, status, created_at").eq("shop_id", shopId).eq("kind", "debt_reminder").gte("created_at", new Date(Date.now() - 36 * 3600 * 1000).toISOString()),
      sb.from("nudge_log").select("kind").eq("shop_id", shopId).eq("day", day),
      sb.from("customer").select("id, name").eq("shop_id", shopId),
    ]);
    if (!shop) continue;
    shops++;

    const names = new Map((custs ?? []).map((c) => [c.id as string, c.name as string]));
    const handled = new Set((props ?? []).filter((p) => p.status !== "pending" && new Date(p.created_at).toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" }) === day).map((p) => p.customer_id as string));
    const top = (debts ?? []).filter((d) => d.next_due && d.next_due <= day && Number(d.owed_kobo) > 0 && !handled.has(d.customer_id as string))
      .sort((a, b) => Number(b.owed_kobo) - Number(a.owed_kobo))[0];

    const nudges = decideNudges({
      nowMin: minutes, closeMin: minutesOf(shop.usual_close_time),
      firstName: (shop.owner_name ?? "").split(/\s+/)[0] || "there",
      closedToday: !!closed, activeRecently: (recent ?? []).length > 0,
      due: top ? { name: names.get(top.customer_id as string) ?? "Someone", owedKobo: Number(top.owed_kobo), overdue: (top.next_due as string) < day } : null,
      sentToday: (log ?? []).map((l) => l.kind as NudgeKind),
    });

    for (const n of nudges) {
      // Claim today's slot first. If another run already took it, send nothing.
      const { data: claimed } = await sb.from("nudge_log").upsert({ shop_id: shopId, kind: n.kind, day }, { onConflict: "shop_id,kind,day", ignoreDuplicates: true }).select("kind");
      if (!claimed?.length) continue;
      for (const p of phones) {
        const r = await sendPush(p, { title: n.title, body: n.body, tag: n.tag, url: "/" });
        if (r === "ok") sent++;
        if (r === "gone") await sb.from("push_subscription").delete().eq("id", p.id);
      }
    }
  }
  return NextResponse.json({ shops, sent, day, minutes });
}
