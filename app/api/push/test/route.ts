import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { pushReady, sendPush } from "@/lib/webpush";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sends a test reminder to the signed-in shop's own phones, so she can see it works. */
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!pushReady()) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: within } = await sb.rpc("bump_usage", { p_kind: "push_test", p_max: 5 });
  if (within === false) return NextResponse.json({ error: "limited" }, { status: 429 });

  const { data: subs } = await sb.from("push_subscription").select("id, endpoint, p256dh, auth");
  let sent = 0;
  for (const s of subs ?? []) {
    const r = await sendPush(s, { title: "Spal", body: "This is how I'll remind you. All good!", tag: "test", url: "/" });
    if (r === "ok") sent++;
    if (r === "gone") await sb.from("push_subscription").delete().eq("id", s.id);
  }
  return NextResponse.json({ sent });
}
