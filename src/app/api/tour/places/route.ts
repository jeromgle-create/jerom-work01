import { NextResponse, type NextRequest } from "next/server";
import {
  getFestivals,
  getSpotsByArea,
  getSpotsNearby,
  TourApiError,
  type PlaceList,
} from "@/lib/tour";

// GET /api/tour/places?kind=spot|festival&by=area&regn=..&signgu=..&page=1
// GET /api/tour/places?kind=spot|festival&by=location&lat=..&lng=..&radius=5000&page=1
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const kind = q.get("kind") === "festival" ? "festival" : "spot";
  const page = Math.max(1, Number(q.get("page")) || 1);

  try {
    let result: PlaceList;
    if (q.get("by") === "location") {
      const lat = Number(q.get("lat"));
      const lng = Number(q.get("lng"));
      const radius = Math.min(20000, Math.max(500, Number(q.get("radius")) || 5000));
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !q.get("lat") || !q.get("lng")) {
        return NextResponse.json({ error: "위치 정보가 올바르지 않습니다." }, { status: 400 });
      }
      result =
        kind === "festival"
          ? await getFestivals({ near: { lat, lng, radiusM: radius } })
          : await getSpotsNearby(lat, lng, radius, page);
    } else {
      const regn = q.get("regn");
      const signgu = q.get("signgu") || undefined;
      if (!regn) {
        return NextResponse.json({ error: "지역을 선택해 주세요." }, { status: 400 });
      }
      result =
        kind === "festival"
          ? await getFestivals({ regnCd: regn, signguCd: signgu })
          : await getSpotsByArea(regn, signgu, page);
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof TourApiError ? e.message : "알 수 없는 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
