// School layout shared by the client (rendering, collisions, HUD) and the server (zone clamp,
// chat recipients). Built from a schematic floor plan: room order and adjacency follow the plan,
// sizes are standardized because the plan has no scale. The school name is fictional.
//
// Coordinates: x east, z south, 1 unit ≈ 1 m. The campus is the "outdoor" zone around the origin;
// every building floor is its own zone far to the east, so distance alone keeps zones apart.

export const SCHOOL_NAME = "한빛초등학교";

// ---------- room kinds and default widths ----------
/** @typedef {"classroom"|"care"|"kinder"|"office"|"storage"|"counsel"|"meeting"|"principal"|"staff"|"health"|"gym"|"dance"|"safety"|"cafeteria"|"science"|"music"|"orchestra"|"art"|"cooking"|"library"|"computer"|"theater"|"broadcast"|"lounge"|"shower"|"stands"|"sleep"|"hall"|"entrance"|"wc"|"stairs"|"void"} RoomKind */
const DEFAULT_W = {
  classroom: 9, care: 9, kinder: 9, office: 6, storage: 6, counsel: 6, meeting: 9, principal: 9, staff: 14,
  health: 9, gym: 12, dance: 9, safety: 18, cafeteria: 18, science: 12, music: 12, orchestra: 12, art: 12,
  cooking: 12, library: 18, computer: 12, theater: 14, broadcast: 6, lounge: 6, shower: 5, stands: 20,
  sleep: 9, hall: 10, entrance: 9, wc: 5, stairs: 7, void: 0,
};
/** Kinds without a corridor wall: they read as part of the corridor (also for chat/voice rooms). */
export const OPEN_KINDS = new Set(["hall", "stairs", "entrance"]);

/** @param {string} name @param {RoomKind} kind @param {number} [w] */
const R = (name, kind, w) => ({ name, kind, w: w ?? DEFAULT_W[kind] });
const STAIRS = R("계단", "stairs");
const cls = (n) => R(n, "classroom");

// ---------- floors ----------
// Wings are single-loaded (rooms on the north side of the corridor), the main building double-loaded.
const RAW_FLOORS = [
  // 북관 (north wing)
  { id: "N1", building: "북관", level: 1, exit: true, north: [R("사랑방(개별상담)", "counsel"), R("나눔방(교육복지실)", "counsel"), R("우리방(상담실)", "counsel"), R("마음방(상담교실)", "counsel"), STAIRS, R("돌봄교실3(연계형)", "care"), R("안전체험관", "safety"), R("급식실", "cafeteria")], south: [] },
  { id: "N2", building: "북관", level: 2, north: [R("학부모회실", "meeting"), R("튼튼꿈나무실", "care", 18), R("신체활동실1", "gym"), STAIRS, R("탄탄교실", "classroom"), R("학습자료실", "storage"), R("학습자료실", "storage"), R("교직원쉼터", "lounge"), R("학습자료 보관실", "storage")], south: [] },
  { id: "N3", building: "북관", level: 3, north: [R("자료1실", "storage"), cls("3-2"), cls("3-1"), R("동아리실", "office", 9), STAIRS, R("방과후교실2", "care"), R("방과후교실1", "care"), R("늘봄지원실", "office"), R("무용실", "dance"), R("3학년 연구실", "office")], south: [] },
  { id: "N4", building: "북관", level: 4, north: [R("자료2실", "storage"), cls("5-2"), cls("5-1"), R("학생회실", "meeting"), STAIRS, R("방과후교실3", "care"), cls("교과실2"), cls("교과실1"), R("공구실", "storage"), R("5학년 연구실", "office")], south: [] },
  // 남관 (south wing)
  { id: "S1", building: "남관", level: 1, exit: true, north: [R("돌봄자료실", "storage"), R("돌봄교실2", "care"), R("돌봄교실1", "care"), STAIRS, R("보건실", "health"), cls("보건교육실"), R("개별학습반2", "classroom", 7), R("개별학습반1", "classroom", 7), R("관리실", "office")], south: [] },
  { id: "S2", building: "남관", level: 2, north: [R("2학년 연구실", "office"), cls("2-2"), cls("2-1"), STAIRS, R("늘봄교실2", "care"), R("늘봄교실1", "care"), cls("1-2"), cls("1-1"), R("1학년 연구실", "office")], south: [] },
  { id: "S3", building: "남관", level: 3, north: [R("영어자료실", "storage"), cls("영어교실B"), cls("영어교실A"), STAIRS, R("2학년 연구실", "office"), R("스마트교실(다목적실)", "computer"), cls("4-2"), cls("4-1"), R("4학년 연구실", "office")], south: [] },
  { id: "S4", building: "남관", level: 4, north: [R("자료실3", "storage"), R("신체활동실2", "gym"), cls("교과실3"), STAIRS, R("특수교육지원실", "office", 9), cls("6-2"), cls("6-1"), R("스포츠강사실", "office"), R("6학년 연구실", "office")], south: [] },
  // 본관 (main building)
  { id: "E1", building: "본관", level: 1, exit: true,
    north: [R("급식창고", "storage"), R("영양교사실", "office"), R("식당", "cafeteria", 24), R("당직실", "office"), R("화장실", "wc"), STAIRS, R("중앙홀", "hall")],
    south: [R("현관", "entrance"), R("유치원 새싹반", "kinder"), R("유치원 나무반", "kinder"), R("유치원 하늘반", "kinder"), R("유치원 자료실", "storage"), R("유치원 수면실", "sleep"), R("유치원 도서실", "library", 7), R("교사연구실", "office"), R("시청각실", "theater")] },
  { id: "E2", building: "본관", level: 2,
    north: [R("도서관(책누리)", "library"), R("인쇄실", "office"), R("화장실", "wc"), STAIRS, R("중앙홀", "hall"), R("회의실", "meeting"), R("연수실", "meeting", 12)],
    south: [R("행정실", "office", 9), R("교장실", "principal"), R("교무실", "staff"), R("전산실", "office"), R("컴퓨터실", "computer"), R("방송실", "broadcast"), R("문서고", "storage")] },
  { id: "E3", building: "본관", level: 3,
    north: [R("실과실", "cooking"), R("오케스트라실", "orchestra"), R("화장실", "wc"), STAIRS, R("중앙홀", "hall")],
    south: [R("샤워실(남)", "shower"), R("샤워실(여)", "shower"), R("휴게실", "lounge"), R("기구고", "storage"), R("체육관", "gym", 30)] },
  { id: "E4", building: "본관", level: 4,
    north: [R("과학실1", "science"), R("과학실2", "science"), R("화장실", "wc"), STAIRS, R("중앙홀", "hall")],
    south: [R("과학자료실", "storage"), R("관람석(체육관)", "stands")] },
  { id: "E5", building: "본관", level: 5,
    north: [R("미술실", "art"), R("음악실", "music"), R("화장실", "wc"), STAIRS],
    south: [R("악기 보관실", "storage"), R("창고", "storage")] },
];

export const ROOM_D = 9; // room depth
export const CORRIDOR_HALF = 2; // corridor z ∈ [-2, 2]
const ZONE_GAP = 150;
const FIRST_CX = 200;

/**
 * @typedef {{ name: string, kind: RoomKind, row: "north"|"south", minX: number, maxX: number, minZ: number, maxZ: number, key: string }} Room
 * @typedef {{ id: string, building: string, level: number, label: string, exit: boolean, cx: number, cz: number,
 *   minX: number, maxX: number, minZ: number, maxZ: number, rooms: Room[], stairs: Room, levels: number }} Floor
 */

/** @type {Floor[]} */
export const FLOORS = RAW_FLOORS.map((f, i) => {
  const sum = (row) => row.reduce((n, r) => n + r.w, 0);
  const W = Math.max(sum(f.north), sum(f.south));
  const pad = (row) => (row.length && sum(row) < W ? [...row, R("", "void", W - sum(row))] : row);
  /** @type {Room[]} */
  const rooms = [];
  for (const [rowName, row] of [["north", pad(f.north)], ["south", pad(f.south)]]) {
    let x = -W / 2;
    row.forEach((r) => {
      const north = rowName === "north";
      rooms.push({
        name: r.name,
        kind: r.kind,
        row: /** @type {"north"|"south"} */ (rowName),
        minX: x,
        maxX: x + r.w,
        minZ: north ? -CORRIDOR_HALF - ROOM_D : CORRIDOR_HALF,
        maxZ: north ? -CORRIDOR_HALF : CORRIDOR_HALF + ROOM_D,
        key: `${f.id}:${rooms.length}`,
      });
      x += r.w;
    });
  }
  const levels = RAW_FLOORS.filter((g) => g.building === f.building).length;
  return {
    id: f.id,
    building: f.building,
    level: f.level,
    label: `${f.building} ${f.level}층`,
    exit: !!f.exit,
    cx: FIRST_CX + i * ZONE_GAP,
    cz: 0,
    minX: -W / 2,
    maxX: W / 2,
    minZ: -CORRIDOR_HALF - ROOM_D,
    maxZ: f.south.length ? CORRIDOR_HALF + ROOM_D : CORRIDOR_HALF,
    rooms,
    stairs: /** @type {Room} */ (rooms.find((r) => r.kind === "stairs")),
    levels,
  };
});
export const FLOOR_BY_ID = Object.fromEntries(FLOORS.map((f) => [f.id, f]));

// ---------- campus (outdoor zone) ----------
export const OUTDOOR = { id: "outdoor", cx: 0, cz: 0, minX: -40, maxX: 40, minZ: -34, maxZ: 34 };
/** Building doors on campus: stepping on the mat enters that building's first floor. */
export const CAMPUS_DOORS = [
  { floor: "N1", label: "북관 입구", mat: { minX: -17.6, maxX: -14.4, minZ: -18.6, maxZ: -17.9 }, out: { x: -16, z: -16.6, ry: 0 } },
  { floor: "S1", label: "남관 입구", mat: { minX: -15.6, maxX: -12.4, minZ: -1.6, maxZ: -0.9 }, out: { x: -14, z: 0.4, ry: 0 } },
  { floor: "E1", label: "본관 현관", mat: { minX: 10.4, maxX: 13.6, minZ: 24.9, maxZ: 25.6 }, out: { x: 12, z: 27, ry: 0 } },
];
// ---------- park next to the school (separate zone) ----------
// A simplified take on 서울대공원: entrance plaza with the elephant-train stop (south), lake with
// the train loop and sky lift (center), zoo (north-east), rose garden and greenhouse (west),
// campsite and lawn (south-west / south-east). Local coordinates; world x = PARK.cx + x.
export const PARK = { id: "park", cx: 2400, cz: 0, minX: 2330, maxX: 2470, minZ: -60, maxZ: 60, name: "서울대공원" };
/** Mat just inside the school's main gate. */
export const PARK_GATE_MAT = { minX: -7, maxX: -3, minZ: 32.9, maxZ: 34.5 };
const P = (x) => PARK.cx + x;
/** Park quick-travel stations (local coords): stepping on a mat rides to the other end. */
export const PARK_RIDES = [
  { name: "코끼리열차", a: { mat: [10, 14, 53.5, 55], land: [12, 57] }, b: { mat: [38, 42, -12, -10.5], land: [40, -8] } },
  { name: "스카이리프트", a: { mat: [-16, -12, 35, 36.5], land: [-14, 39] }, b: { mat: [62, 66, -45, -43.5], land: [64, -41] } },
];
export const PARK_EXIT_MAT = [-2, 2, 58.3, 60.5];

// ---------- rideable vehicles ----------
// Every client computes a rider's pose from the same path and the server's start time, so riders
// are seen in their train car / lift chair (including height) without syncing y.
const LAKE_LOOP = { x: 8, z: 4, rx: 27, rz: 24 };
export const LIFT_LINE = { a: [-14, 37.5], b: [64, -46], y: 9 };
/** @param {[number, number][]} pts local polyline -> sampler over arc length */
function polyline(pts) {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = acc[acc.length - 1];
  return (u) => {
    const d = u * total; // u outside [0,1] extrapolates along the first / last segment
    let i = 1;
    while (i < acc.length - 1 && acc[i] < d) i++;
    const t = (d - acc[i - 1]) / (acc[i] - acc[i - 1] || 1);
    const [x0, z0] = pts[i - 1];
    const [x1, z1] = pts[i];
    return { x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, ry: Math.atan2(x1 - x0, z1 - z0) };
  };
}
const TRAIN_PATH = (() => {
  const pts = [[12, 51.5], [12, 44], [12, 34]];
  // around the east side of the lake loop, from the south (a≈1.42) to the north-east (a≈-0.35)
  for (let a = 1.42; a >= -0.35; a -= 0.08) pts.push([LAKE_LOOP.x + Math.cos(a) * LAKE_LOOP.rx, LAKE_LOOP.z + Math.sin(a) * LAKE_LOOP.rz]);
  pts.push([38, -6], [40, -9.5]);
  return polyline(pts);
})();
const LIFT_PATH = polyline([LIFT_LINE.a, LIFT_LINE.b]);
const SEAT_Y = LIFT_LINE.y - 1.4 - 0.35; // avatar feet height when sitting in a chair
/** Ride specs: index matches PARK_RIDES. Durations in ms. */
// Shared vehicles: the first rider opens a vehicle that waits `boardWait` ms at the station; friends who
// step on the same mat meanwhile take the next seats. Seats fill car by car, two per car.
export const RIDES = [
  { name: "코끼리열차", duration: 18000, vehicle: "train", sample: TRAIN_PATH, height: () => 0.3, capacity: 6, seatsPerCar: 2, boardWait: 8000 },
  {
    name: "스카이리프트",
    duration: 20000,
    vehicle: "chair",
    sample: LIFT_PATH,
    // rise out of the station, cruise under the cable, set down at the other station
    height: (u) => SEAT_Y * Math.max(0, Math.min(1, u / 0.08, (1 - u) / 0.08)),
    capacity: 2,
    seatsPerCar: 2,
    boardWait: 4000,
  },
];
/** Train cars trail the head car by this fraction of the route. */
export const CAR_GAP = 0.04;
const SEAT_SIDE = 0.38;
/**
 * World pose of a rider. dir "ab" goes from station a to b, "ba" the other way.
 * @param {number} ride @param {"ab"|"ba"} dir @param {number} u progress 0..1
 */
export function ridePose(ride, dir, u) {
  const r = RIDES[ride];
  const k = dir === "ab" ? u : 1 - u;
  const p = r.sample(k);
  return { x: PARK.cx + p.x, z: PARK.cz + p.z, y: r.height(k), ry: dir === "ab" ? p.ry : p.ry + Math.PI };
}
/** Car index of a seat (0 = head car). */
export const seatCar = (ride, seat) => Math.floor(seat / RIDES[ride].seatsPerCar);
/** A rider is done when their own car reaches the end of the route. */
export const seatEndU = (ride, seat) => 1 + seatCar(ride, seat) * CAR_GAP;
/** World pose of a rider in a given seat: their car's pose, shifted left/right within the car. */
export function seatPose(ride, dir, u, seat) {
  const p = ridePose(ride, dir, u - seatCar(ride, seat) * CAR_GAP);
  const side = (seat % RIDES[ride].seatsPerCar === 0 ? -1 : 1) * SEAT_SIDE;
  return { ...p, x: p.x + Math.cos(p.ry) * side, z: p.z - Math.sin(p.ry) * side };
}

/** Where new players appear: around the middle of the field. */
export const SPAWN = { x: -17, z: 17 };

// ---------- zones ----------
/** @returns {string} "outdoor" or a floor id */
export function zoneAt(x) {
  if (x < 120) return "outdoor";
  if (x >= 2200) return "park";
  const i = Math.round((x - FIRST_CX) / ZONE_GAP);
  return FLOORS[Math.max(0, Math.min(FLOORS.length - 1, i))].id;
}
/** Walkable world rectangles (server clamp). */
export const ZONE_RECTS = [
  OUTDOOR,
  PARK,
  ...FLOORS.map((f) => ({ id: f.id, cx: f.cx, cz: f.cz, minX: f.cx + f.minX, maxX: f.cx + f.maxX, minZ: f.cz + f.minZ, maxZ: f.cz + f.maxZ })),
];

/** Room under a world position (floor-local lookup), or null for the corridor/outdoors. */
export function roomAt(x, z) {
  const id = zoneAt(x);
  if (id === "outdoor" || id === "park") return null;
  const f = FLOOR_BY_ID[id];
  const lx = x - f.cx;
  const lz = z - f.cz;
  return f.rooms.find((r) => lx >= r.minX && lx <= r.maxX && lz >= r.minZ && lz <= r.maxZ) ?? null;
}

/** Conversation space: walls separate rooms; open kinds count as the corridor. */
export function locationKey(x, z) {
  const id = zoneAt(x);
  if (id === "outdoor" || id === "park") return id;
  const r = roomAt(x, z);
  return r && !OPEN_KINDS.has(r.kind) ? r.key : `${id}:corridor`;
}

// ---------- portals (world coordinates) ----------
const STAIR_PAD_D = 1.6; // pads sit at the corridor end of the stairs cell
/**
 * @typedef {{ from: string, minX: number, maxX: number, minZ: number, maxZ: number, to: { x: number, z: number, ry: number }, label: string, kind: "up"|"down"|"exit"|"enter"|"ride", ride?: number, dir?: "ab"|"ba" }} Portal
 * @type {Portal[]}
 */
export const PORTALS = (() => {
  const out = [];
  const pads = (f) => {
    const s = f.stairs;
    const mid = (s.minX + s.maxX) / 2;
    const z1 = s.maxZ - 0.3;
    return {
      up: { minX: f.cx + s.minX + 0.4, maxX: f.cx + mid - 0.2, minZ: z1 - STAIR_PAD_D, maxZ: z1 },
      down: { minX: f.cx + mid + 0.2, maxX: f.cx + s.maxX - 0.4, minZ: z1 - STAIR_PAD_D, maxZ: z1 },
      landing: { x: f.cx + mid, z: 0.4 }, // corridor in front of the stairs
    };
  };
  for (const f of FLOORS) {
    const p = pads(f);
    const up = FLOORS.find((g) => g.building === f.building && g.level === f.level + 1);
    const down = FLOORS.find((g) => g.building === f.building && g.level === f.level - 1);
    if (up) out.push({ from: f.id, ...p.up, to: { ...pads(up).landing, ry: 0 }, label: `▲ ${up.level}층`, kind: "up" });
    if (down) out.push({ from: f.id, ...p.down, to: { ...pads(down).landing, ry: 0 }, label: `▼ ${down.level}층`, kind: "down" });
    if (f.exit) {
      const door = CAMPUS_DOORS.find((d) => d.floor === f.id);
      const ex = exitDoor(f);
      out.push({ from: f.id, minX: f.cx + ex.minX, maxX: f.cx + ex.maxX, minZ: f.cz + f.maxZ - 0.9, maxZ: f.cz + f.maxZ + 0.5, to: door.out, label: "나가기", kind: "exit" });
      out.push({ from: "outdoor", ...door.mat, to: { x: f.cx + (ex.minX + ex.maxX) / 2, z: f.cz + f.maxZ - 2.6, ry: Math.PI }, label: door.label, kind: "enter" });
    }
  }
  // school gate <-> park entrance
  out.push({ from: "outdoor", ...PARK_GATE_MAT, to: { x: P(0), z: 55.5, ry: Math.PI }, label: "서울대공원 가는 길", kind: "enter" });
  const [ex0, ex1, ez0, ez1] = PARK_EXIT_MAT;
  out.push({ from: "park", minX: P(ex0), maxX: P(ex1), minZ: ez0, maxZ: ez1, to: { x: -5, z: 31.4, ry: Math.PI }, label: "한빛초등학교로", kind: "exit" });
  // rides inside the park (both directions)
  for (const r of PARK_RIDES)
    for (const [from, to, dir] of [[r.a, r.b, "ab"], [r.b, r.a, "ba"]]) {
      const [x0, x1, z0, z1] = from.mat;
      out.push({ from: "park", minX: P(x0), maxX: P(x1), minZ: z0, maxZ: z1, to: { x: P(to.land[0]), z: to.land[1], ry: Math.PI }, label: r.name, kind: "ride", ride: PARK_RIDES.indexOf(r), dir });
    }
  return out;
})();

/** Exit door gap (floor-local x range) in the outer south wall of a ground floor. */
export function exitDoor(f) {
  const ent = f.rooms.find((r) => r.kind === "entrance");
  const ref = ent ?? f.stairs; // wings: door straight out of the corridor in front of the stairs
  const mid = (ref.minX + ref.maxX) / 2;
  return { minX: mid - 1.5, maxX: mid + 1.5 };
}

export function portalAt(x, z) {
  const zone = zoneAt(x);
  return PORTALS.find((p) => p.from === zone && x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ);
}
