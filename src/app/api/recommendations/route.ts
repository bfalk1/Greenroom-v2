import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildRecommendations, parseRecommendationFilters } from "@/lib/recommendations";
import { logRecommendationImpression } from "@/lib/recommendationTracking";

// GET /api/recommendations — personalised picks for the marketplace "For You"
// tab. Takes the Samples filter params (genre, instrumentType, sampleType, key,
// scale); sort is not honoured, since the ranking is what the tab is for.
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const filter = parseRecommendationFilters(new URL(request.url).searchParams);
    const { trace, ...payload } = await buildRecommendations(authUser.id, filter);

    // Logged before responding: a serverless function can be frozen as soon as
    // the response is sent. A null id only means this list isn't attributed.
    const impressionId = await logRecommendationImpression(
      authUser.id,
      payload.cold,
      filter,
      trace
    );

    return NextResponse.json({ ...payload, impressionId });
  } catch (error) {
    console.error("GET /api/recommendations error:", error);
    return NextResponse.json(
      { error: "Failed to build recommendations" },
      { status: 500 }
    );
  }
}
