// Interiors: main building floors 1-2 (classrooms + special rooms) and the auditorium.
// Dollhouse view: no ceilings and low walls, so the steep indoor camera can see into rooms.
import { useMemo } from "react";
import * as THREE from "three";
import { Box, BoxInstances, Pole, Sign, box, circle, pushOut, useTextTexture, type Collider, type V3 } from "./parts";
import { EXIT_DOOR, FLOOR_ROOMS, STAIRS, ZONES, doorOf, type Room, type ZoneId } from "./zones";
import { SCHOOL_NAME } from "./School";

const WALL_H = 2.4;
const WALL_T = 0.2;
const HALL_WALL_H = 3;

type Item = { p: V3; s: V3; c: string };
type Seg = { minX: number; maxX: number; minZ: number; maxZ: number; h?: number };
const LOW_WALL_H = 1; // walls between the camera and the room are cut down (dollhouse cutaway)

// ---------- walls ----------
/** Horizontal wall along x at z, split around door gaps. */
function hWall(z: number, x1: number, x2: number, gaps: { minX: number; maxX: number }[] = []): Seg[] {
  const out: Seg[] = [];
  let start = x1;
  for (const g of [...gaps].sort((a, b) => a.minX - b.minX)) {
    if (g.minX > start) out.push({ minX: start, maxX: g.minX, minZ: z - WALL_T / 2, maxZ: z + WALL_T / 2 });
    start = Math.max(start, g.maxX);
  }
  if (x2 > start) out.push({ minX: start, maxX: x2, minZ: z - WALL_T / 2, maxZ: z + WALL_T / 2 });
  return out;
}
function vWall(x: number, z1: number, z2: number, gaps: { minZ: number; maxZ: number }[] = []): Seg[] {
  const out: Seg[] = [];
  let start = z1;
  for (const g of [...gaps].sort((a, b) => a.minZ - b.minZ)) {
    if (g.minZ > start) out.push({ minX: x - WALL_T / 2, maxX: x + WALL_T / 2, minZ: start, maxZ: g.minZ });
    start = Math.max(start, g.maxZ);
  }
  if (z2 > start) out.push({ minX: x - WALL_T / 2, maxX: x + WALL_T / 2, minZ: start, maxZ: z2 });
  return out;
}

function floorWalls(zone: "floor1" | "floor2"): Seg[] {
  const rooms = FLOOR_ROOMS[zone];
  const north = rooms.filter((r) => r.row === "north");
  const south = rooms.filter((r) => r.row === "south");
  const southGaps = south.map((r) =>
    r.kind === "lobby" || r.kind === "stairhall" ? { minX: r.minX + 0.1, maxX: r.maxX - 0.1 } : doorOf(r),
  );
  return [
    ...hWall(-12, -21, 21),
    ...hWall(12, -21, 21, zone === "floor1" ? [EXIT_DOOR] : []).map((s) => ({ ...s, h: LOW_WALL_H })),
    ...vWall(-21, -12, 12),
    ...vWall(21, -12, 12),
    ...hWall(-2, -21, 21, north.map(doorOf)),
    ...hWall(2, -21, 21, southGaps),
    ...vWall(-7, -12, -2),
    ...vWall(7, -12, -2),
    ...vWall(-7, 2, 12),
    ...vWall(7, 2, 12),
  ];
}
const HALL_DOOR = { minZ: 5, maxZ: 7 };
const hallWalls = (): Seg[] => [
  ...hWall(-10, -15, 15),
  ...hWall(10, -15, 15).map((s) => ({ ...s, h: LOW_WALL_H })),
  ...vWall(-15, -10, 10),
  ...vWall(15, -10, 10, [HALL_DOOR]),
];

function Walls({ segs, h, color, trim }: { segs: Seg[]; h: number; color: string; trim: string }) {
  const items = useMemo(() => {
    const out: Item[] = [];
    for (const s of segs) {
      const w = s.maxX - s.minX;
      const d = s.maxZ - s.minZ;
      const cx = (s.minX + s.maxX) / 2;
      const cz = (s.minZ + s.maxZ) / 2;
      const sh = s.h ?? h;
      out.push({ p: [cx, sh / 2, cz], s: [w, sh, d], c: color });
      out.push({ p: [cx, Math.min(0.5, sh / 2), cz], s: [w + 0.04, Math.min(1, sh), d + 0.04], c: trim }); // wainscot
    }
    return out;
  }, [segs, h, color, trim]);
  return <BoxInstances items={items} />;
}

// ---------- colliders ----------
// Lab table positions (science room, room-local); used by both colliders and meshes.
const LAB_TABLES: [number, number][] = [
  [-4, -0.8],
  [0, -0.8],
  [4, -0.8],
  [-4, 2.4],
  [0, 2.4],
];

const segColliders = (segs: Seg[]): Collider[] => segs.map((s) => ({ kind: "box", ...s }));

/** Room furniture colliders in room-local coordinates. */
function roomColliders(r: Room): Collider[] {
  const l: Collider[] = [];
  switch (r.kind) {
    case "classroom":
      l.push(box(-1, -3.4, 1.8, 0.8), box(-2.5, 4.6, 7, 0.6));
      break;
    case "science":
      for (const [x, z] of LAB_TABLES) l.push(box(x, z, 2.6, 1.3));
      l.push(box(-1, -3.6, 2.4, 0.9), box(-3, 4.6, 6, 0.6), circle(-6, -3.8, 0.4));
      break;
    case "music":
      l.push(box(-4.6, -3.1, 2.2, 1.5), box(-1.4, -3.5, 1.6, 0.6), circle(2.9, -3.6, 0.6), circle(4, -3.2, 0.4));
      break;
    case "library":
      l.push(box(0, 4.6, 13.2, 0.6), box(-6.6, 0, 0.6, 9), box(-1.6, 0.5, 2.4, 1.2), box(2, 0.5, 2.4, 1.2), box(1.5, -2.8, 2.4, 0.7));
      break;
    case "computer":
      for (const z of [-0.8, 1.6, 4]) l.push(box(-2, z, 8, 0.8));
      l.push(box(-4.5, -3.4, 1.8, 0.8));
      break;
    default:
      break;
  }
  const cx = (r.minX + r.maxX) / 2;
  const cz = (r.minZ + r.maxZ) / 2;
  return l.map((c) =>
    c.kind === "circle"
      ? { ...c, x: c.x + cx, z: c.z + cz }
      : { ...c, minX: c.minX + cx, maxX: c.maxX + cx, minZ: c.minZ + cz, maxZ: c.maxZ + cz },
  );
}

const stairColliders = (): Collider[] => [
  { kind: "box", minX: STAIRS.minX - 0.1, maxX: STAIRS.minX + 0.05, minZ: STAIRS.minZ + 0.6, maxZ: STAIRS.maxZ },
  { kind: "box", minX: STAIRS.maxX - 0.05, maxX: STAIRS.maxX + 0.1, minZ: STAIRS.minZ + 0.6, maxZ: STAIRS.maxZ },
];

const offset = (cs: Collider[], ox: number, oz: number): Collider[] =>
  cs.map((c) =>
    c.kind === "circle"
      ? { ...c, x: c.x + ox, z: c.z + oz }
      : { ...c, minX: c.minX + ox, maxX: c.maxX + ox, minZ: c.minZ + oz, maxZ: c.maxZ + oz },
  );

const COLLIDERS: Record<Exclude<ZoneId, "outdoor">, Collider[]> = (() => {
  const floor = (z: "floor1" | "floor2") =>
    offset(
      [
        ...segColliders(floorWalls(z)),
        ...FLOOR_ROOMS[z].flatMap(roomColliders),
        ...stairColliders(),
        ...(z === "floor1" ? [box(-6.45, 7, 0.7, 7.5)] : [circle(-5.5, 3, 0.4), circle(-5.5, 10.8, 0.4)]),
      ],
      ZONES[z].cx,
      ZONES[z].cz,
    );
  return {
    floor1: floor("floor1"),
    floor2: floor("floor2"),
    hall: offset([...segColliders(hallWalls()), box(0, -8.25, 16, 3.5)], ZONES.hall.cx, ZONES.hall.cz),
  };
})();

export function resolveInterior(zone: Exclude<ZoneId, "outdoor">, pos: THREE.Vector3) {
  pushOut(pos, COLLIDERS[zone]);
  const z = ZONES[zone];
  // Keep inside the outer walls (the door gaps lead onto portal mats, not outside).
  pos.x = THREE.MathUtils.clamp(pos.x, z.cx - z.hw + 0.5, z.cx + z.hw - 0.5);
  pos.z = THREE.MathUtils.clamp(pos.z, z.cz - z.hd + 0.5, z.cz + z.hd - 0.5);
}

// ---------- room furniture (room-local, front = north wall at z = -5) ----------
const W = 14;
const D = 10;
const WOOD = "#c99d6b";

function Board({ x = -1, w = 6, color = "#2f5d46", text }: { x?: number; w?: number; color?: string; text?: string }) {
  const tex = useTextTexture(text ?? " ", color, "#f4f1e6", 1024, 256);
  return (
    <group position={[x, 1.45, -D / 2 + 0.13]}>
      <Box p={[0, 0, -0.02]} s={[w + 0.2, 1.5, 0.04]} c="#8a6a45" shadow={false} />
      <mesh>
        <planeGeometry args={[w, 1.3]} />
        <meshStandardMaterial map={text ? tex : undefined} color={text ? "#ffffff" : color} />
      </mesh>
    </group>
  );
}

function Desks({ cols, rows, x0, z0, dx, dz }: { cols: number; rows: number; x0: number; z0: number; dx: number; dz: number }) {
  const items = useMemo(() => {
    const out: Item[] = [];
    const chair = ["#4f86c6", "#e07a5f", "#81b29a", "#f2cc8f"];
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        const x = x0 + i * dx;
        const z = z0 + j * dz;
        out.push({ p: [x, 0.36, z], s: [0.9, 0.72, 0.55], c: "#e8d2a6" }); // desk
        out.push({ p: [x, 0.74, z], s: [0.94, 0.04, 0.6], c: "#b9874f" }); // desk top
        out.push({ p: [x, 0.22, z + 0.55], s: [0.5, 0.44, 0.45], c: chair[(i + j) % 4] }); // seat
        out.push({ p: [x, 0.62, z + 0.78], s: [0.5, 0.45, 0.06], c: chair[(i + j) % 4] }); // back
      }
    return out;
  }, [cols, rows, x0, z0, dx, dz]);
  return <BoxInstances items={items} />;
}

function Lockers({ x1, x2 }: { x1: number; x2: number }) {
  const items = useMemo(() => {
    const out: Item[] = [{ p: [(x1 + x2) / 2, 0.55, D / 2 - 0.4], s: [x2 - x1, 1.1, 0.6], c: "#d8cdb8" }];
    const colors = ["#f6bd60", "#84a59d", "#f28482", "#90bede", "#c3b1e1"];
    let k = 0;
    for (let x = x1 + 0.35; x < x2 - 0.2; x += 0.7)
      for (const y of [0.3, 0.8]) out.push({ p: [x, y, D / 2 - 0.69], s: [0.6, 0.42, 0.04], c: colors[k++ % colors.length] });
    return out;
  }, [x1, x2]);
  return <BoxInstances items={items} />;
}

function TeacherDesk({ x = -1, z = -3.4 }: { x?: number; z?: number }) {
  return (
    <group position={[x, 0, z]}>
      <Box p={[0, 0.45, 0]} s={[1.8, 0.9, 0.8]} c="#9a6b3f" />
      <Box p={[0.5, 0.97, 0]} s={[0.5, 0.06, 0.35]} c="#3b3b3b" />
    </group>
  );
}

function Classroom({ room }: { room: Room }) {
  return (
    <>
      <Board />
      <Box p={[-5.6, 1.9, -D / 2 + 0.25]} s={[1.6, 0.95, 0.12]} c="#1d1d1f" />
      <Sign p={[6.15, 1.5, -D / 2 + 0.13]} size={[0.9, 1.4]} text="시간표" bg="#fff8e7" fg="#7a5c3e" />
      <Sign p={[-1, 2.3, -D / 2 + 0.14]} size={[2.6, 0.32]} text={`${room.label} · 서로 돕는 우리 반`} bg="#2f5d46" fg="#ffffff" />
      <TeacherDesk />
      <Desks cols={5} rows={4} x0={-4.4} z0={-1.6} dx={2.2} dz={1.55} />
      <Lockers x1={-6} x2={1} />
    </>
  );
}

function Science() {
  const items = useMemo(() => {
    const out: Item[] = [];
    const glass = ["#7fd1ff", "#9ef0a8", "#ffd27f", "#ff9ec7"];
    LAB_TABLES.forEach(([x, z], i) => {
      out.push({ p: [x, 0.42, z], s: [2.6, 0.84, 1.3], c: "#d7d9dc" });
      out.push({ p: [x, 0.87, z], s: [2.7, 0.06, 1.4], c: "#2b2d31" });
      out.push({ p: [x + 1.05, 0.92, z], s: [0.4, 0.04, 0.6], c: "#9aa3ad" }); // sink
      for (let k = 0; k < 3; k++) out.push({ p: [x - 0.8 + k * 0.35, 1.02, z - 0.2 + (k % 2) * 0.35], s: [0.14, 0.24, 0.14], c: glass[(i + k) % 4] });
      for (const [sx, sz] of [[-0.8, 1], [0.6, 1], [-0.8, -1], [0.6, -1]]) out.push({ p: [x + sx, 0.3, z + sz], s: [0.35, 0.6, 0.35], c: "#4f86c6" });
    });
    // glass cabinet on the back wall
    out.push({ p: [-3, 0.9, D / 2 - 0.4], s: [6, 1.8, 0.6], c: "#b8c4cc" });
    for (let x = -5.6; x <= -0.4; x += 0.65) out.push({ p: [x, 1.3, D / 2 - 0.72], s: [0.12, 0.28, 0.12], c: glass[Math.round(x * 3) & 3] });
    return out;
  }, []);
  return (
    <>
      <Board text="오늘의 실험: 식물의 광합성" />
      <Sign p={[4.4, 1.5, -D / 2 + 0.13]} size={[1.6, 1.8]} text="안전 수칙" bg="#fff1c1" fg="#c0392b" />
      <group position={[-1, 0, -3.6]}>
        <Box p={[0, 0.45, 0]} s={[2.4, 0.9, 0.9]} c="#d7d9dc" />
        <Box p={[0, 0.93, 0]} s={[2.5, 0.06, 1]} c="#2b2d31" />
        {/* microscope */}
        <Box p={[0.5, 1.05, 0]} s={[0.25, 0.1, 0.3]} c="#e8e8e8" />
        <Box p={[0.5, 1.3, -0.08]} s={[0.08, 0.45, 0.08]} c="#e8e8e8" />
        <Box p={[0.5, 1.5, 0.02]} s={[0.1, 0.18, 0.1]} c="#333" />
      </group>
      <BoxInstances items={items} />
      <Skeleton x={-6} z={-3.8} />
    </>
  );
}

function Skeleton({ x, z }: { x: number; z: number }) {
  const bone = "#f3efe6";
  return (
    <group position={[x, 0, z]}>
      <Box p={[0, 0.03, 0]} s={[0.6, 0.06, 0.6]} c="#555" />
      <Pole p={[0, 0]} h={1.9} r={0.025} c="#777" />
      <mesh position={[0, 1.75, 0]}>
        <sphereGeometry args={[0.16, 12, 10]} />
        <meshStandardMaterial color={bone} />
      </mesh>
      <Box p={[0, 1.3, 0]} s={[0.4, 0.5, 0.18]} c={bone} />
      <Box p={[0, 0.95, 0]} s={[0.32, 0.16, 0.16]} c={bone} />
      <Box p={[-0.1, 0.5, 0]} s={[0.07, 0.75, 0.07]} c={bone} />
      <Box p={[0.1, 0.5, 0]} s={[0.07, 0.75, 0.07]} c={bone} />
      <Box p={[-0.28, 1.15, 0]} s={[0.06, 0.6, 0.06]} c={bone} />
      <Box p={[0.28, 1.15, 0]} s={[0.06, 0.6, 0.06]} c={bone} />
    </group>
  );
}

function StaffBoard() {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 256;
    const g = c.getContext("2d")!;
    g.fillStyle = "#fbfbf7";
    g.fillRect(0, 0, 1024, 256);
    g.strokeStyle = "#3a3a3a";
    g.lineWidth = 3;
    for (const top of [40, 150])
      for (let i = 0; i < 5; i++) {
        g.beginPath();
        g.moveTo(30, top + i * 16);
        g.lineTo(994, top + i * 16);
        g.stroke();
      }
    g.fillStyle = "#222";
    const notes = [3, 2, 1, 2, 3, 3, 3, 2, 2, 2, 3, 4, 4];
    notes.forEach((n, i) => {
      g.beginPath();
      g.ellipse(120 + i * 66, 40 + 64 - n * 8, 9, 7, -0.4, 0, Math.PI * 2);
      g.fill();
      g.fillRect(127 + i * 66, 40 + 64 - n * 8 - 40, 3, 40);
    });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  return (
    <group position={[-0.5, 1.45, -D / 2 + 0.13]}>
      <Box p={[0, 0, -0.02]} s={[6.2, 1.5, 0.04]} c="#9aa3ad" shadow={false} />
      <mesh>
        <planeGeometry args={[6, 1.3]} />
        <meshStandardMaterial map={tex} />
      </mesh>
    </group>
  );
}

function Music() {
  const chairs = useMemo(() => {
    const out: Item[] = [];
    const colors = ["#e07a5f", "#3d405b", "#81b29a"];
    [3.6, 5.4, 7.2].forEach((r, row) => {
      const n = 5 + row * 2;
      for (let i = 0; i < n; i++) {
        const a = (-0.55 + (1.1 * i) / (n - 1)) * Math.PI * 0.55;
        const x = Math.sin(a) * r * 0.95;
        const z = -4.6 + Math.cos(a) * r;
        if (x > 2.6 && z > 3) continue; // keep the door corner clear
        out.push({ p: [x, 0.22, z], s: [0.45, 0.44, 0.45], c: colors[row] });
        out.push({ p: [x, 0.62, z + 0.22], s: [0.45, 0.45, 0.05], c: colors[row] });
      }
    });
    return out;
  }, []);
  const xylo = useMemo(() => {
    const out: Item[] = [{ p: [0, 0.6, 0], s: [1.6, 0.08, 0.6], c: "#6b4f3a" }];
    const c = ["#ff595e", "#ff924c", "#ffca3a", "#8ac926", "#52a675", "#1982c4", "#4267ac", "#6a4c93"];
    c.forEach((col, i) => out.push({ p: [-0.7 + i * 0.2, 0.68, 0], s: [0.16, 0.05, 0.55 - i * 0.03], c: col }));
    return out;
  }, []);
  return (
    <>
      <StaffBoard />
      {/* upright piano */}
      <group position={[-4.6, 0, -3.4]}>
        <Box p={[0, 0.65, -0.25]} s={[2.1, 1.3, 0.6]} c="#151515" />
        <Box p={[0, 0.78, 0.2]} s={[2, 0.1, 0.4]} c="#151515" />
        <Box p={[0, 0.85, 0.22]} s={[1.8, 0.04, 0.3]} c="#f5f5f0" />
        <Box p={[0, 0.3, 0.75]} s={[1, 0.5, 0.4]} c="#3a2a1f" />
      </group>
      <group position={[-1.4, 0, -3.5]}>
        <BoxInstances items={xylo} />
        <Box p={[-0.6, 0.3, 0]} s={[0.06, 0.6, 0.5]} c="#444" />
        <Box p={[0.6, 0.3, 0]} s={[0.06, 0.6, 0.5]} c="#444" />
      </group>
      {/* drums */}
      {[
        [2.9, -3.6, 0.55, 0.55, "#c0392b"],
        [4, -3.2, 0.35, 0.8, "#2c3e50"],
      ].map(([x, z, r, h, c], i) => (
        <group key={i} position={[x as number, 0, z as number]}>
          <mesh position={[0, (h as number) / 2, 0]} castShadow>
            <cylinderGeometry args={[r as number, r as number, h as number, 20]} />
            <meshStandardMaterial color={c as string} />
          </mesh>
          <mesh position={[0, (h as number) + 0.01, 0]} rotation-x={-Math.PI / 2}>
            <circleGeometry args={[(r as number) * 0.95, 20]} />
            <meshStandardMaterial color="#f3ede0" />
          </mesh>
        </group>
      ))}
      <Sign p={[4.6, 1.6, -D / 2 + 0.13]} size={[1.8, 1.3]} text="♪ 이달의 노래" bg="#ffe8f0" fg="#9b2c5a" />
      <BoxInstances items={chairs} />
    </>
  );
}

function Library() {
  const items = useMemo(() => {
    const out: Item[] = [];
    const spines = ["#c0392b", "#2980b9", "#27ae60", "#f39c12", "#8e44ad", "#16a085", "#d35400", "#2c3e50", "#e84393"];
    let k = 0;
    // back wall shelf
    out.push({ p: [0, 0.9, D / 2 - 0.4], s: [13.2, 1.8, 0.6], c: "#a47148" });
    for (let x = -6.4; x < 6.4; x += 0.22)
      for (const y of [0.35, 0.95, 1.5]) out.push({ p: [x, y, D / 2 - 0.72], s: [0.16, 0.42, 0.06], c: spines[k++ % spines.length] });
    // west wall shelf
    out.push({ p: [-6.6, 0.9, 0], s: [0.6, 1.8, 9], c: "#a47148" });
    for (let z = -4.3; z < 4.3; z += 0.22)
      for (const y of [0.35, 0.95, 1.5]) out.push({ p: [-6.28, y, z], s: [0.06, 0.42, 0.16], c: spines[k++ % spines.length] });
    // reading tables + chairs
    for (const x of [-1.6, 2]) {
      out.push({ p: [x, 0.36, 0.5], s: [2.4, 0.72, 1.2], c: "#e3c49a" });
      for (const [dx, dz] of [[-0.6, -0.9], [0.6, -0.9], [-0.6, 0.9], [0.6, 0.9]]) out.push({ p: [x + dx, 0.22, 0.5 + dz], s: [0.42, 0.44, 0.42], c: "#7fb069" });
      out.push({ p: [x - 0.3, 0.76, 0.5], s: [0.5, 0.06, 0.35], c: spines[(k += 3) % spines.length] });
    }
    // circulation desk
    out.push({ p: [1.5, 0.5, -2.8], s: [2.4, 1, 0.7], c: "#8d6346" });
    // cushions
    const cushion = ["#ffadad", "#ffd6a5", "#caffbf", "#9bf6ff"];
    cushion.forEach((c, i) => out.push({ p: [-4.8 + (i % 2) * 1.1, 0.2, 2.6 + Math.floor(i / 2) * 1.1], s: [0.9, 0.4, 0.9], c }));
    return out;
  }, []);
  return (
    <>
      <Sign p={[-2.2, 1.6, -D / 2 + 0.13]} size={[4.6, 0.9]} text="책 속에 길이 있어요" bg="#fff8e7" fg="#7a5c3e" />
      <Sign p={[1.5, 1.15, -3.16]} size={[2, 0.3]} text="대출 · 반납" bg="#8d6346" fg="#ffffff" />
      <Sign p={[-5.4, 1.6, -D / 2 + 0.13]} size={[1.4, 0.6]} text="쉿! 조용히" bg="#e8f4ff" fg="#2f5f9e" />
      <BoxInstances items={items} />
    </>
  );
}

function Computer() {
  const items = useMemo(() => {
    const out: Item[] = [];
    for (const z of [-0.8, 1.6, 4]) {
      out.push({ p: [-2, 0.37, z], s: [8, 0.74, 0.8], c: "#e6e6e6" });
      for (let i = 0; i < 5; i++) {
        const x = -5.3 + i * 1.65;
        out.push({ p: [x, 1.05, z - 0.15], s: [0.75, 0.48, 0.05], c: "#1f2328" });
        out.push({ p: [x, 1.05, z - 0.12], s: [0.66, 0.4, 0.02], c: "#4aa3df" });
        out.push({ p: [x, 0.8, z - 0.15], s: [0.12, 0.12, 0.08], c: "#1f2328" });
        out.push({ p: [x, 0.76, z + 0.15], s: [0.5, 0.03, 0.18], c: "#333" });
        out.push({ p: [x, 0.22, z + 0.7], s: [0.48, 0.44, 0.45], c: "#2d6a4f" });
      }
    }
    return out;
  }, []);
  return (
    <>
      {/* projector screen */}
      <Box p={[-1, 1.5, -D / 2 + 0.12]} s={[5.4, 1.6, 0.04]} c="#fafafa" shadow={false} />
      <Sign p={[-1, 1.5, -D / 2 + 0.15]} size={[4.4, 0.8]} text="안전한 인터넷 사용" bg="#fafafa" fg="#2f5f9e" />
      <TeacherDesk x={-4.5} />
      <BoxInstances items={items} />
    </>
  );
}

function RoomContents({ room }: { room: Room }) {
  const cx = (room.minX + room.maxX) / 2;
  const cz = (room.minZ + room.maxZ) / 2;
  const wood = room.kind === "computer" ? "#b7c0c7" : WOOD;
  let content: React.ReactNode = null;
  if (room.kind === "classroom") content = <Classroom room={room} />;
  else if (room.kind === "science") content = <Science />;
  else if (room.kind === "music") content = <Music />;
  else if (room.kind === "library") content = <Library />;
  else if (room.kind === "computer") content = <Computer />;
  const isHall = room.kind === "lobby" || room.kind === "stairhall";
  return (
    <group position={[cx, 0, cz]}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color={isHall ? "#d9d2c3" : wood} />
      </mesh>
      {content}
    </group>
  );
}

// ---------- lobby, stairs, corridor ----------
function Stairs({ up }: { up: boolean }) {
  const items = useMemo(() => {
    const out: Item[] = [];
    const n = 8;
    const len = STAIRS.maxZ - STAIRS.minZ;
    for (let i = 0; i < n; i++) {
      const z = STAIRS.minZ + (len * (i + 0.5)) / n;
      const h = up ? 0.15 * (i + 1) : 0.02;
      out.push({ p: [(STAIRS.minX + STAIRS.maxX) / 2, h / 2, z], s: [STAIRS.maxX - STAIRS.minX, h, len / n - 0.02], c: up ? (i % 2 ? "#cfc6b4" : "#bfb5a1") : i % 2 ? "#8d8574" : "#7a7262" });
    }
    for (const x of [STAIRS.minX, STAIRS.maxX]) out.push({ p: [x, 0.9, (STAIRS.minZ + STAIRS.maxZ) / 2 + 0.3], s: [0.08, 0.08, len - 0.6], c: "#8a6a45" });
    return out;
  }, [up]);
  return (
    <>
      <BoxInstances items={items} />
      {[STAIRS.minX, STAIRS.maxX].flatMap((x) => [STAIRS.minZ + 0.6, STAIRS.maxZ - 0.2].map((z) => <Pole key={`${x}${z}`} p={[x, z]} h={0.9} r={0.04} c="#8a6a45" />))}
      <Mat p={[(STAIRS.minX + STAIRS.maxX) / 2, STAIRS.minZ + 1]} size={[2.8, 1.6]} color={up ? "#4f86c6" : "#e09f3e"} />
      <Sign p={[(STAIRS.minX + STAIRS.maxX) / 2, 2.7, STAIRS.minZ - 0.2]} size={[2.4, 0.55]} text={up ? "▲ 2층으로" : "▼ 1층으로"} bg={up ? "#4f86c6" : "#e09f3e"} fg="#ffffff" />
    </>
  );
}

function Mat({ p, size, color }: { p: [number, number]; size: [number, number]; color: string }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[p[0], 0.03, p[1]]}>
      <planeGeometry args={size} />
      <meshStandardMaterial color={color} transparent opacity={0.85} />
    </mesh>
  );
}

function ShoeLockers() {
  // 신발장: cubbies along the lobby's west partition (floor-local x = -6.45).
  const items = useMemo(() => {
    const x = -6.45;
    const out: Item[] = [{ p: [x, 0.7, 7], s: [0.7, 1.4, 7.5], c: "#c8b28c" }];
    for (let z = 3.6; z < 10.6; z += 0.5)
      for (const y of [0.25, 0.6, 0.95, 1.3])
        out.push({ p: [x + 0.36, y, z], s: [0.02, 0.28, 0.42], c: (Math.round(z * 2) + Math.round(y * 4)) % 5 === 0 ? "#e07a5f" : "#5b4a36" });
    return out;
  }, []);
  return <BoxInstances items={items} />;
}

function NoticeBoards({ rooms }: { rooms: Room[] }) {
  // Cork boards on the corridor side of the north rooms, between doors.
  const items = useMemo(() => {
    const out: Item[] = [];
    const paper = ["#fff3b0", "#ffd6e0", "#cdeac0", "#c6e2ff", "#ffffff"];
    for (const r of rooms.filter((r) => r.row === "north")) {
      const x = r.minX + 4;
      out.push({ p: [x, 1.5, -1.88], s: [4, 1.1, 0.04], c: "#b5835a" });
      for (let i = 0; i < 5; i++) out.push({ p: [x - 1.5 + i * 0.75, 1.5 + (i % 2 ? 0.2 : -0.15), -1.85], s: [0.55, 0.45, 0.02], c: paper[i] });
    }
    return out;
  }, [rooms]);
  return <BoxInstances items={items} shadow={false} />;
}

function Extinguishers() {
  return (
    <>
      {[-7.4, 7.4].map((x) => (
        <mesh key={x} position={[x, 0.3, -1.7]} castShadow>
          <cylinderGeometry args={[0.12, 0.12, 0.6, 12]} />
          <meshStandardMaterial color="#d62828" />
        </mesh>
      ))}
    </>
  );
}

function FloorLevel({ zone, dark }: { zone: "floor1" | "floor2"; dark: boolean }) {
  const rooms = FLOOR_ROOMS[zone];
  const segs = useMemo(() => floorWalls(zone), [zone]);
  const level = zone === "floor1" ? "1층" : "2층";
  return (
    <group position={[ZONES[zone].cx, 0, ZONES[zone].cz]}>
      {/* corridor floor */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.005, 0]} receiveShadow>
        <planeGeometry args={[42, 24]} />
        <meshStandardMaterial color={dark ? "#8f9489" : "#d4d8ce"} />
      </mesh>
      {rooms.map((r) => (
        <RoomContents key={r.key} room={r} />
      ))}
      <Walls segs={segs} h={WALL_H} color={dark ? "#cbbfa6" : "#f4ead3"} trim="#8fb39a" />
      <NoticeBoards rooms={rooms} />
      <Extinguishers />
      {/* nameplates above doors, readable from the corridor */}
      {rooms
        .filter((r) => r.kind !== "lobby" && r.kind !== "stairhall")
        .map((r) => {
          const d = doorOf(r);
          const z = r.row === "north" ? -1.82 : 1.82;
          return <Sign key={r.key} p={[(d.minX + d.maxX) / 2, WALL_H + 0.35, z]} size={[2.2, 0.5]} text={r.label} bg="#ffffff" fg="#1f3f6e" />;
        })}
      <Sign p={[-14, WALL_H + 0.35, -1.82]} size={[2.6, 0.5]} text={`${SCHOOL_NAME} ${level}`} bg="#2f5f9e" fg="#ffffff" />
      <Stairs up={zone === "floor1"} />
      {zone === "floor1" ? (
        <>
          <ShoeLockers />
          <Mat p={[0, 11.5]} size={[3, 1]} color="#3bb273" />
          <Sign p={[0, WALL_H + 0.35, 11.75]} size={[2.4, 0.5]} text="▼ 나가기 (운동장)" bg="#3bb273" fg="#ffffff" />
          <Sign p={[-4, 1.75, 11.8]} size={[3.4, 0.55]} text="어서 오세요! 한빛 어린이" bg="#fff3b0" fg="#7a4b00" />
        </>
      ) : (
        <>
          <Sign p={[-3, 1.75, 11.8]} size={[4, 0.9]} text="우리 학교 자랑 게시판" bg="#cdeac0" fg="#24513a" />
          {[3, 10.8].map((z) => (
            <group key={z} position={[-5.5, 0, z]}>
              <mesh position={[0, 0.3, 0]}>
                <cylinderGeometry args={[0.3, 0.25, 0.6, 12]} />
                <meshStandardMaterial color="#b56b45" />
              </mesh>
              <mesh position={[0, 0.95, 0]}>
                <icosahedronGeometry args={[0.5, 1]} />
                <meshStandardMaterial color="#3f9b5a" flatShading />
              </mesh>
            </group>
          ))}
        </>
      )}
    </group>
  );
}

function Hall({ dark }: { dark: boolean }) {
  const segs = useMemo(() => hallWalls(), []);
  const lines = useMemo<Item[]>(
    () => [
      { p: [0, 0.02, -5.5], s: [22, 0.01, 0.1], c: "#ffffff" },
      { p: [0, 0.02, 8.5], s: [22, 0.01, 0.1], c: "#ffffff" },
      { p: [-11, 0.02, 1.5], s: [0.1, 0.01, 14], c: "#ffffff" },
      { p: [11, 0.02, 1.5], s: [0.1, 0.01, 14], c: "#ffffff" },
      { p: [0, 0.02, 1.5], s: [0.1, 0.01, 14], c: "#ffffff" },
    ],
    [],
  );
  const curtain = useTextTexture(" ", "#9b1c31", "#9b1c31", 64, 64);
  return (
    <group position={[ZONES.hall.cx, 0, ZONES.hall.cz]}>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[30, 20]} />
        <meshStandardMaterial color={dark ? "#8a6a48" : "#d6a96f"} />
      </mesh>
      <BoxInstances items={lines} shadow={false} />
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.021, 1.5]}>
        <ringGeometry args={[1.8, 1.9, 40]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      {/* stage */}
      <Box p={[0, 0.5, -8.25]} s={[16, 1, 3.5]} c="#7a4e2d" />
      <Box p={[0, 0.25, -6.2]} s={[4, 0.5, 0.6]} c="#6a4326" />
      <mesh position={[0, 2.2, -9.85]}>
        <planeGeometry args={[16, 2.6]} />
        <meshStandardMaterial map={curtain} />
      </mesh>
      <Sign p={[0, 2.9, -9.8]} size={[6, 0.6]} text={`${SCHOOL_NAME} 강당`} bg="#9b1c31" fg="#ffe9a8" />
      <Box p={[-3, 1.35, -7.5]} s={[0.8, 0.7, 0.5]} c="#5a3a22" />
      {/* basketball hoops */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 14.6, 0, 1.5]}>
          <Box p={[0, 2.5, 0]} s={[0.1, 1, 1.6]} c="#ffffff" />
          <mesh position={[-s * 0.35, 2.15, 0]} rotation-x={Math.PI / 2}>
            <torusGeometry args={[0.25, 0.03, 8, 20]} />
            <meshStandardMaterial color="#e85d04" />
          </mesh>
        </group>
      ))}
      <Walls segs={segs} h={HALL_WALL_H} color={dark ? "#bfb7a5" : "#efe8d8"} trim="#6b8fb5" />
      <Mat p={[14.4, 6]} size={[1.2, 2]} color="#3bb273" />
      <Sign p={[13.4, HALL_WALL_H + 0.4, 6]} size={[2.6, 0.5]} text="▶ 나가기 (운동장)" bg="#3bb273" fg="#ffffff" />
    </group>
  );
}

export default function Interior({ zone, dark }: { zone: Exclude<ZoneId, "outdoor">; dark: boolean }) {
  if (zone === "hall") return <Hall dark={dark} />;
  return <FloorLevel zone={zone} dark={dark} />;
}
