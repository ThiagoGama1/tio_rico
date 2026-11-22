import { NextResponse, type NextRequest } from "next/server";
import { getMacroIndicators } from "@/lib/integrations/bcb";

const INDICATORS_CACHE_CONTROL =
  "public, s-maxage=3600, stale-while-revalidate=86400";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const refreshParam = request.nextUrl.searchParams.get("refresh");
  const forceRefresh = refreshParam === "true" || refreshParam === "1";

  const data = await getMacroIndicators({ forceRefresh });

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": INDICATORS_CACHE_CONTROL,
    },
  });
}
