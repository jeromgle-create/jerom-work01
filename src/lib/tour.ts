// 한국관광공사 국문 관광정보 서비스(KorService2) 호출 모듈.
// 인증키를 다루므로 서버(Route Handler)에서만 import 한다.

const BASE_URL = "https://apis.data.go.kr/B551011/KorService2";

// 관광 타입 코드: 12 = 관광지, 15 = 축제·공연·행사
export const CONTENT_TYPE = { spot: "12", festival: "15" } as const;

export type Region = { code: string; name: string };

export type Place = {
  id: string;
  title: string;
  address: string;
  image: string | null;
  lat: number | null;
  lng: number | null;
  tel: string;
  distanceM: number | null;
  startDate: string | null; // YYYYMMDD (축제만)
  endDate: string | null;
};

export type PlaceList = { items: Place[]; totalCount: number };

export class TourApiError extends Error {}

type RawItem = Record<string, string | number | undefined>;

export function getServiceKey(): string | null {
  const key = process.env.TOUR_API_KEY?.trim();
  if (!key) return null;
  // 'Encoding' 키(%가 들어간 키)를 넣어도 동작하도록 한 번 풀어 준다.
  return key.includes("%") ? decodeURIComponent(key) : key;
}

async function callTour(
  operation: string,
  params: Record<string, string | undefined>,
): Promise<{ items: RawItem[]; totalCount: number }> {
  const serviceKey = getServiceKey();
  if (!serviceKey) throw new TourApiError(missingKeyMessage());

  const query = new URLSearchParams({
    serviceKey,
    MobileOS: "ETC",
    MobileApp: "jerom-work01",
    _type: "json",
  });
  for (const [k, v] of Object.entries(params)) {
    if (v) query.set(k, v);
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/${operation}?${query}`, {
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new TourApiError("관광공사 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }

  const text = await res.text();
  let body: {
    response?: {
      header?: { resultCode?: string; resultMsg?: string };
      body?: { items?: { item?: RawItem | RawItem[] } | ""; totalCount?: number };
    };
  };
  try {
    body = JSON.parse(text);
  } catch {
    // 인증키 오류 등은 _type=json 이어도 XML로 오는 경우가 있다.
    const msg =
      text.match(/<returnAuthMsg>([^<]+)</)?.[1] ??
      text.match(/<resultMsg>([^<]+)</)?.[1] ??
      `HTTP ${res.status}`;
    throw new TourApiError(explainError(msg));
  }

  const header = body.response?.header;
  if (header?.resultCode && header.resultCode !== "0000") {
    throw new TourApiError(explainError(header.resultMsg ?? header.resultCode));
  }

  const rawItems = body.response?.body?.items;
  const item = rawItems && typeof rawItems === "object" ? rawItems.item : undefined;
  const items = Array.isArray(item) ? item : item ? [item] : [];
  return { items, totalCount: Number(body.response?.body?.totalCount ?? items.length) };
}

// 인증키가 없을 때 어디에 등록해야 하는지 화면에서 바로 알 수 있게 안내한다.
function missingKeyMessage(): string {
  const where =
    process.env.VERCEL_ENV === "production"
      ? "Vercel의 Production 환경"
      : process.env.VERCEL_ENV === "preview"
        ? "Vercel의 Preview 환경"
        : process.env.VERCEL
          ? "Vercel"
          : "내 컴퓨터(로컬 실행)";
  const lines = [`TOUR_API_KEY가 설정되지 않았습니다. (지금 실행 위치: ${where})`];
  if (process.env.VERCEL) {
    lines.push(
      `Vercel 프로젝트 Settings → Environment Variables에 TOUR_API_KEY를 ${
        process.env.VERCEL_ENV === "preview" ? "Preview" : "Production"
      } 환경으로 등록한 뒤 Redeploy 해 주세요.`,
    );
  } else {
    lines.push("프로젝트 폴더의 .env.local 파일에 TOUR_API_KEY=인증키 를 넣고 다시 실행해 주세요.");
  }
  // 이름 오타(소문자, 앞뒤 공백 등)로 등록된 변수가 있으면 알려준다.
  const lookalike = Object.keys(process.env).find(
    (k) => k !== "TOUR_API_KEY" && k.replace(/[^a-z]/gi, "").toUpperCase() === "TOURAPIKEY",
  );
  if (lookalike) {
    lines.push(`비슷한 이름 "${lookalike}"이(가) 있습니다. 이름을 정확히 TOUR_API_KEY로 바꿔 주세요.`);
  } else if (process.env.TOUR_API_KEY !== undefined) {
    lines.push("TOUR_API_KEY 값이 비어 있습니다. 인증키를 붙여 넣었는지 확인해 주세요.");
  }
  return lines.join(" ");
}

function explainError(msg: string): string {
  if (msg.includes("SERVICE_KEY_IS_NOT_REGISTERED")) {
    return "인증키가 아직 등록되지 않았거나 잘못되었습니다. 발급 직후라면 1~2시간 뒤 다시 시도해 주세요.";
  }
  if (msg.includes("LIMITED_NUMBER_OF_SERVICE_REQUESTS")) {
    return "오늘 사용할 수 있는 요청 횟수를 모두 사용했습니다.";
  }
  return `관광공사 API 오류: ${msg}`;
}

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const num = (v: unknown) => {
  const n = Number(v);
  return v === "" || v === undefined || !Number.isFinite(n) || n === 0 ? null : n;
};

function toPlace(raw: RawItem): Place {
  const image = str(raw.firstimage) || str(raw.firstimage2);
  return {
    id: str(raw.contentid),
    title: str(raw.title),
    address: [str(raw.addr1), str(raw.addr2)].filter(Boolean).join(" "),
    // http 이미지는 https 페이지에서 차단되므로 https로 바꾼다.
    image: image ? image.replace(/^http:\/\//, "https://") : null,
    lat: num(raw.mapy),
    lng: num(raw.mapx),
    tel: str(raw.tel),
    distanceM: num(raw.dist),
    startDate: str(raw.eventstartdate) || null,
    endDate: str(raw.eventenddate) || null,
  };
}

// 법정동 기준 시·도 목록 (regnCd 없음) 또는 시·군·구 목록 (regnCd 있음)
export async function getRegions(regnCd?: string): Promise<Region[]> {
  const { items } = await callTour("ldongCode2", {
    lDongRegnCd: regnCd,
    numOfRows: "100",
    pageNo: "1",
  });
  return items
    .map((it) => ({
      code: str(it.code ?? (regnCd ? it.lDongSignguCd : it.lDongRegnCd)),
      name: str(it.name ?? (regnCd ? it.lDongSignguNm : it.lDongRegnNm)),
    }))
    .filter((r) => r.code && r.name);
}

export async function getSpotsByArea(
  regnCd: string,
  signguCd: string | undefined,
  page: number,
): Promise<PlaceList> {
  const { items, totalCount } = await callTour("areaBasedList2", {
    contentTypeId: CONTENT_TYPE.spot,
    lDongRegnCd: regnCd,
    lDongSignguCd: signguCd,
    arrange: "C", // 수정일순 (사진 없는 관광지도 포함)
    numOfRows: "24",
    pageNo: String(page),
  });
  return { items: items.map(toPlace), totalCount };
}

export async function getSpotsNearby(
  lat: number,
  lng: number,
  radiusM: number,
  page: number,
): Promise<PlaceList> {
  const { items, totalCount } = await callTour("locationBasedList2", {
    contentTypeId: CONTENT_TYPE.spot,
    mapX: String(lng),
    mapY: String(lat),
    radius: String(Math.min(radiusM, 20000)),
    arrange: "E", // 거리순
    numOfRows: "24",
    pageNo: String(page),
  });
  return { items: items.map(toPlace), totalCount };
}

const FESTIVAL_PAGE_SIZE = 500;
const FESTIVAL_MAX_PAGES = 6; // 최대 3,000건

// 오늘부터 days일 안에 열리는(또는 진행 중인) 축제
export async function getFestivals(opts: {
  regnCd?: string;
  signguCd?: string;
  near?: { lat: number; lng: number; radiusM: number };
  days?: number;
}): Promise<PlaceList> {
  const today = kstDate(0);
  const until = kstDate(opts.days ?? 60);
  // 축제는 서버에서 거르고 정렬하므로 해당 기간의 축제를 끝까지 받아온다.
  const items: RawItem[] = [];
  for (let page = 1; page <= FESTIVAL_MAX_PAGES; page++) {
    const res = await callTour("searchFestival2", {
      eventStartDate: today,
      eventEndDate: until,
      lDongRegnCd: opts.regnCd,
      lDongSignguCd: opts.signguCd,
      arrange: "A",
      numOfRows: String(FESTIVAL_PAGE_SIZE),
      pageNo: String(page),
    });
    items.push(...res.items);
    if (res.items.length < FESTIVAL_PAGE_SIZE || items.length >= res.totalCount) break;
  }

  let places = items
    .filter((raw) => {
      // API 필터와 별개로 지역·기간을 한 번 더 확인한다.
      if (opts.regnCd && raw.lDongRegnCd && str(raw.lDongRegnCd) !== opts.regnCd) return false;
      if (opts.signguCd && raw.lDongSignguCd && str(raw.lDongSignguCd) !== opts.signguCd) return false;
      return true;
    })
    .map(toPlace)
    .filter((p) => (!p.endDate || p.endDate >= today) && (!p.startDate || p.startDate <= until));

  if (opts.near) {
    const { lat, lng, radiusM } = opts.near;
    places = places
      .map((p) => ({
        ...p,
        distanceM: p.lat !== null && p.lng !== null ? distanceM(lat, lng, p.lat, p.lng) : null,
      }))
      .filter((p) => p.distanceM !== null && p.distanceM <= radiusM)
      .sort((a, b) => a.distanceM! - b.distanceM!);
  } else {
    places.sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
  }
  return { items: places, totalCount: places.length };
}

function kstDate(offsetDays: number): string {
  const d = new Date(Date.now() + 9 * 3600_000 + offsetDays * 86_400_000);
  return d.toISOString().slice(0, 10).replaceAll("-", "");
}

function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}
