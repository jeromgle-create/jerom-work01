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
} = L;

/** Areas of the campus for the HUD label. */
function campusLabel(x: number, z: number) {
  if (x >= -36 && x <= 2 && z >= 7 && z <= 30) return "운동장";
  if (x >= -36 && x <= 4 && z > -19 && z < -9) return "중정 (전래 놀이터 · 텃밭)";
  if (x < -36 && z > 12 && z < 20) return "모래 놀이터";
  if (z < -27) return "후문 · 주차장 쪽";
  if (z > 30) return "정문 앞";
  return "학교 마당";
}

/** HUD label and conversation key for a world position. */
export function locationAt(x: number, z: number): { key: string; label: string } {
  const zone = zoneAt(x);
  const key = locationKey(x, z);
  if (zone === "outdoor") return { key, label: campusLabel(x, z) };
  const f = FLOOR_BY_ID[zone];
  const r = roomAt(x, z);
  return { key, label: `${f.label} · ${r && r.kind !== "void" ? r.name : "복도"}` };
}
