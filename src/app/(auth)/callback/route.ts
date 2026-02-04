import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (code) {
    // TODO: Exchange code for session via Supabase Auth
  }

  return NextResponse.redirect(new URL("/marketplace", requestUrl.origin));
}
