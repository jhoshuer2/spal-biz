import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STAGES = new Set(["signup-captcha", "signup-account", "signup-shop", "signup-load"]);
const hits = new Map<string, number[]>();

/**
 * Records why someone could not get started. They have no account yet, so this is open to anyone but takes only a few
 * known fields, only from our own site, and only a handful per visitor. It never stores what they typed.
 */
export async function POST(req: Request) {
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!svc) return NextResponse.json({ ok: false }, { status: 503 });
  const origin = req.headers.get("origin") ?? "";
  if (origin && !/spal-biz\.vercel\.app$|spal\.ng$|localhost/.test(new URL(origin).hostname)) return NextResponse.json({ ok: false }, { status: 403 });

  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  if (recent.length >= 5) return NextResponse.json({ ok: true });
  hits.set(ip, [...recent, now]);

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b.stage !== "string" || !STAGES.has(b.stage)) return NextResponse.json({ ok: false }, { status: 400 });
  const clip = (v: unknown, n = 200) => (typeof v === "string" ? v.slice(0, n) : typeof v === "number" ? v : null);

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, svc, { auth: { persistSession: false, autoRefreshToken: false } });
  await sb.from("app_report").insert({
    kind: "error",
    message: `Could not get started: ${b.stage} (${clip(b.why, 20) ?? "unknown"})`,
    context: { commit: clip(b.commit, 12), status: clip(b.status), code: clip(b.code, 80), detail: clip(b.detail), online: b.online === true, attempt: clip(b.attempt, 3), network: clip(b.network, 30) },
    user_agent: (req.headers.get("user-agent") ?? "").slice(0, 200),
  });
  return NextResponse.json({ ok: true });
}
