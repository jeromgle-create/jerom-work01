import type { BuildingRecord, Tower, TowerType } from "./types";

/** 법정동코드 앞 2자리 → 시도명 */
export const SIDO: Record<string, string> = {
  "11": "서울",
  "26": "부산",
  "27": "대구",
  "28": "인천",
  "29": "광주",
  "30": "대전",
  "31": "울산",
  "36": "세종",
  "41": "경기",
  "43": "충북",
  "44": "충남",
  "46": "전남",
  "47": "경북",
  "48": "경남",
  "50": "제주",
  "51": "강원",
  "52": "전북",
};

/**
 * '탑'으로 보지 않을 건물명 패턴(오탐 제외).
 * 실데이터 투입 후 결과를 보며 계속 보강한다.
 */
const EXCLUDE = [/탑마트/, /탑골/, /탑동/, /탑리/, /탑산/, /탑스/, /탑플/, /탑\s*(빌|아파트|오피스텔|상가|프라자|플라자)/, /타워\s*(빌|아파트|오피스텔|상가|팰리스|맨션)/];

/** 탑 유형 판별 규칙(위에서부터 먼저 맞는 것). */
const TYPE_RULES: { type: TowerType; name: RegExp; useCodes?: string[] }[] = [
  { type: "방송·통신탑", name: /(송신|송출|중계|통신|방송|안테나|철탑)/, useCodes: ["24000"] },
  { type: "급수탑", name: /급수탑|물탱크탑|저수탑/ },
  { type: "종교 탑", name: /(석탑|종탑|사리탑|부도탑|불탑|다보탑|첨탑)/, useCodes: ["06000"] },
  { type: "기념탑", name: /(기념탑|위령탑|충혼탑|현충탑|평화의\s*탑|겨레의\s*탑|추모탑|기념비탑)/ },
  { type: "전망탑", name: /(전망|관망|스카이|타워|타 워)/, useCodes: ["27000"] },
];

const TOWER_NAME = /(탑|타워)/;

export function sidoOf(bjdCode: string): string {
  return SIDO[bjdCode.slice(0, 2)] ?? "기타";
}

/**
 * 건물 레코드가 '탑'인지 판별하고 유형을 매긴다. 탑이 아니면 null.
 * 기준: 건물명에 '탑/타워' 포함 + 제외 패턴 미해당.
 * (용도코드는 유형 판별 보조로만 사용)
 */
export function classify(b: BuildingRecord): Tower | null {
  const name = `${b.bldName} ${b.dongName}`.trim();
  if (!TOWER_NAME.test(name)) return null;
  if (EXCLUDE.some((re) => re.test(name))) return null;

  let towerType: TowerType = "기타 탑";
  for (const rule of TYPE_RULES) {
    if (rule.name.test(name)) {
      towerType = rule.type;
      break;
    }
  }
  if (towerType === "기타 탑") {
    const byUse = TYPE_RULES.find((r) => r.useCodes?.includes(b.useCode));
    if (byUse) towerType = byUse.type;
  }
  return { ...b, towerType, sido: sidoOf(b.bjdCode) };
}

export function classifyAll(records: BuildingRecord[]) {
  const towers: Tower[] = [];
  let excluded = 0;
  for (const r of records) {
    const t = classify(r);
    if (t) towers.push(t);
    else excluded++;
  }
  return { towers, excluded };
}

export const TOWER_TYPES: TowerType[] = ["전망탑", "방송·통신탑", "급수탑", "기념탑", "종교 탑", "기타 탑"];

export const TYPE_COLORS: Record<TowerType, string> = {
  전망탑: "#2563eb",
  "방송·통신탑": "#dc2626",
  급수탑: "#0891b2",
  기념탑: "#9333ea",
  "종교 탑": "#d97706",
  "기타 탑": "#64748b",
};
