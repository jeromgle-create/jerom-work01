// Building interiors generated from the shared layout: every room is furnished by a builder for
// its kind, sized to the room. Dollhouse view: no ceilings, the camera-side outer wall is low.
import { useMemo } from "react";
import * as THREE from "three";
import { BoxInstances, Sign, pushOut, type Collider, type V3 } from "./parts";
import { materials, worldMapped } from "./look";
import { CORRIDOR_HALF, FLOOR_BY_ID, OPEN_KINDS, PORTALS, ROOM_D, SCHOOL_NAME, exitDoor, type Floor, type Room } from "./zones";

const WALL_H = 2.4;
const LOW_WALL_H = 1;
const WALL_T = 0.2;

/** `m` picks the surface: wooden furniture grain, floor boards, vinyl tiles; default painted / plastic. */
type Mat = "grain" | "planks" | "vinyl";
type Item = { p: V3; s: V3; c: string; m?: Mat };
type SignDef = { p: V3; size: [number, number]; text: string; bg: string; fg: string };
type Built = { items: Item[]; signs: SignDef[]; solids: Collider[] };

// ---------- doors ----------
/** Door center (room-local x). Narrow rooms get a centered door. */
const doorX = (w: number) => (w >= 8 ? w / 2 - 2 : 0);
/** Door gap on the corridor wall in floor-local x. */
function doorGap(r: Room) {
  const w = r.maxX - r.minX;
  const c = (r.minX + r.maxX) / 2 + doorX(w);
  return { minX: c - 1.2, maxX: c + 1.2 };
}

// ---------- room builder ----------
/** Collects furniture in room-local coordinates (front wall at z = -d/2) and skips anything in the doorway. */
class RoomKit {
  w: number;
  d = ROOM_D;
  cx: number;
  cz: number;
  doorFront: boolean;
  xd: number;
  constructor(
    public room: Room,
    public out: Built,
  ) {
    this.w = room.maxX - room.minX;
    this.cx = (room.minX + room.maxX) / 2;
    this.cz = (room.minZ + room.maxZ) / 2;
    this.doorFront = room.row === "south"; // south rooms open to the corridor on their north (front) wall
    this.xd = doorX(this.w);
  }
  private inDoorway(x: number, z: number, sx: number, sz: number) {
    const dz0 = this.doorFront ? -this.d / 2 : this.d / 2 - 2.4;
    const dz1 = dz0 + 2.4;
    return x + sx / 2 > this.xd - 1.6 && x - sx / 2 < this.xd + 1.6 && z + sz / 2 > dz0 && z - sz / 2 < dz1;
  }
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, c: string, solid = false) {
    if (this.inDoorway(x, z, sx, sz)) return;
    if (Math.abs(x) + sx / 2 > this.w / 2 + 0.01 || Math.abs(z) + sz / 2 > this.d / 2 + 0.01) return;
    const X = this.cx + x;
    const Z = this.cz + z;
    this.out.items.push({ p: [X, y, Z], s: [sx, sy, sz], c, m: WOODS.has(c) ? "grain" : undefined });
    if (solid) this.out.solids.push({ kind: "box", minX: X - sx / 2, maxX: X + sx / 2, minZ: Z - sz / 2, maxZ: Z + sz / 2 });
  }
  sign(x: number, y: number, z: number, sw: number, sh: number, text: string, bg: string, fg: string) {
    if (this.inDoorway(x, z, sw, 0.1)) return;
    this.out.signs.push({ p: [this.cx + x, y, this.cz + z], size: [sw, sh], text, bg, fg });
  }
  /** Free x-range along the front or back wall (avoids the door). */
  span(front: boolean): [number, number] {
    const a = -this.w / 2 + 0.3;
    const b = this.w / 2 - 0.3;
    if (front !== this.doorFront) return [a, b];
    const left: [number, number] = [a, this.xd - 1.7];
    const right: [number, number] = [this.xd + 1.7, b];
    return left[1] - left[0] >= right[1] - right[0] ? left : right;
  }
  floor(c: string) {
    this.out.items.push({ p: [this.cx, 0.006, this.cz], s: [this.w - 0.02, 0.01, this.d - 0.02], c, m: c === WOOD ? "planks" : "vinyl" });
  }
  /** Board on the front wall (facing the room), centered in the free span. */
  board(text: string, bg = "#2f5d46", fg = "#f4f1e6", maxW = 5) {
    const [a, b] = this.span(true);
    const bw = Math.min(maxW, b - a - 0.2);
    if (bw < 1) return;
    const x = (a + b) / 2;
    this.box(x, 1.45, -this.d / 2 + 0.08, bw + 0.2, 1.5, 0.06, "#8a6a45");
    this.sign(x, 1.45, -this.d / 2 + 0.13, bw, 1.3, text, bg, fg);
  }
  /** Run of cabinets along a wall. */
  cabinets(front: boolean, h: number, depth: number, body: string, doors: string[]) {
    const [a, b] = this.span(front);
    if (b - a < 0.8) return;
    const z = front ? -this.d / 2 + depth / 2 + 0.05 : this.d / 2 - depth / 2 - 0.05;
    this.box((a + b) / 2, h / 2, z, b - a, h, depth, body, true);
    const face = front ? z + depth / 2 + 0.02 : z - depth / 2 - 0.02;
    let k = 0;
    for (let x = a + 0.35; x < b - 0.2; x += 0.7)
      for (let y = 0.3; y < h - 0.1; y += 0.5) this.box(x, y, face, 0.6, 0.42, 0.03, doors[k++ % doors.length]);
  }
  /** Shelves with colored books/boxes along a side wall (x = ±). */
  sideShelf(side: -1 | 1, h: number, colors: string[]) {
    const x = side * (this.w / 2 - 0.35);
    const z0 = -this.d / 2 + 0.6;
    const z1 = this.d / 2 - 0.6;
    this.box(x, h / 2, (z0 + z1) / 2, 0.6, h, z1 - z0, "#a47148", true);
    let k = 0;
    for (let z = z0 + 0.15; z < z1 - 0.1; z += 0.22)
      for (let y = 0.35; y < h - 0.2; y += 0.55) this.box(x - side * 0.32, y, z, 0.06, 0.42, 0.16, colors[k++ % colors.length]);
  }
  seatGrid(x0: number, x1: number, z0: number, z1: number, dx: number, dz: number, f: (x: number, z: number, i: number, j: number) => void) {
    let i = 0;
    for (let x = x0; x <= x1 + 1e-6; x += dx, i++) {
      let j = 0;
      for (let z = z0; z <= z1 + 1e-6; z += dz, j++) f(x, z, i, j);
    }
  }
}

const BOOKS = ["#c0392b", "#2980b9", "#27ae60", "#f39c12", "#8e44ad", "#16a085", "#d35400", "#2c3e50", "#e84393"];
const BINS = ["#f6bd60", "#84a59d", "#f28482", "#90bede", "#c3b1e1"];
const CHAIRS = ["#4f86c6", "#e07a5f", "#81b29a", "#f2cc8f"];
const WOOD = "#c99d6b";
/** Colours used for wooden furniture (they get wood grain). */
const WOODS = new Set(["#e8d2a6", "#b9874f", "#9a6b3f", "#a47148", "#8a6a45", "#8d6346", "#c99d6b", "#b08968", "#7f5539", "#6f4e37"]);

function desk(k: RoomKit, x: number, z: number, i: number) {
  k.box(x, 0.36, z, 0.9, 0.72, 0.55, "#e8d2a6");
  k.box(x, 0.74, z, 0.94, 0.04, 0.6, "#b9874f");
  k.box(x, 0.22, z + 0.55, 0.5, 0.44, 0.45, CHAIRS[i % 4]);
  k.box(x, 0.62, z + 0.78, 0.5, 0.45, 0.06, CHAIRS[i % 4]);
}
function sofa(k: RoomKit, x: number, z: number, len: number, c: string, facing: 1 | -1) {
  k.box(x, 0.25, z, len, 0.5, 0.8, c, true);
  k.box(x, 0.65, z - facing * 0.32, len, 0.5, 0.16, c);
}
function plant(k: RoomKit, x: number, z: number) {
  k.box(x, 0.25, z, 0.45, 0.5, 0.45, "#b56b45", true);
  k.box(x, 0.8, z, 0.7, 0.6, 0.7, "#3f9b5a");
}

const BUILDERS: Partial<Record<Room["kind"], (k: RoomKit) => void>> = {
  classroom(k) {
    k.floor(WOOD);
    k.board(k.room.name);
    const [a, b] = k.span(true);
    k.box((a + b) / 2, 0.45, -k.d / 2 + 1.4, 1.6, 0.9, 0.7, "#9a6b3f", true); // teacher desk
    let n = 0;
    k.seatGrid(-k.w / 2 + 1.1, k.w / 2 - 1, -1.4, 2.6, 1.7, 1.45, (x, z) => desk(k, x, z, n++));
    k.cabinets(false, 1.1, 0.55, "#d8cdb8", BINS);
  },
  care(k) {
    k.floor("#e9d7b9");
    k.box(-0.8, 0.012, 0.3, Math.min(6, k.w - 3), 0.01, 4.5, "#ffcf99");
    k.board(k.room.name, "#fff3d6", "#8a5a00", 4);
    k.seatGrid(-k.w / 2 + 1.6, k.w / 2 - 2, -1.2, 1.8, 2.6, 3, (x, z, i) => {
      k.box(x, 0.22, z, 1.4, 0.44, 0.8, "#f4a261", true);
      k.box(x - 0.9, 0.12, z, 0.5, 0.24, 0.5, CHAIRS[i % 4]);
      k.box(x + 0.9, 0.12, z, 0.5, 0.24, 0.5, CHAIRS[(i + 1) % 4]);
    });
    k.cabinets(false, 0.9, 0.5, "#ffffff", BINS);
  },
  kinder(k) {
    BUILDERS.care!(k);
    k.box(-k.w / 2 + 1.2, 0.6, -2.6, 1.4, 1.2, 1.2, "#ff9aa2", true); // playhouse
    k.box(-k.w / 2 + 1.2, 1.35, -2.6, 1.6, 0.3, 1.4, "#e5383b");
  },
  office(k) {
    k.floor("#d6cfc2");
    k.cabinets(true, 1.8, 0.45, "#c9ced6", ["#b0b7c3", "#9aa3b0"]);
    const left = -k.w / 2 + 1.4;
    for (const [dx, dz] of [[0, -1], [1.3, -1], [0, 0.6], [1.3, 0.6]] as const) {
      const x = left + dx;
      const z = dz;
      k.box(x, 0.37, z, 1.2, 0.74, 0.7, "#e6e6e6", true);
      k.box(x, 1.0, z - 0.2, 0.55, 0.38, 0.04, "#1f2328");
    }
    if (k.w >= 8) k.box(k.w / 2 - 2.4, 0.37, -2.2, 1, 0.74, 1, "#b9874f", true);
    plant(k, -k.w / 2 + 0.5, k.d / 2 - 0.6);
  },
  storage(k) {
    k.floor("#cfc8bb");
    k.sideShelf(-1, 2, BINS);
    if (k.w >= 5) k.sideShelf(1, 2, BINS);
    if (k.w >= 9) k.box(-0.5, 0.8, 0, 0.8, 1.6, 4, "#a47148", true);
  },
  counsel(k) {
    k.floor("#efe2cf");
    k.box(-0.5, 0.012, 0.2, 3.6, 0.01, 3, "#cdb4db");
    sofa(k, -0.8, -1.4, 2.4, "#90a955", 1);
    k.box(-0.8, 0.22, 0.2, 1.2, 0.44, 0.7, "#b9874f", true);
    k.box(-2, 0.22, 1.4, 0.6, 0.44, 0.6, "#f4a261");
    plant(k, -k.w / 2 + 0.5, -k.d / 2 + 0.6);
    k.cabinets(false, 1.6, 0.4, "#a47148", BOOKS);
  },
  meeting(k) {
    k.floor("#d6cfc2");
    k.board(k.room.name, "#f5f5f0", "#2f5f9e");
    const len = Math.min(k.w - 3.5, 6);
    const x = -k.w / 2 + 1.2 + len / 2;
    k.box(x, 0.37, 0.2, len, 0.74, 1.4, "#8d6346", true);
    for (let i = 0; i < Math.floor(len / 0.9); i++) {
      const cx = x - len / 2 + 0.45 + i * 0.9;
      k.box(cx, 0.25, -0.9, 0.45, 0.5, 0.45, "#3d405b");
      k.box(cx, 0.25, 1.3, 0.45, 0.5, 0.45, "#3d405b");
    }
  },
  principal(k) {
    k.floor("#cbb79a");
    k.box(-1.5, 0.4, -3, 2.2, 0.8, 1, "#6b4226", true);
    k.box(-1.5, 0.55, -3.9, 0.6, 1.1, 0.5, "#2b2d42");
    sofa(k, -2.2, 0.4, 2.2, "#7f5539", 1);
    sofa(k, -2.2, 2.6, 2.2, "#7f5539", -1);
    k.box(-2.2, 0.22, 1.5, 1.4, 0.44, 0.8, "#b08968", true);
    k.cabinets(false, 1.8, 0.45, "#a47148", BOOKS);
    k.sign(1.6, 1.6, -k.d / 2 + 0.12, 1.6, 0.7, "학교 비전: 꿈·끼·사랑", "#fff8e7", "#7a5c3e");
  },
  staff(k) {
    k.floor("#d6cfc2");
    k.board("교무실 일정", "#f5f5f0", "#2f5f9e", 6);
    k.seatGrid(-k.w / 2 + 1.6, k.w / 2 - 3, -1.4, 1.8, 2.8, 3.2, (x, z) => {
      for (const [dx, dz] of [[-0.6, -0.4], [0.6, -0.4], [-0.6, 0.4], [0.6, 0.4]] as const) {
        k.box(x + dx, 0.37, z + dz, 1.1, 0.74, 0.7, "#e6e6e6", true);
        k.box(x + dx, 1.0, z + dz - (dz < 0 ? 0.2 : -0.2), 0.5, 0.36, 0.04, "#1f2328");
      }
    });
  },
  health(k) {
    k.floor("#e8f1f2");
    for (let i = 0; i < 2; i++) {
      const x = -k.w / 2 + 1 + i * 2;
      k.box(x, 0.3, -2.5, 0.9, 0.6, 2, "#ffffff", true);
      k.box(x, 0.65, -3.3, 0.8, 0.12, 0.4, "#a8dadc");
      k.box(x + 0.75, 1.1, -2.5, 0.04, 2.2, 2.2, "#bde0fe");
    }
    k.box(1, 0.37, 1, 1.4, 0.74, 0.7, "#e6e6e6", true);
    k.cabinets(false, 1.8, 0.45, "#ffffff", ["#e63946", "#a8dadc"]);
    k.sign(k.span(true)[1] - 0.6, 1.5, -k.d / 2 + 0.12, 0.8, 1.2, "시력표", "#ffffff", "#222222");
  },
  gym(k) {
    const big = k.w >= 20;
    k.floor("#d6a96f");
    k.box(0, 0.012, 0.3, k.w - 3, 0.01, 0.08, "#ffffff");
    k.box(0, 0.012, 0.3, 0.08, 0.01, k.d - 3, "#ffffff");
    if (big) {
      // stage at the front, as in the plan's 체육관 <무대>
      k.box(-2, 0.5, -k.d / 2 + 1.3, 14, 1, 2.4, "#7a4e2d", true);
      k.sign(-2, 2.2, -k.d / 2 + 0.12, 13.6, 2.4, " ", "#9b1c31", "#9b1c31");
      k.sign(-2, 2.9, -k.d / 2 + 0.15, 6, 0.6, `${SCHOOL_NAME} 체육관`, "#9b1c31", "#ffe9a8");
    }
    for (const s of [-1, 1] as const) k.box(s * (k.w / 2 - 0.15), 2.3, 0.3, 0.1, 1, 1.4, "#ffffff");
    for (let i = 0; i < (big ? 6 : 3); i++) k.box(-k.w / 2 + 1.5 + i * 1.6, 0.06, k.d / 2 - 1.3, 1.4, 0.12, 1.9, "#457b9d");
    k.box(k.w / 2 - 4.2, 0.4, k.d / 2 - 1, 0.9, 0.8, 0.6, "#6c757d", true);
  },
  dance(k) {
    k.floor("#d6a96f");
    const [a, b] = k.span(true);
    k.box((a + b) / 2, 1.2, -k.d / 2 + 0.06, b - a, 2, 0.04, "#dfe9f3"); // mirror wall
    k.box(-k.w / 2 + 0.25, 1, 0, 0.06, 0.06, k.d - 2, "#8a6a45"); // barre
    k.sign((a + b) / 2, 2.3, -k.d / 2 + 0.1, 2.4, 0.4, "무용실", "#ffffff", "#9b2c5a");
  },
  safety(k) {
    k.floor("#e9ecef");
    k.board("안전체험관 · 불이 나면 119", "#c1121f", "#ffffff", 6);
    for (let i = 0; i < 4; i++) k.box(-k.w / 2 + 2 + i * 1.2, 0.8, -1.5, 0.1, 1.6, 2.2, "#adb5bd"); // smoke tunnel frame
    k.box(-k.w / 2 + 3.8, 1.65, -1.5, 3.8, 0.1, 2.2, "#adb5bd");
    for (let i = 0; i < 3; i++) {
      k.box(1 + i * 1.6, 0.04, 1.5, 1.2, 0.08, 0.8, "#e63946");
      k.box(1 + i * 1.6, 0.16, 1.5, 0.35, 0.16, 0.6, "#f1faee");
    }
    k.box(-k.w / 2 + 1, 0.3, 2.8, 0.25, 0.6, 0.25, "#d62828", true);
    k.box(-k.w / 2 + 1.6, 0.3, 2.8, 0.25, 0.6, 0.25, "#d62828", true);
  },
  cafeteria(k) {
    k.floor("#e3e7ea");
    const [a, b] = k.span(true);
    k.box((a + b) / 2, 0.45, -k.d / 2 + 0.6, b - a, 0.9, 0.9, "#adb5bd", true); // serving counter
    for (let x = a + 0.5; x < b - 0.3; x += 0.9) k.box(x, 0.93, -k.d / 2 + 0.6, 0.6, 0.06, 0.6, "#ced4da");
    k.seatGrid(-k.w / 2 + 2, k.w / 2 - 4, -1.6, 2.6, 4, 2.1, (x, z) => {
      k.box(x, 0.37, z, 3, 0.74, 0.8, "#f8f9fa", true);
      for (let i = 0; i < 4; i++) {
        k.box(x - 1.15 + i * 0.77, 0.22, z - 0.65, 0.35, 0.44, 0.35, "#ffb703");
        k.box(x - 1.15 + i * 0.77, 0.22, z + 0.65, 0.35, 0.44, 0.35, "#ffb703");
      }
    });
  },
  science(k) {
    k.floor(WOOD);
    k.board(`${k.room.name} · 오늘의 실험`);
    const glass = ["#7fd1ff", "#9ef0a8", "#ffd27f", "#ff9ec7"];
    k.seatGrid(-k.w / 2 + 2, k.w / 2 - 3.5, -1.2, 2.2, 3.6, 3, (x, z, i) => {
      k.box(x, 0.42, z, 2.6, 0.84, 1.3, "#d7d9dc", true);
      k.box(x, 0.87, z, 2.7, 0.06, 1.4, "#2b2d31");
      k.box(x + 1.05, 0.92, z, 0.4, 0.04, 0.6, "#9aa3ad");
      for (let j = 0; j < 3; j++) k.box(x - 0.8 + j * 0.35, 1.02, z - 0.2 + (j % 2) * 0.35, 0.14, 0.24, 0.14, glass[(i + j) % 4]);
    });
    k.cabinets(false, 1.8, 0.5, "#b8c4cc", glass);
    // skeleton model
    k.box(-k.w / 2 + 0.6, 1.3, -k.d / 2 + 0.9, 0.4, 0.5, 0.18, "#f3efe6");
    k.box(-k.w / 2 + 0.6, 1.75, -k.d / 2 + 0.9, 0.28, 0.3, 0.28, "#f3efe6");
    k.box(-k.w / 2 + 0.6, 0.5, -k.d / 2 + 0.9, 0.25, 1, 0.1, "#f3efe6");
  },
  music(k) {
    k.floor(WOOD);
    k.board("♪ 이달의 노래", "#fbfbf7", "#3a3a3a");
    k.box(-k.w / 2 + 1.4, 0.65, -k.d / 2 + 0.9, 2.1, 1.3, 0.6, "#151515", true); // piano
    k.box(-k.w / 2 + 1.4, 0.85, -k.d / 2 + 1.3, 1.8, 0.04, 0.3, "#f5f5f0");
    k.box(-k.w / 2 + 4, 0.6, -k.d / 2 + 1.1, 1.6, 0.1, 0.6, "#6b4f3a", true); // xylophone
    k.box(k.w / 2 - 4.2, 0.35, -k.d / 2 + 1.2, 1, 0.7, 1, "#c0392b", true); // drum
    [3.4, 5.2, 7].forEach((r, row) => {
      const n = 5 + row * 2;
      for (let i = 0; i < n; i++) {
        const t = (-0.5 + i / (n - 1)) * Math.PI * 0.6;
        const x = Math.sin(t) * r * 0.95;
        const z = -k.d / 2 + Math.cos(t) * r;
        k.box(x, 0.22, z, 0.45, 0.44, 0.45, ["#e07a5f", "#3d405b", "#81b29a"][row]);
      }
    });
  },
  orchestra(k) {
    k.floor(WOOD);
    k.board("오케스트라 연습", "#fbfbf7", "#3a3a3a");
    k.box(0, 0.15, -k.d / 2 + 1.3, 1.2, 0.3, 1, "#6b4226", true); // podium
    k.seatGrid(-k.w / 2 + 1.4, k.w / 2 - 3.5, -1.4, 2.8, 1.4, 1.4, (x, z, i) => {
      k.box(x, 0.22, z, 0.45, 0.44, 0.45, "#3d405b");
      k.box(x, 0.9, z - 0.5, 0.4, 0.04, 0.3, "#2b2d42");
      if (i % 3 === 0) k.box(x + 0.35, 0.6, z, 0.25, 1.2, 0.15, "#8d5524");
    });
  },
  art(k) {
    k.floor("#e9e3d6");
    k.board("작품 전시", "#ffffff", "#7a2e8c");
    k.seatGrid(-k.w / 2 + 2, k.w / 2 - 4, -1.2, 2.2, 3.4, 3, (x, z) => {
      k.box(x, 0.37, z, 2.4, 0.74, 1.4, "#f1e9da", true);
      k.box(x - 0.5, 0.76, z, 0.4, 0.02, 0.3, "#ffbe0b");
      k.box(x + 0.4, 0.76, z + 0.2, 0.3, 0.02, 0.3, "#3a86ff");
    });
    for (let i = 0; i < 3; i++) k.box(-k.w / 2 + 1 + i * 1.3, 0.9, k.d / 2 - 1.3, 0.8, 1, 0.06, ["#ffadad", "#caffbf", "#a0c4ff"][i]); // easels
    k.cabinets(false, 1, 0.5, "#ffffff", ["#ff595e", "#ffca3a", "#8ac926", "#1982c4"]);
  },
  cooking(k) {
    k.floor("#e3e7ea");
    k.board("실과실 · 손 씻고 시작해요", "#ffffff", "#2a9d8f");
    k.seatGrid(-k.w / 2 + 2, k.w / 2 - 4, -1.2, 2.2, 3.6, 3, (x, z) => {
      k.box(x, 0.45, z, 2.6, 0.9, 1.3, "#dee2e6", true);
      k.box(x - 0.6, 0.91, z, 0.6, 0.02, 0.6, "#212529");
      k.box(x + 0.6, 0.91, z, 0.5, 0.02, 0.4, "#9aa3ad");
    });
    k.box(-k.w / 2 + 0.5, 0.9, -k.d / 2 + 0.6, 0.8, 1.8, 0.8, "#f8f9fa", true); // fridge
  },
  library(k) {
    k.floor("#d9c3a0");
    k.cabinets(false, 1.8, 0.6, "#a47148", BOOKS);
    k.sideShelf(-1, 1.8, BOOKS);
    if (k.w >= 12) {
      k.sideShelf(1, 1.8, BOOKS);
      k.sign(-2, 1.6, -k.d / 2 + 0.13, 4.4, 0.8, "책 속에 길이 있어요", "#fff8e7", "#7a5c3e");
      k.seatGrid(-k.w / 2 + 3, k.w / 2 - 5, -0.6, 1.4, 4, 2, (x, z) => {
        k.box(x, 0.36, z, 2.4, 0.72, 1.2, "#e3c49a", true);
        for (const dx of [-0.6, 0.6]) {
          k.box(x + dx, 0.22, z - 0.9, 0.42, 0.44, 0.42, "#7fb069");
          k.box(x + dx, 0.22, z + 0.9, 0.42, 0.44, 0.42, "#7fb069");
        }
      });
      k.box(k.w / 2 - 4.6, 0.5, -2.8, 2.2, 1, 0.7, "#8d6346", true); // circulation desk
      k.sign(k.w / 2 - 4.6, 1.15, -3.16, 2, 0.3, "대출 · 반납", "#8d6346", "#ffffff");
    } else {
      k.box(0, 0.2, 0.5, 0.9, 0.4, 0.9, "#ffadad");
      k.box(0, 0.2, 1.7, 0.9, 0.4, 0.9, "#9bf6ff");
    }
  },
  computer(k) {
    k.floor("#b7c0c7");
    k.board(k.room.name.includes("스마트") ? "스마트교실 · 다목적실" : "안전한 인터넷 사용", "#fafafa", "#2f5f9e");
    for (const z of [-1.4, 0.8, 3]) {
      const x0 = -k.w / 2 + 0.8;
      const x1 = k.w / 2 - 3.8;
      k.box((x0 + x1) / 2, 0.37, z, x1 - x0, 0.74, 0.8, "#e6e6e6", true);
      for (let x = x0 + 0.6; x < x1 - 0.3; x += 1.5) {
        k.box(x, 1.05, z - 0.15, 0.75, 0.48, 0.05, "#1f2328");
        k.box(x, 1.05, z - 0.12, 0.66, 0.4, 0.02, "#4aa3df");
        k.box(x, 0.22, z + 0.7, 0.48, 0.44, 0.45, "#2d6a4f");
      }
    }
  },
  theater(k) {
    k.floor("#6d597a");
    k.board("시청각실", "#111111", "#ffffff", 7);
    for (let r = 0; r < 5; r++) {
      const z = -1.6 + r * 1.3;
      k.box(-1, 0.05 + r * 0.12, z, k.w - 5, 0.1 + r * 0.24, 1.2, "#5a4a66");
      for (let x = -k.w / 2 + 1.5; x < k.w / 2 - 4; x += 0.8) k.box(x, 0.3 + r * 0.24, z, 0.55, 0.45, 0.5, "#9b2226");
    }
  },
  broadcast(k) {
    k.floor("#343a40");
    k.box(-0.8, 0.4, -2.8, 3, 0.8, 0.9, "#495057", true);
    for (let i = 0; i < 3; i++) k.box(-1.8 + i, 1.05, -3.1, 0.8, 0.5, 0.05, "#4aa3df");
    k.sign(-0.8, 2, -k.d / 2 + 0.12, 1.6, 0.45, "● ON AIR", "#d00000", "#ffffff");
    k.box(-1.6, 0.8, 0.8, 0.1, 1.6, 0.1, "#adb5bd");
    k.box(-1.6, 1.65, 0.8, 0.4, 0.3, 0.5, "#212529");
  },
  lounge(k) {
    k.floor("#efe2cf");
    sofa(k, -0.8, -2.6, 2.6, "#577590", 1);
    k.box(-0.8, 0.22, -1, 1.2, 0.44, 0.7, "#b9874f", true);
    k.box(-k.w / 2 + 0.5, 0.6, 2.8, 0.5, 1.2, 0.5, "#e9ecef", true); // water dispenser
    k.box(-k.w / 2 + 1.3, 0.9, 2.8, 0.8, 1.8, 0.7, "#f8f9fa", true); // fridge
    plant(k, k.w / 2 - 0.6, -k.d / 2 + 0.6);
  },
  shower(k) {
    k.floor("#bde0fe");
    for (let i = 0; i < 3; i++) k.box(-k.w / 2 + 0.05, 1, -3 + i * 1.6, 1.6, 2, 0.06, "#e9ecef");
    k.sign(0, 2, -k.d / 2 + 0.12, 2, 0.45, k.room.name, "#ffffff", "#1d3557");
  },
  stands(k) {
    k.floor("#9aa3ad");
    for (let r = 0; r < 4; r++) k.box(-1.5, 0.2 + r * 0.4, -2.6 + r * 1.2, k.w - 6, 0.4 + r * 0.8, 1.1, ["#e9c46a", "#f4a261", "#e76f51", "#2a9d8f"][r]);
    k.box(-1.5, 0.55, -4.2, k.w - 6, 0.06, 0.06, "#495057"); // railing
    k.sign(-1.5, 2.2, -k.d / 2 + 0.12, 5, 0.5, "관람석 · 아래는 3층 체육관", "#2a9d8f", "#ffffff");
  },
  sleep(k) {
    k.floor("#f1e3d3");
    k.seatGrid(-k.w / 2 + 1, k.w / 2 - 3.2, -2.6, 2.6, 1.3, 1.9, (x, z, i) => {
      k.box(x, 0.08, z, 1, 0.16, 1.7, "#ffffff");
      k.box(x, 0.18, z + 0.3, 0.95, 0.04, 1, ["#ffadad", "#caffbf", "#9bf6ff", "#ffd6a5"][i % 4]);
      k.box(x, 0.2, z - 0.6, 0.6, 0.12, 0.3, "#fefae0");
    });
  },
  hall(k) {
    k.floor("#d9d2c3");
    plant(k, -k.w / 2 + 0.6, -k.d / 2 + 0.6);
    plant(k, k.w / 2 - 0.6, -k.d / 2 + 0.6);
    k.box(0, 0.25, -2.6, 2.4, 0.5, 0.6, "#a47148", true); // bench
    k.box(0, 1, -k.d / 2 + 0.3, 3, 2, 0.5, "#c8b28c", true); // trophy case
    k.sign(0, 2.3, -k.d / 2 + 0.6, 2.6, 0.4, "중앙홀", "#2f5f9e", "#ffffff");
  },
  entrance(k) {
    k.floor("#d9d2c3");
    for (const s of [-1, 1] as const) {
      const x = s * (k.w / 2 - 0.4);
      k.box(x, 0.7, 0.5, 0.7, 1.4, 6, "#c8b28c", true);
      for (let z = -2.3; z < 3.3; z += 0.5) for (const y of [0.3, 0.7, 1.1]) k.box(x - s * 0.36, y, z, 0.02, 0.3, 0.42, "#5b4a36");
    }
    k.sign(0, 1.8, -k.d / 2 + 0.6, 3.2, 0.5, "어서 오세요!", "#fff3b0", "#7a4b00");
  },
  wc(k) {
    k.floor("#cfe8ef");
    for (let i = 0; i < 2; i++) k.box(-k.w / 2 + 0.9 + i * 1.3, 1, -k.d / 2 + 1, 0.06, 2, 1.8, "#8ecae6");
    k.box(k.w / 2 - 0.4, 0.45, 1.4, 0.5, 0.9, 2, "#ffffff", true); // sinks
    k.sign(0, 2.1, -k.d / 2 + 0.12, 2, 0.5, "화장실 (남 · 여)", "#ffffff", "#1d3557");
  },
  stairs(k) {
    k.floor("#d9d2c3");
  },
  void(k) {
    k.box(0, WALL_H / 2, 0, k.w, WALL_H, k.d, "#cbbfa6", true);
  },
};

// ---------- floor assembly ----------
type Seg = { minX: number; maxX: number; minZ: number; maxZ: number; h: number };
const hSeg = (z: number, x1: number, x2: number, h: number, gaps: { minX: number; maxX: number }[] = []): Seg[] => {
  const out: Seg[] = [];
  let start = x1;
  for (const g of [...gaps].sort((a, b) => a.minX - b.minX)) {
    if (g.minX > start) out.push({ minX: start, maxX: g.minX, minZ: z - WALL_T / 2, maxZ: z + WALL_T / 2, h });
    start = Math.max(start, g.maxX);
  }
  if (x2 > start) out.push({ minX: start, maxX: x2, minZ: z - WALL_T / 2, maxZ: z + WALL_T / 2, h });
  return out;
};
const vSeg = (x: number, z1: number, z2: number, h: number): Seg => ({ minX: x - WALL_T / 2, maxX: x + WALL_T / 2, minZ: z1, maxZ: z2, h });

function floorWalls(f: Floor): Seg[] {
  const segs: Seg[] = [];
  const hasSouth = f.maxZ > CORRIDOR_HALF + 0.1;
  segs.push(...hSeg(f.minZ, f.minX, f.maxX, WALL_H));
  segs.push(...hSeg(f.maxZ, f.minX, f.maxX, LOW_WALL_H, f.exit ? [exitDoor(f)] : []));
  segs.push(vSeg(f.minX, f.minZ, f.maxZ, WALL_H), vSeg(f.maxX, f.minZ, f.maxZ, WALL_H));
  for (const row of ["north", "south"] as const) {
    if (row === "south" && !hasSouth) continue;
    const rooms = f.rooms.filter((r) => r.row === row);
    const z = row === "north" ? -CORRIDOR_HALF : CORRIDOR_HALF;
    const gaps = rooms.filter((r) => r.kind !== "void").map((r) => (OPEN_KINDS.has(r.kind) ? { minX: r.minX + 0.1, maxX: r.maxX - 0.1 } : doorGap(r)));
    segs.push(...hSeg(z, f.minX, f.maxX, WALL_H, gaps));
    for (const r of rooms.slice(0, -1)) segs.push(vSeg(r.maxX, r.minZ, r.maxZ, WALL_H));
  }
  return segs;
}

function buildFloor(f: Floor): Built & { segs: Seg[] } {
  const out: Built = { items: [], signs: [], solids: [] };
  for (const r of f.rooms) {
    const k = new RoomKit(r, out);
    (BUILDERS[r.kind] ?? BUILDERS.office!)(k);
    if (r.kind === "void") continue;
    // nameplate above the door / opening, readable from the corridor
    const g = OPEN_KINDS.has(r.kind) ? { minX: r.minX, maxX: r.maxX } : doorGap(r);
    const z = r.row === "north" ? -CORRIDOR_HALF + 0.18 : CORRIDOR_HALF - 0.18;
    out.signs.push({ p: [(g.minX + g.maxX) / 2, WALL_H + 0.35, z], size: [Math.min(3.2, Math.max(2, r.name.length * 0.28)), 0.5], text: r.name, bg: "#ffffff", fg: "#1f3f6e" });
  }
  // stairs pads and signs (floor-local), from the shared portal list
  for (const p of PORTALS.filter((q) => q.from === f.id)) {
    const x0 = p.minX - f.cx;
    const x1 = p.maxX - f.cx;
    const z0 = p.minZ - f.cz;
    const z1 = Math.min(p.maxZ - f.cz, f.maxZ);
    const color = p.kind === "up" ? "#4f86c6" : p.kind === "down" ? "#e09f3e" : "#3bb273";
    out.items.push({ p: [(x0 + x1) / 2, 0.02, (z0 + z1) / 2], s: [x1 - x0, 0.02, z1 - z0], c: color });
    if (p.kind === "up" || p.kind === "down") {
      // steps going up (light) or down (dark) behind the pad
      for (let i = 0; i < 6; i++) {
        const z = z0 - 0.5 - i * 0.9;
        const h = p.kind === "up" ? 0.15 * (i + 1) : 0.02;
        out.items.push({ p: [(x0 + x1) / 2, h / 2, z], s: [x1 - x0, h, 0.88], c: p.kind === "up" ? (i % 2 ? "#cfc6b4" : "#bfb5a1") : i % 2 ? "#8d8574" : "#7a7262" });
      }
    }
    const signZ = p.kind === "exit" ? f.maxZ - 0.25 : z0 - 0.1;
    out.signs.push({ p: [(x0 + x1) / 2, p.kind === "exit" ? WALL_H + 0.35 : 2.2, signZ], size: [2.4, 0.5], text: p.kind === "exit" ? "▼ 나가기 (운동장)" : p.label, bg: color, fg: "#ffffff" });
  }
  out.signs.push({ p: [f.minX + 4, WALL_H + 0.35, -CORRIDOR_HALF + 0.18], size: [3.4, 0.5], text: `${SCHOOL_NAME} ${f.label}`, bg: "#2f5f9e", fg: "#ffffff" });
  const segs = floorWalls(f);
  out.solids.push(...segs.map((s): Collider => ({ kind: "box", minX: s.minX, maxX: s.maxX, minZ: s.minZ, maxZ: s.maxZ })));
  return { ...out, segs };
}

const cache = new Map<string, ReturnType<typeof buildFloor>>();
function floorData(id: string) {
  let d = cache.get(id);
  if (!d) {
    d = buildFloor(FLOOR_BY_ID[id]);
    cache.set(id, d);
  }
  return d;
}
const worldColliders = new Map<string, Collider[]>();

export function resolveInterior(zone: string, pos: THREE.Vector3) {
  const f = FLOOR_BY_ID[zone];
  let cs = worldColliders.get(zone);
  if (!cs) {
    cs = floorData(zone).solids.map((c) =>
      c.kind === "box"
        ? { ...c, minX: c.minX + f.cx, maxX: c.maxX + f.cx, minZ: c.minZ + f.cz, maxZ: c.maxZ + f.cz }
        : { ...c, x: c.x + f.cx, z: c.z + f.cz },
    );
    worldColliders.set(zone, cs);
  }
  pushOut(pos, cs);
  pos.x = THREE.MathUtils.clamp(pos.x, f.cx + f.minX + 0.5, f.cx + f.maxX - 0.5);
  pos.z = THREE.MathUtils.clamp(pos.z, f.cz + f.minZ + 0.5, f.cz + f.maxZ - 0.5);
}

let interiorMats: ReturnType<typeof makeInteriorMaterials> | null = null;
function makeInteriorMaterials() {
  return {
    plain: new THREE.MeshStandardMaterial({ roughness: 0.6 }), // painted metal / plastic / fabric
    grain: worldMapped("grain", 1.2, { roughness: 0.55 }),
    planks: worldMapped("planks", 2.4, { roughness: 0.45 }),
    vinyl: worldMapped("vinyl", 2.4, { roughness: 0.4 }),
    terrazzo: worldMapped("terrazzo", 3, { roughness: 0.3, color: "#d9dbd3" }),
    plaster: worldMapped("plaster", 3, { roughness: 0.9 }),
    dayGlass: new THREE.MeshStandardMaterial({ color: "#cfe6f7", emissive: "#bcdcf5", emissiveIntensity: 0.55, roughness: 0.1 }),
    nightGlass: new THREE.MeshStandardMaterial({ color: "#1d2a40", roughness: 0.1, metalness: 0.5 }),
    frame: materials().frame,
  };
}
const interiorMaterials = () => (interiorMats ??= makeInteriorMaterials());

export default function Interior({ zone, dark }: { zone: string; dark: boolean }) {
  const f = FLOOR_BY_ID[zone];
  const data = floorData(zone);
  const walls = useMemo(() => {
    const out: Item[] = [];
    for (const s of data.segs) {
      const w = s.maxX - s.minX;
      const d = s.maxZ - s.minZ;
      const cx = (s.minX + s.maxX) / 2;
      const cz = (s.minZ + s.maxZ) / 2;
      out.push({ p: [cx, s.h / 2, cz], s: [w, s.h, d], c: dark ? "#cbbfa6" : "#f4ead3" });
      out.push({ p: [cx, Math.min(0.5, s.h / 2), cz], s: [w + 0.04, Math.min(1, s.h), d + 0.04], c: "#8fb39a" });
    }
    return out;
  }, [data, dark]);
  const M = interiorMaterials();
  const groups = useMemo(() => {
    const by: Record<string, Item[]> = { plain: [], grain: [], planks: [], vinyl: [] };
    for (const it of data.items) by[it.m ?? "plain"].push(it);
    return by;
  }, [data]);
  const windows = useMemo(() => {
    // daylight windows along the outer back wall (inner face), between 1.0 m and 2.1 m
    const glass: Item[] = [];
    const frames: Item[] = [];
    const z = f.minZ + WALL_T / 2 + 0.02;
    // wall spans already used by boards, cabinets and shelves taller than the sill
    const busy = data.items
      .filter((it) => it.p[2] - it.s[2] / 2 < f.minZ + 1.2 && it.p[1] + it.s[1] / 2 > 0.95 && it.s[0] < f.maxX - f.minX - 1)
      .map((it) => [it.p[0] - it.s[0] / 2, it.p[0] + it.s[0] / 2])
      .concat(data.signs.filter((s) => s.p[2] < f.minZ + 1.2 && s.p[1] + s.size[1] / 2 > 0.95).map((s) => [s.p[0] - s.size[0] / 2, s.p[0] + s.size[0] / 2]));
    const walls = data.segs.filter((s) => Math.abs((s.minZ + s.maxZ) / 2 - f.minZ) < 0.2);
    for (let x = f.minX + 1.4; x < f.maxX - 1.2; x += 2.4) {
      if (busy.some(([a, b]) => x + 1.05 > a && x - 1.05 < b)) continue;
      if (!walls.some((s) => x - 1.05 >= s.minX && x + 1.05 <= s.maxX)) continue;
      glass.push({ p: [x, 1.55, z], s: [2.0, 1.1, 0.02], c: "#ffffff" });
      frames.push({ p: [x, 2.12, z + 0.02], s: [2.1, 0.06, 0.05], c: "#ffffff" }, { p: [x, 0.98, z + 0.04], s: [2.2, 0.06, 0.12], c: "#ffffff" });
      frames.push({ p: [x - 1.03, 1.55, z + 0.02], s: [0.06, 1.2, 0.05], c: "#ffffff" }, { p: [x, 1.55, z + 0.02], s: [0.04, 1.1, 0.04], c: "#ffffff" });
    }
    return { glass, frames };
  }, [f, data]);
  M.terrazzo.color.set(dark ? "#8f9489" : "#d9dbd3");
  return (
    <group position={[f.cx, 0, f.cz]}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, (f.minZ + f.maxZ) / 2]} receiveShadow material={M.terrazzo}>
        <planeGeometry args={[f.maxX - f.minX, f.maxZ - f.minZ]} />
      </mesh>
      <BoxInstances items={groups.plain} material={M.plain} />
      <BoxInstances items={groups.grain} material={M.grain} />
      <BoxInstances items={groups.planks} material={M.planks} shadow={false} />
      <BoxInstances items={groups.vinyl} material={M.vinyl} shadow={false} />
      <BoxInstances items={walls} material={M.plaster} />
      <BoxInstances items={windows.glass} material={dark ? M.nightGlass : M.dayGlass} shadow={false} />
      <BoxInstances items={windows.frames} material={M.frame} shadow={false} />
      {data.signs.map((s, i) => (
        <Sign key={i} p={s.p} size={s.size} text={s.text} bg={s.bg} fg={s.fg} />
      ))}
    </group>
  );
}
