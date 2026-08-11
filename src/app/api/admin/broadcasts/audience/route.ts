import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { audienceWhere, parseAudience } from "@/lib/broadcastAudience";

// GET /api/admin/broadcasts/audience — how many accounts each audience reaches
// (ADMIN). Returns every role audience in one round trip so the compose UI can
// label the whole selector without a request per option; `?audience=SPECIFIC`
// with `?userIds=a,b,c` additionally resolves a hand-picked list, which is the
// only audience whose size the client can't state on its own.
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true },
    });

    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    const [all, creators, users] = await Promise.all([
      prisma.user.count({ where: audienceWhere("ALL") }),
      prisma.user.count({ where: audienceWhere("CREATORS") }),
      prisma.user.count({ where: audienceWhere("USERS") }),
    ]);

    const counts = { ALL: all, CREATORS: creators, USERS: users };

    const { searchParams } = new URL(req.url);
    const requested = searchParams.get("audience") ?? undefined;
    const rawIds = searchParams.get("userIds");
    const userIds = rawIds ? rawIds.split(",").filter(Boolean) : undefined;

    const parsed = parseAudience(requested, userIds);
    if (!parsed.ok) {
      // A malformed selection shouldn't blank the whole selector — hand back
      // the role counts and let the client show the error against SPECIFIC.
      return NextResponse.json({ counts, count: 0, error: parsed.error });
    }

    const count =
      parsed.audience === "SPECIFIC"
        ? await prisma.user.count({
            where: audienceWhere("SPECIFIC", parsed.userIds),
          })
        : counts[parsed.audience];

    return NextResponse.json({ counts, count, audience: parsed.audience });
  } catch (error) {
    console.error("GET /api/admin/broadcasts/audience error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
