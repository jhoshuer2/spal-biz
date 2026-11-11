import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Deletes the signed-in owner's account and everything in it: records, recordings, photo, reminders and the sign-in itself. */
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!svc) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { confirm?: boolean } | null;
  if (!body?.confirm) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const asUser = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: u } = await asUser.auth.getUser(token);
  if (!u?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const uid = u.user.id;

  const sb = createClient(url, svc, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1. Voice recordings live in storage, which does not follow the database, so remove them first.
  const { data: shops } = await sb.from("shop").select("id").eq("owner_id", uid);
  for (const s of shops ?? []) {
    for (let i = 0; i < 50; i++) {
      const { data: files } = await sb.storage.from("captures").list(s.id, { limit: 1000 });
      if (!files?.length) break;
      await sb.storage.from("captures").remove(files.map((f) => `${s.id}/${f.name}`));
      if (files.length < 1000) break;
    }
  }
  // 2. Error reports and feedback from this person.
  await sb.from("app_report").delete().eq("user_id", uid);
  // 3. The account. Everything else (shop, customers, records, reminders, usage) is removed with it.
  const { error } = await sb.auth.admin.deleteUser(uid);
  if (error) { console.error("delete user failed", error.message); return NextResponse.json({ error: "failed" }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
