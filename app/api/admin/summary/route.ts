import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** For the person running Spal only: how it is doing, and the latest errors and feedback. Locked to ADMIN_EMAIL. */
export async function GET(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const admin = process.env.ADMIN_EMAIL?.trim().toLowerCase(), svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!admin || !svc) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const asUser = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: u } = await asUser.auth.getUser(token);
  if (!u?.user?.email || u.user.email.toLowerCase() !== admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, svc, { auth: { persistSession: false, autoRefreshToken: false } });
  const day = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const week = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;

  const [shops, shops7, notes7, failed7, parsed7, voice7, errors7, reports, caps, saved] = await Promise.all([
    count(sb.from("shop").select("id", { count: "exact", head: true })),
    count(sb.from("shop").select("id", { count: "exact", head: true }).gte("created_at", week)),
    count(sb.from("capture").select("id", { count: "exact", head: true }).gte("created_at", week)),
    count(sb.from("capture").select("id", { count: "exact", head: true }).gte("created_at", week).eq("status", "failed")),
    count(sb.from("capture").select("id", { count: "exact", head: true }).gte("created_at", week).eq("status", "parsed")),
    count(sb.from("capture").select("id", { count: "exact", head: true }).gte("created_at", week).eq("kind", "voice")),
    count(sb.from("app_report").select("id", { count: "exact", head: true }).gte("created_at", week).eq("kind", "error")),
    sb.from("app_report").select("id, kind, message, context, user_agent, created_at, shop_id").order("created_at", { ascending: false }).limit(60),
    sb.from("capture").select("shop_id").gte("created_at", day),
    sb.from("day_close").select("shop_id", { count: "exact", head: true }).gte("closed_at", day),
  ]);
  const active24 = new Set((caps.data ?? []).map((c) => c.shop_id)).size;

  const ids = [...new Set((reports.data ?? []).map((r) => r.shop_id).filter(Boolean))] as string[];
  const { data: names } = ids.length ? await sb.from("shop").select("id, name, owner_name").in("id", ids) : { data: [] as { id: string; name: string | null; owner_name: string | null }[] };
  const nameOf = new Map((names ?? []).map((s) => [s.id, `${s.owner_name ?? "?"} · ${s.name ?? "?"}`]));

  // Pilot view: one row per shop, so you can see who is actually using Spal and who came back.
  const since60 = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const [{ data: shopRows }, { data: capRows }, { data: closeRows }, { data: winRows }] = await Promise.all([
    sb.from("shop").select("id, owner_id, name, owner_name, created_at").order("created_at", { ascending: false }).limit(60),
    sb.from("capture").select("shop_id, created_at, status, kind").gte("created_at", since60).limit(20000),
    sb.from("day_close").select("shop_id").limit(20000),
    sb.from("proposal").select("shop_id, customer_id, status, decided_at").eq("kind", "win_back").in("status", ["approved", "edited"]).limit(2000),
  ]);
  const lagosDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  const perShop = new Map<string, { days: Set<string>; notes: number; failed: number; voice: number; last: string }>();
  for (const c of capRows ?? []) {
    const e = perShop.get(c.shop_id) ?? { days: new Set<string>(), notes: 0, failed: 0, voice: 0, last: "" };
    e.days.add(lagosDay(c.created_at)); e.notes++; if (c.status === "failed") e.failed++; if (c.kind === "voice") e.voice++; if (c.created_at > e.last) e.last = c.created_at;
    perShop.set(c.shop_id, e);
  }
  const closed = new Map<string, number>();
  for (const c of closeRows ?? []) closed.set(c.shop_id, (closed.get(c.shop_id) ?? 0) + 1);
  const sent = new Map<string, number>(), worked = new Map<string, number>();
  for (const w of winRows ?? []) {
    sent.set(w.shop_id, (sent.get(w.shop_id) ?? 0) + 1);
    const { count } = await sb.from("event").select("id", { count: "exact", head: true }).eq("customer_id", w.customer_id).in("kind", ["sale", "credit_sale"]).gte("occurred_at", w.decided_at);
    if (count) worked.set(w.shop_id, (worked.get(w.shop_id) ?? 0) + 1);
  }
  const pilot = [];
  for (const sh of shopRows ?? []) {
    const c = perShop.get(sh.id);
    let saved = false;
    try { const { data: au } = await sb.auth.admin.getUserById(sh.owner_id); saved = !!au?.user && !au.user.is_anonymous; } catch { /* unknown */ }
    pilot.push({
      id: sh.id, shop: `${sh.owner_name ?? "?"} · ${sh.name ?? "?"}`, joined: sh.created_at, notes: c?.notes ?? 0, activeDays: c?.days.size ?? 0,
      last: c?.last ?? null, closedDays: closed.get(sh.id) ?? 0, failed: c?.failed ?? 0, voice: c?.voice ?? 0, saved,
      winBacksSent: sent.get(sh.id) ?? 0, winBacksWorked: worked.get(sh.id) ?? 0,
    });
  }

  return NextResponse.json({
    pilot,
    stats: { shops, shopsThisWeek: shops7, activeLast24h: active24, closedLast24h: saved.count ?? 0, notes7d: notes7, parsed7d: parsed7, failed7d: failed7, voice7d: voice7, errors7d: errors7 },
    reports: (reports.data ?? []).map((r) => ({ ...r, shop: r.shop_id ? nameOf.get(r.shop_id) ?? null : null })),
  });
}
