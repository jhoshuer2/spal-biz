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

  return NextResponse.json({
    stats: { shops, shopsThisWeek: shops7, activeLast24h: active24, closedLast24h: saved.count ?? 0, notes7d: notes7, parsed7d: parsed7, failed7d: failed7, voice7d: voice7, errors7d: errors7 },
    reports: (reports.data ?? []).map((r) => ({ ...r, shop: r.shop_id ? nameOf.get(r.shop_id) ?? null : null })),
  });
}
