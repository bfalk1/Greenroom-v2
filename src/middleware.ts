import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public assets (images, video, audio) — must be excluded or anonymous
     *   requests for e.g. the landing-page demo video get redirected to /login
     * - api/releases (public endpoint)
     */
    "/((?!_next/static|_next/image|favicon.ico|api/releases|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|mp4|webm|mov|mp3|wav|m4a|ogg)$).*)",
  ],
};
