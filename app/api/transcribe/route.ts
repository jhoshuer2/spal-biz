import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 4 * 1024 * 1024; // Vercel's request limit is 4.5 MB

/** Audio in, text out. Only signed-in shops can use it (a private account counts). */
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const asUser = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: within, error: limErr } = await asUser.rpc("bump_usage", { p_kind: "transcribe", p_max: 100 });
  if (limErr) console.warn("usage limit not active:", limErr.message);
  else if (within === false) return NextResponse.json({ error: "limited" }, { status: 429 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("audio");
  if (!(file instanceof Blob) || file.size === 0) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "too_big" }, { status: 413 });

  const out = new FormData();
  out.append("file", file, "note." + (file.type.includes("mp4") ? "m4a" : "webm"));
  out.append("model_id", "scribe_v1");
  out.append("language_code", "eng"); // Nigerian English and Pidgin read best as English
  out.append("tag_audio_events", "false");
  out.append("diarize", "false");

  const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": key }, body: out });
  if (!r.ok) {
    console.error("stt failed", r.status);
    return NextResponse.json({ error: "stt_failed" }, { status: 502 });
  }
  const j = (await r.json()) as { text?: string };
  return NextResponse.json({ text: (j.text ?? "").trim() });
}
