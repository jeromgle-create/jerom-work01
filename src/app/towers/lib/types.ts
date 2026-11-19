/**
 * GIS건물통합정보 레코드(1건 = 건물 1동).
 *
 * 필드명은 원본 SHP 컬럼(A0~A28)을 의미 있는 이름으로 옮긴 것이다.
 * 실데이터 투입 시 전처리 스크립트가 원본 컬럼 → 이 구조로 변환한다.
 * (원본 컬럼 대응표: FIELD_LABELS 참고. 실데이터 명세로 재확인 필요)
 */
export interface BuildingRecord {
  /** A1 GIS건물통합식별번호 */
  gisId: string;
  /** A2 고유번호(PNU, 19자리) */
  pnu: string;
  /** A3 법정동코드(10자리, 앞 2자리 = 시도) */
  bjdCode: string;
  /** A4 법정동명 */
  bjdName: string;
  /** A5 지번 */
  jibun: string;
  /** A8 건축물용도코드 */
  useCode: string;
  /** A9 건축물용도명 */
  useName: string;
  /** A10 건축물구조코드 */
  structCode: string;
  /** A11 건축물구조명 */
  structName: string;
  /** A12 건축면적(㎡) */
  archArea: number;
  /** A13 사용승인일자(YYYY-MM-DD) */
  useAprDay: string | null;
  /** A14 연면적(㎡) */
  totArea: number;
  /** A15 대지면적(㎡) */
  platArea: number;
  /** A16 높이(m) */
  height: number;
  /** A24 건물명 */
  bldName: string;
  /** A25 동명 */
  dongName: string;
  /** A26 지상층수 */
  grndFloors: number;
  /** A27 지하층수 */
  ugrndFloors: number;
  /** A22 데이터기준일자 */
  dataDay: string;
  /** 건물 폴리곤 중심점(WGS84). 원본(EPSG:5186) 폴리곤에서 전처리 시 계산 */
  lat: number;
  lng: number;
}

export type TowerType =
  | "전망탑"
  | "방송·통신탑"
  | "급수탑"
  | "기념탑"
  | "종교 탑"
  | "기타 탑";

export interface Tower extends BuildingRecord {
  towerType: TowerType;
  sido: string;
}

export const FIELD_LABELS: { key: keyof BuildingRecord; code: string; label: string; unit?: string }[] = [
  { key: "gisId", code: "A1", label: "GIS건물통합식별번호" },
  { key: "pnu", code: "A2", label: "고유번호(PNU)" },
  { key: "bjdCode", code: "A3", label: "법정동코드" },
  { key: "bjdName", code: "A4", label: "법정동명" },
  { key: "jibun", code: "A5", label: "지번" },
  { key: "useCode", code: "A8", label: "건축물용도코드" },
  { key: "useName", code: "A9", label: "건축물용도명" },
  { key: "structCode", code: "A10", label: "건축물구조코드" },
  { key: "structName", code: "A11", label: "건축물구조명" },
  { key: "archArea", code: "A12", label: "건축면적", unit: "㎡" },
  { key: "useAprDay", code: "A13", label: "사용승인일자" },
  { key: "totArea", code: "A14", label: "연면적", unit: "㎡" },
  { key: "platArea", code: "A15", label: "대지면적", unit: "㎡" },
  { key: "height", code: "A16", label: "높이", unit: "m" },
  { key: "dataDay", code: "A22", label: "데이터기준일자" },
  { key: "bldName", code: "A24", label: "건물명" },
  { key: "dongName", code: "A25", label: "동명" },
  { key: "grndFloors", code: "A26", label: "지상층수", unit: "층" },
  { key: "ugrndFloors", code: "A27", label: "지하층수", unit: "층" },
];
