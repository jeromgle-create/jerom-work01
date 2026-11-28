// Typed access to the shared school layout (shared/layout.js), plus HUD labels.
import * as L from "../shared/layout.js";

export type ZoneId = string; // "outdoor" or a floor id such as "N1", "S3", "E2"
export type RoomKind = L.RoomKind;
export type Room = L.Room;
export type Floor = L.Floor;
export type Portal = L.Portal;

export const {
  SCHOOL_NAME,
  FLOORS,
  FLOOR_BY_ID,
  OUTDOOR,
  PORTALS,
  CAMPUS_DOORS,
  OPEN_KINDS,
  ROOM_D,
  CORRIDOR_HALF,
  zoneAt,
  roomAt,
  locationKey,
  portalAt,
  exitDoor,
  PARK,
  PARK_RIDES,
  PARK_EXIT_MAT,
  PARK_GATE_MAT,
} = L;

/** Areas of the park for the HUD label (park-local coordinates). */
function parkLabel(x: number, z: number) {
  if (L.inCafe(x, z)) return `${L.CAFE.name} (카페 안)`;
  const lx = x - PARK.cx;
  if (Math.abs(lx - L.CAFE.x) < 6 && Math.abs(z - L.CAFE.z) < 6) return `${L.CAFE.name} 앞`;
  for (const r of PARK_RIDES)
    for (const st of [r.a, r.b]) {
      const [x0, x1, z0, z1] = st.mat;
      if (lx > x0 - 3 && lx < x1 + 3 && z > z0 - 3 && z < z1 + 4) return `${r.name} ${r.name === "스카이리프트" ? "탑승장" : "정류장"}`;
    }
  if (lx < -26 && z < -24) return "식물원 · 전시온실";
  if (lx < -26 && z < 20) return "테마가든 · 장미원";
  if (lx < -26) return "자연캠핑장";
  if (lx > 26 && z > 22) return "잔디광장";
  if (z > 42) return "정문 광장";
  if (lx > 18 && z < -1) return "동물원";
  if (Math.hypot((lx - 8) / 30, (z - 4) / 27) < 1) return "호수 둘레길";
  return "숲길";
}

/** Areas of the campus for the HUD label. */
function campusLabel(x: number, z: number) {
  if (x >= -36 && x <= 2 && z >= 7 && z <= 30) return "운동장";
  if (x >= -36 && x <= 4 && z > -19 && z < -9) return "중정 (전래 놀이터 · 텃밭)";
  if (x < -36 && z > 12 && z < 20) return "모래 놀이터";
  if (z < -27) return "후문 · 주차장 쪽";
  if (z > 30) return "정문 앞 (서울대공원 가는 길)";
  return "학교 마당";
}

/** HUD label and conversation key for a world position. */
export function locationAt(x: number, z: number): { key: string; label: string } {
  const zone = zoneAt(x);
  const key = locationKey(x, z);
  if (zone === "outdoor") return { key, label: campusLabel(x, z) };
  if (zone === "park") return { key, label: `${PARK.name} · ${parkLabel(x, z)}` };
  const f = FLOOR_BY_ID[zone];
  const r = roomAt(x, z);
  return { key, label: `${f.label} · ${r && r.kind !== "void" ? r.name : "복도"}` };
}
