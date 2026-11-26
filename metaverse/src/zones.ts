// Map zones. Interiors live far from the campus in the same coordinate space, so position sync,
// collisions and proximity voice need no special cases: distance alone keeps zones apart.
// Zone rectangles must match ZONES in server/index.js.

export type ZoneId = "outdoor" | "floor1" | "floor2" | "hall";
export type Zone = { id: ZoneId; cx: number; cz: number; hw: number; hd: number; label: string };

export const ZONES: Record<ZoneId, Zone> = {
  outdoor: { id: "outdoor", cx: 0, cz: 0, hw: 24, hd: 24, label: "학교 마당" },
  floor1: { id: "floor1", cx: 100, cz: 0, hw: 21, hd: 12, label: "본관 1층" },
  floor2: { id: "floor2", cx: 200, cz: 0, hw: 21, hd: 12, label: "본관 2층" },
  hall: { id: "hall", cx: 300, cz: 0, hw: 15, hd: 10, label: "강당" },
};

export function zoneAt(x: number): ZoneId {
  if (x < 60) return "outdoor";
  if (x < 150) return "floor1";
  if (x < 250) return "floor2";
  return "hall";
}

// ---------- building floor plan (local coordinates, shared by both floors) ----------
// Outer walls x ∈ [-21, 21], z ∈ [-12, 12]; corridor z ∈ [-2, 2].
// North row (z -12..-2): slots A, B, C. South row (z 2..12): slots D, E (lobby / stair hall), F.
export type RoomKind = "classroom" | "science" | "music" | "library" | "computer" | "lobby" | "stairhall";
export type Room = {
  key: string;
  label: string;
  kind: RoomKind;
  row: "north" | "south";
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};
const slot = (s: "A" | "B" | "C" | "D" | "E" | "F") => {
  const col = { A: 0, B: 1, C: 2, D: 0, E: 1, F: 2 }[s];
  const north = "ABC".includes(s);
  return {
    row: north ? ("north" as const) : ("south" as const),
    minX: -21 + col * 14,
    maxX: -7 + col * 14,
    minZ: north ? -12 : 2,
    maxZ: north ? -2 : 12,
  };
};
const room = (s: "A" | "B" | "C" | "D" | "E" | "F", key: string, label: string, kind: RoomKind): Room => ({
  key,
  label,
  kind,
  ...slot(s),
});

export const FLOOR_ROOMS: Record<"floor1" | "floor2", Room[]> = {
  floor1: [
    room("A", "1-1", "1학년 1반", "classroom"),
    room("B", "1-2", "1학년 2반", "classroom"),
    room("C", "science", "과학실", "science"),
    room("D", "library", "도서관", "library"),
    room("E", "lobby", "현관 로비", "lobby"),
    room("F", "1-3", "1학년 3반", "classroom"),
  ],
  floor2: [
    room("A", "2-1", "2학년 1반", "classroom"),
    room("B", "2-2", "2학년 2반", "classroom"),
    room("C", "music", "음악실", "music"),
    room("D", "computer", "컴퓨터실", "computer"),
    room("E", "stairs2", "계단 홀", "stairhall"),
    room("F", "2-3", "2학년 3반", "classroom"),
  ],
};

/** Door gap on the corridor wall for a room (world-local x range). Lobby/stair hall are open. */
export const doorOf = (r: Room) => ({ minX: r.maxX - 4, maxX: r.maxX - 1.6 });

/** Stairs in the lobby / stair hall (local). */
export const STAIRS = { minX: 3.5, maxX: 6.5, minZ: 5, maxZ: 11.5 };
/** Exit door on floor 1's south wall (local). */
export const EXIT_DOOR = { minX: -1.5, maxX: 1.5 };

// ---------- portals (world coordinates) ----------
export type Portal = {
  from: ZoneId;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  to: { x: number; z: number; ry: number };
  label: string;
};
const F1 = ZONES.floor1.cx;
const F2 = ZONES.floor2.cx;
const HALL = ZONES.hall.cx;
// ry: 0 faces south (toward the camera), PI faces north, PI/2 east, -PI/2 west.
export const PORTALS: Portal[] = [
  { from: "outdoor", minX: -1.4, maxX: 1.4, minZ: -16.4, maxZ: -15.8, to: { x: F1, z: 9.8, ry: Math.PI }, label: "현관" },
  { from: "floor1", minX: F1 - 1.5, maxX: F1 + 1.5, minZ: 11, maxZ: 12.5, to: { x: 0, z: -14.6, ry: 0 }, label: "나가기" },
  { from: "floor1", minX: F1 + 3.6, maxX: F1 + 6.4, minZ: 5.2, maxZ: 7, to: { x: F2 + 1.8, z: 8.5, ry: Math.PI }, label: "2층으로" },
  { from: "floor2", minX: F2 + 3.6, maxX: F2 + 6.4, minZ: 5.2, maxZ: 7, to: { x: F1 + 1.8, z: 8.5, ry: Math.PI }, label: "1층으로" },
  { from: "outdoor", minX: -18.5, maxX: -17.9, minZ: 8.2, maxZ: 9.8, to: { x: HALL + 12.8, z: 6, ry: -Math.PI / 2 }, label: "강당" },
  { from: "hall", minX: HALL + 14.1, maxX: HALL + 15.5, minZ: 5, maxZ: 7, to: { x: -17.3, z: 9, ry: Math.PI / 2 }, label: "나가기" },
];

export function portalAt(x: number, z: number): Portal | undefined {
  const zone = zoneAt(x);
  return PORTALS.find((p) => p.from === zone && x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ);
}

// ---------- locations (for the HUD and voice attenuation) ----------
export function locationAt(x: number, z: number): { key: string; label: string } {
  const zone = zoneAt(x);
  if (zone === "outdoor") {
    if (x > 18 && z > -12 && z < 2) return { key: "outdoor", label: "놀이터" };
    if (Math.abs(x) <= 17 && z > -10 && z < 17) return { key: "outdoor", label: "운동장" };
    return { key: "outdoor", label: "학교 마당" };
  }
  if (zone === "hall") return { key: "hall", label: "강당" };
  const z0 = ZONES[zone];
  const lx = x - z0.cx;
  const lz = z - z0.cz;
  const floor = zone === "floor1" ? "1층" : "2층";
  const r = FLOOR_ROOMS[zone].find((r) => lx >= r.minX && lx <= r.maxX && lz >= r.minZ && lz <= r.maxZ);
  if (r) return { key: `${zone}:${r.key}`, label: `${floor} · ${r.label}` };
  return { key: `${zone}:corridor`, label: `${floor} · 복도` };
}
