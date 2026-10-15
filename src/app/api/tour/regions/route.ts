import { NextResponse, type NextRequest } from "next/server";
import { getRegions, TourApiError } from "@/lib/tour";

// GET /api/tour/regions            → 시·도 목록
// GET /api/tour/regions?regn=51    → 해당 시·도의 시·군·구 목록
export async function GET(request: NextRequest) {
  const regn = request.nextUrl.searchParams.get("regn") ?? undefined;
  try {
    return NextResponse.json({ regions: await getRegions(regn) });
  } catch (e) {
    return errorResponse(e);
  }
}

function errorResponse(e: unknown) {
  const message = e instanceof TourApiError ? e.message : "알 수 없는 오류가 발생했습니다.";
  return NextResponse.json({ error: message }, { status: 502 });
}
