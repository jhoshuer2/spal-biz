import { NextResponse } from "next/server";

// Reports whether the Supabase env vars reached this deploy (never their values).
export function GET() {
  return NextResponse.json({
    ok: true,
    supabaseConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  });
}
