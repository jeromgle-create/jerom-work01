// Campus of the fictional 한빛초등학교, laid out after the schematic floor plan (north up):
// north wing (북관) and south wing (남관) with a courtyard between them, the main building (본관)
// to the east with the kindergarten wing and gym, the field to the south-west with stands, the
// main gate on the south wall and the back gate in the north-west corner.
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Box, BoxInstances, Pole, Sign, box, circle, pushOut, type Collider, type V3 } from "./parts";
import { CAMPUS_DOORS, OUTDOOR, SCHOOL_NAME } from "./zones";

type Item = { p: V3; s: V3; c: string };
type Rect = { minX: number; maxX: number; minZ: number; maxZ: number };
const rect = (minX: number, maxX: number, minZ: number, maxZ: number): Rect => ({ minX, maxX, minZ, maxZ });

// ---------- placement ----------
const NORTH_WING = { ...rect(-36, 2, -26, -19), h: 12, label: "북관" };
const SOUTH_WING = { ...rect(-30, 2, -9, -2), h: 12, label: "남관" };
const CONNECTOR = { ...rect(2, 8, -26, -2), h: 12, label: "중앙현관" };
const MAIN = { ...rect(8, 36, -26, 8), h: 15, label: SCHOOL_NAME };
const KINDER = { ...rect(8, 20, 8, 24.5), h: 6, label: "유치원 · 현관" };
const GYM = { ...rect(21, 36, 9, 24), h: 6 };
const FIELD = rect(-36, 2, 7, 30);
const FIELD_C = { x: -17, z: 18.5 };
const STANDS_N = [rect(-34, -22, 3, 6.5), rect(-12, -2, 3, 6.5)];
const PODIUM = rect(-18, -14, 3, 6.5);
const FLAG = { x: -20, z: 4.8 };
const STANDS_E = rect(3, 6, 9, 28);
const GATE = { minX: -8, maxX: -2 };
const BACK_GATE = { minX: -40, maxX: -36 };

const COLLIDERS: Collider[] = [
  // buildings; the wing behind which nobody should hide extends to the north wall
  { kind: "box", minX: NORTH_WING.minX, maxX: NORTH_WING.maxX, minZ: OUTDOOR.minZ - 2, maxZ: NORTH_WING.maxZ },
  { kind: "box", ...rect(SOUTH_WING.minX, SOUTH_WING.maxX, SOUTH_WING.minZ, SOUTH_WING.maxZ) },
  { kind: "box", minX: CONNECTOR.minX, maxX: CONNECTOR.maxX, minZ: OUTDOOR.minZ - 2, maxZ: CONNECTOR.maxZ },
  { kind: "box", minX: MAIN.minX, maxX: MAIN.maxX, minZ: OUTDOOR.minZ - 2, maxZ: MAIN.maxZ },
  { kind: "box", ...rect(KINDER.minX, KINDER.maxX, KINDER.minZ, KINDER.maxZ) },
  { kind: "box", ...rect(GYM.minX, GYM.maxX, GYM.minZ - 1, GYM.maxZ) },
  ...STANDS_N.map((r): Collider => ({ kind: "box", ...r })),
  { kind: "box", ...PODIUM },
  { kind: "box", ...STANDS_E },
  circle(FLAG.x, FLAG.z, 0.4),
  // goals
  box(FIELD.minX + 1.8, FIELD_C.z, 1.2, 5.4),
  box(FIELD.maxX - 1.8, FIELD_C.z, 1.2, 5.4),
  // courtyard: hand-washing trough, garden beds
  box(-20.5, -14, 0.9, 3),
  { kind: "box", ...rect(-12, 0, -17.5, -14.2) },
  // west column and service buildings
  box(-38.3, 9, 0.8, 0.8),
  box(-38.3, 24, 1.4, 2.4),
  box(-38.5, -31, 2, 2),
  box(38, -30, 2.6, 3),
  box(1.5, 32.3, 3, 2.4), // security office by the main gate
];

export function resolveCollisions(pos: THREE.Vector3) {
  pushOut(pos, COLLIDERS);
  pos.x = THREE.MathUtils.clamp(pos.x, OUTDOOR.minX, OUTDOOR.maxX);
  pos.z = THREE.MathUtils.clamp(pos.z, OUTDOOR.minZ, OUTDOOR.maxZ);
}

// ---------- pieces ----------
function Building({ b, wall, floors, skipX = [], dark }: { b: Rect & { h: number; label: string }; wall: string; floors: number; skipX?: number[]; dark: boolean }) {
  const w = b.maxX - b.minX;
  const d = b.maxZ - b.minZ;
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const items = useMemo(() => {
    const out: Item[] = [];
    const fh = b.h / floors;
    const glass = dark ? "#e8d48a" : "#7f9fbe";
    for (let f = 0; f < floors; f++) {
      out.push({ p: [cx, (f + 1) * fh - 0.1, b.maxZ + 0.1], s: [w + 0.2, 0.2, 0.2], c: "#ffffff" });
      for (let x = b.minX + 1.3; x < b.maxX - 1; x += 2.4) {
        if (f === 0 && skipX.some((s) => Math.abs(s - x) < 2.4)) continue;
        out.push({ p: [x, f * fh + fh * 0.55, b.maxZ + 0.03], s: [1.7, fh * 0.45, 0.06], c: "#ffffff" });
        out.push({ p: [x, f * fh + fh * 0.55, b.maxZ + 0.07], s: [1.5, fh * 0.38, 0.04], c: glass });
      }
    }
    out.push({ p: [cx, 0.35, b.maxZ + 0.02], s: [w + 0.1, 0.7, 0.1], c: "#a8553f" });
    out.push({ p: [cx, b.h + 0.15, cz], s: [w + 0.3, 0.3, d + 0.3], c: "#d9cdb0" });
    return out;
  }, [b, floors, skipX, dark, w, d, cx, cz]);
  return (
    <group>
      <Box p={[cx, b.h / 2, cz]} s={[w, b.h, d]} c={wall} />
      <BoxInstances items={items} shadow={false} />
      <Sign p={[cx, b.h - 0.9, b.maxZ + 0.12]} size={[Math.min(6, 1.2 + b.label.length * 0.55), 0.9]} text={b.label} bg="#2f5f9e" fg="#ffffff" />
    </group>
  );
}

function Clock({ p }: { p: V3 }) {
  const hour = useRef<THREE.Group>(null);
  const minute = useRef<THREE.Group>(null);
  useFrame(() => {
    const now = new Date();
    const m = now.getMinutes() + now.getSeconds() / 60;
    const h = (now.getHours() % 12) + m / 60;
    if (minute.current) minute.current.rotation.z = -(m / 60) * Math.PI * 2;
    if (hour.current) hour.current.rotation.z = -(h / 12) * Math.PI * 2;
  });
  return (
    <group position={p}>
      <mesh position={[0, 0, -0.01]}>
        <circleGeometry args={[0.95, 32]} />
        <meshStandardMaterial color="#2f5f9e" />
      </mesh>
      <mesh>
        <circleGeometry args={[0.85, 32]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <group ref={hour} position={[0, 0, 0.02]}>
        <mesh position={[0, 0.22, 0]}>
          <planeGeometry args={[0.09, 0.45]} />
          <meshBasicMaterial color="#222" />
        </mesh>
      </group>
      <group ref={minute} position={[0, 0, 0.03]}>
        <mesh position={[0, 0.32, 0]}>
          <planeGeometry args={[0.06, 0.65]} />
          <meshBasicMaterial color="#222" />
        </mesh>
      </group>
    </group>
  );
}

function GymHall({ dark }: { dark: boolean }) {
  const w = GYM.maxX - GYM.minX;
  const d = GYM.maxZ - GYM.minZ;
  const cx = (GYM.minX + GYM.maxX) / 2;
  const cz = (GYM.minZ + GYM.maxZ) / 2;
  return (
    <group>
      <Box p={[cx, GYM.h / 2, cz]} s={[w, GYM.h, d]} c={dark ? "#a9a38f" : "#ebe4d2"} />
      {/* low barrel roof: half cylinder along x, squashed vertically */}
      <group position={[cx, GYM.h, cz]} scale={[1, 0.3, 1]}>
        <mesh rotation-z={Math.PI / 2} castShadow>
          <cylinderGeometry args={[d / 2, d / 2, w, 28, 1, false, 0, Math.PI]} />
          <meshStandardMaterial color="#4f86c6" side={THREE.DoubleSide} />
        </mesh>
      </group>
      <Sign p={[cx, GYM.h - 1, GYM.maxZ + 0.08]} size={[4, 0.9]} text="체육관" bg="#ffffff" fg="#2f5f9e" />
    </group>
  );
}

function Field({ dark }: { dark: boolean }) {
  const w = FIELD.maxX - FIELD.minX;
  const d = FIELD.maxZ - FIELD.minZ;
  const line = "#f7f4ee";
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[(FIELD.minX + FIELD.maxX) / 2, 0.01, (FIELD.minZ + FIELD.maxZ) / 2]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={dark ? "#7d6a52" : "#d8b98c"} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[FIELD_C.x, 0.02, FIELD_C.z]} scale={[1.6, 1, 1]}>
        <ringGeometry args={[9.5, 9.7, 64]} />
        <meshBasicMaterial color={line} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[FIELD_C.x, 0.02, FIELD_C.z]}>
        <ringGeometry args={[2.3, 2.45, 48]} />
        <meshBasicMaterial color={line} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[FIELD_C.x, 0.02, FIELD_C.z]}>
        <planeGeometry args={[0.15, 19]} />
        <meshBasicMaterial color={line} />
      </mesh>
      {[FIELD.minX + 1.8, FIELD.maxX - 1.8].map((x, i) => (
        <group key={i}>
          <Pole p={[x + (i ? -0.5 : 0.5), FIELD_C.z - 2.5]} h={2} r={0.07} c="#ffffff" />
          <Pole p={[x + (i ? -0.5 : 0.5), FIELD_C.z + 2.5]} h={2} r={0.07} c="#ffffff" />
          <Box p={[x + (i ? -0.5 : 0.5), 2, FIELD_C.z]} s={[0.14, 0.14, 5.1]} c="#ffffff" />
          <mesh position={[x, 1, FIELD_C.z]}>
            <boxGeometry args={[1.2, 2, 5]} />
            <meshStandardMaterial color="#ffffff" transparent opacity={0.25} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Stands() {
  const items = useMemo(() => {
    const out: Item[] = [];
    const tiers = ["#c7c1b5", "#b8b2a6", "#a9a397"];
    for (const r of STANDS_N) {
      const w = r.maxX - r.minX;
      const step = (r.maxZ - r.minZ) / 3;
      for (let t = 0; t < 3; t++) out.push({ p: [(r.minX + r.maxX) / 2, 0.25 + t * 0.25, r.maxZ - step * (t + 0.5)], s: [w, 0.5 + t * 0.5, step], c: tiers[t] });
    }
    const r = STANDS_E;
    const step = (r.maxX - r.minX) / 3;
    for (let t = 0; t < 3; t++) out.push({ p: [r.minX + step * (t + 0.5), 0.25 + t * 0.25, (r.minZ + r.maxZ) / 2], s: [step, 0.5 + t * 0.5, r.maxZ - r.minZ], c: tiers[t] });
    // podium (구령대)
    out.push({ p: [(PODIUM.minX + PODIUM.maxX) / 2, 0.6, (PODIUM.minZ + PODIUM.maxZ) / 2], s: [PODIUM.maxX - PODIUM.minX, 1.2, PODIUM.maxZ - PODIUM.minZ], c: "#bdb5a6" });
    out.push({ p: [(PODIUM.minX + PODIUM.maxX) / 2, 1.65, PODIUM.minZ + 0.1], s: [PODIUM.maxX - PODIUM.minX, 0.9, 0.12], c: "#4f7cc0" });
    return out;
  }, []);
  return (
    <>
      <BoxInstances items={items} />
      <Sign p={[(PODIUM.minX + PODIUM.maxX) / 2, 1.9, PODIUM.maxZ + 0.05]} size={[2.6, 0.5]} text="구령대" bg="#4f7cc0" fg="#ffffff" />
      <Box p={[FLAG.x, 0.15, FLAG.z]} s={[1, 0.3, 1]} c="#b8b2a6" />
      <Pole p={[FLAG.x, FLAG.z]} h={8} r={0.07} />
      <Sign p={[FLAG.x + 0.9, 7.2, FLAG.z]} size={[1.8, 1.2]} text="한빛" bg="#2e8b57" fg="#ffffff" />
    </>
  );
}

function Courtyard({ dark }: { dark: boolean }) {
  const items = useMemo(() => {
    const out: Item[] = [];
    // paved courtyard + walkway
    out.push({ p: [-17, 0.004, -14], s: [38, 0.008, 10], c: dark ? "#5b5850" : "#d7cfbf" });
    // 전래 놀이터 (west): hopscotch + circle/triangle/square game drawn on the ground
    for (let i = 0; i < 8; i++) out.push({ p: [-31 + (i % 2 ? 0.55 : 0) + (i === 3 || i === 6 ? -0.55 : 0), 0.012, -15.5 + i * 0.75], s: [0.7, 0.01, 0.7], c: ["#ff8fab", "#ffd166", "#06d6a0", "#118ab2"][i % 4] });
    for (const [x, z, c] of [[-26, -15, "#ef476f"], [-24, -12.5, "#ffd166"], [-28, -12, "#06d6a0"]] as const) out.push({ p: [x, 0.012, z], s: [1.6, 0.01, 1.6], c });
    for (let i = 0; i < 3; i++) out.push({ p: [-23 + i * 0.7, 0.25, -16.5], s: [0.35, 0.5, 0.35], c: "#7f5539" }); // 투호 pots
    // hand-washing trough
    out.push({ p: [-20.5, 0.45, -14], s: [0.9, 0.9, 3], c: "#adb5bd" });
    for (let i = 0; i < 4; i++) out.push({ p: [-20.5, 1.05, -15.1 + i * 0.73], s: [0.08, 0.3, 0.08], c: "#dee2e6" });
    // 텃밭: soil beds with crops
    for (let r = 0; r < 3; r++) {
      out.push({ p: [-6, 0.15, -16.9 + r * 1.1], s: [11.6, 0.3, 0.8], c: "#6f4e37" });
      for (let x = -11.4; x < -0.6; x += 0.7) out.push({ p: [x, 0.42, -16.9 + r * 1.1], s: [0.35, 0.3 + ((x * 7) % 3) * 0.08, 0.35], c: ["#52b788", "#74c69d", "#e76f51"][r] });
    }
    // 전래 놀이터 (east): 사방치기 grid
    for (let i = 0; i < 6; i++) out.push({ p: [-9 + i * 1.3, 0.012, -11.5], s: [1.2, 0.01, 1.2], c: i % 2 ? "#ffd6a5" : "#bde0fe" });
    // flowerbeds along the wings (leaving the doors free)
    for (const [x0, x1] of [[-35, -19], [-13, 1]] as const) out.push({ p: [(x0 + x1) / 2, 0.2, -18.7], s: [x1 - x0, 0.4, 0.5], c: "#5b3f2a" });
    out.push({ p: [-14, 0.2, -9.3], s: [31, 0.4, 0.5], c: "#5b3f2a" });
    const flowers = ["#ff6b8b", "#ffd23f", "#ff9f43", "#c56cf0", "#ffffff"];
    for (let x = -35; x < 1; x += 0.6) {
      if (x > -19 && x < -13) continue;
      out.push({ p: [x, 0.5, -18.7], s: [0.25, 0.25, 0.25], c: flowers[Math.abs(Math.round(x * 3)) % 5] });
    }
    for (let x = -29.5; x < 1.5; x += 0.6) out.push({ p: [x, 0.5, -9.3], s: [0.25, 0.25, 0.25], c: flowers[Math.abs(Math.round(x * 3)) % 5] });
    return out;
  }, [dark]);
  return (
    <>
      <BoxInstances items={items} />
      <Sign p={[-27, 1.6, -10.4]} size={[3, 0.5]} text="전래 놀이터" bg="#fff3b0" fg="#7a4b00" />
      <Sign p={[-6, 1.4, -10.4]} size={[3.4, 0.5]} text="텃밭 · 전래 놀이터" bg="#d8f3dc" fg="#1b4332" />
      <Sign p={[-20.5, 1.7, -12.3]} size={[2, 0.4]} text="손 씻기" bg="#e0fbfc" fg="#1d3557" />
    </>
  );
}

function Grounds({ dark }: { dark: boolean }) {
  const items = useMemo(() => {
    const out: Item[] = [];
    const E = OUTDOOR;
    const wall = dark ? "#9d9585" : "#d8cfc0";
    const seg = (x0: number, x1: number, z0: number, z1: number) => {
      out.push({ p: [(x0 + x1) / 2, 0.8, (z0 + z1) / 2], s: [Math.max(0.4, x1 - x0), 1.6, Math.max(0.4, z1 - z0)], c: wall });
      out.push({ p: [(x0 + x1) / 2, 1.68, (z0 + z1) / 2], s: [Math.max(0.5, x1 - x0 + 0.1), 0.16, Math.max(0.5, z1 - z0 + 0.1)], c: "#a8553f" });
    };
    seg(BACK_GATE.maxX, E.maxX + 0.6, E.minZ - 0.6, E.minZ - 0.6); // north wall (back gate in the NW corner)
    seg(E.minX - 0.6, E.minX - 0.6, E.minZ - 0.6, E.maxZ + 0.6);
    seg(E.maxX + 0.6, E.maxX + 0.6, E.minZ - 0.6, E.maxZ + 0.6);
    seg(E.minX - 0.6, GATE.minX, E.maxZ + 0.6, E.maxZ + 0.6);
    seg(GATE.maxX, E.maxX + 0.6, E.maxZ + 0.6, E.maxZ + 0.6);
    // gate pillars
    for (const x of [GATE.minX - 0.4, GATE.maxX + 0.4]) out.push({ p: [x, 1.4, E.maxZ + 0.6], s: [1, 2.8, 1], c: "#8d8478" });
    for (const x of [BACK_GATE.minX + 0.3, BACK_GATE.maxX - 0.2]) out.push({ p: [x, 1.2, E.minZ - 0.6], s: [0.6, 2.4, 0.6], c: "#8d8478" });
    // security offices, recycling shed
    out.push({ p: [1.5, 1.1, 32.3], s: [3, 2.2, 2.4], c: "#e9e2d0" }, { p: [1.5, 2.3, 32.3], s: [3.4, 0.25, 2.8], c: "#4f86c6" });
    out.push({ p: [-38.5, 1.1, -31], s: [2, 2.2, 2], c: "#e9e2d0" }, { p: [-38.5, 2.3, -31], s: [2.4, 0.25, 2.4], c: "#4f86c6" });
    out.push({ p: [38, 1, -30], s: [2.6, 2, 3], c: "#8d99ae" });
    ["#2a9d8f", "#e9c46a", "#e76f51", "#457b9d"].forEach((c, i) => out.push({ p: [38 - 0.9 + i * 0.6, 0.45, -28.2], s: [0.5, 0.9, 0.5], c }));
    // west column: drinking fountain, sand playground, exercise bars
    out.push({ p: [-38.3, 0.5, 9], s: [0.8, 1, 0.8], c: "#adb5bd" });
    out.push({ p: [-38.3, 0.02, 16], s: [3, 0.02, 6], c: dark ? "#8f8160" : "#ecdcae" });
    for (const z of [23, 24, 25]) out.push({ p: [-38.3, 0.9 + (z - 23) * 0.3, z], s: [1.4, 0.06, 0.06], c: "#6c7a89" });
    for (const z of [22.9, 25.1]) for (const x of [-39, -37.6]) out.push({ p: [x, 0.75, z], s: [0.08, 1.5, 0.08], c: "#6c7a89" });
    // flowerbeds along the south wall
    out.push({ p: [-23, 0.2, 31.5], s: [26, 0.4, 0.8], c: "#5b3f2a" }, { p: [21, 0.2, 31.5], s: [30, 0.4, 0.8], c: "#5b3f2a" });
    // entry mats
    for (const d of CAMPUS_DOORS) out.push({ p: [(d.mat.minX + d.mat.maxX) / 2, 0.04, (d.mat.minZ + d.mat.maxZ) / 2], s: [d.mat.maxX - d.mat.minX, 0.02, d.mat.maxZ - d.mat.minZ + 0.4], c: "#3bb273" });
    return out;
  }, [dark]);
  return (
    <>
      <BoxInstances items={items} />
      <Sign p={[(GATE.minX + GATE.maxX) / 2, 3.1, OUTDOOR.maxZ + 0.62]} size={[6, 0.6]} text={`${SCHOOL_NAME} 정문`} bg="#2f5f9e" fg="#ffffff" />
      <Sign p={[1.5, 1.6, 33.55]} size={[2.2, 0.45]} text="보안관실" bg="#ffffff" fg="#2f5f9e" />
      <Sign p={[-38.5, 2.9, -29.95]} size={[2.4, 0.45]} text="후문 · 보안관실" bg="#ffffff" fg="#2f5f9e" />
      <Sign p={[38, 2.5, -28.45]} size={[2.6, 0.45]} text="분리수거장" bg="#ffffff" fg="#2a9d8f" />
      <Sign p={[-38.3, 1.3, 19.2]} size={[2.6, 0.45]} text="모래 놀이터" bg="#fff3b0" fg="#7a4b00" />
      <Sign p={[-38.3, 1.4, 9.45]} size={[1.4, 0.4]} text="음수대" bg="#e0fbfc" fg="#1d3557" />
      <Sign p={[-38.3, 2.1, 25.5]} size={[2, 0.4]} text="운동 기구" bg="#ffffff" fg="#2f5f9e" />
      {CAMPUS_DOORS.map((d) => (
        <Sign key={d.floor} p={[(d.mat.minX + d.mat.maxX) / 2, 3.2, d.mat.minZ - 0.35]} size={[3, 0.5]} text={`▲ ${d.label} · 들어가기`} bg="#3bb273" fg="#ffffff" />
      ))}
    </>
  );
}

function Trees() {
  const spots: [number, number, string][] = [
    ...[-34, -28, -22, -16, -10].map((x): [number, number, string] => [x, 32.6, "#e9c22c"]),
    ...[6, 14, 22, 30, 37].map((x): [number, number, string] => [x, 32.6, "#e9c22c"]),
    [38, 0, "#f2b5c9"],
    [38, 8, "#f2b5c9"],
    [38, 16, "#f2b5c9"],
    [-38.5, 2, "#3f9b5a"],
    [-38.5, -6, "#3f9b5a"],
    [-38.5, -14, "#3f9b5a"],
  ];
  return (
    <>
      {spots.map(([x, z, c], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 1.1, 0]} castShadow>
            <cylinderGeometry args={[0.16, 0.22, 2.2, 8]} />
            <meshStandardMaterial color="#6e4b2f" />
          </mesh>
          <mesh position={[0, 2.9, 0]} castShadow>
            <icosahedronGeometry args={[1.2, 1]} />
            <meshStandardMaterial color={c} flatShading />
          </mesh>
        </group>
      ))}
    </>
  );
}
// Trees are decorative; give them colliders too.
COLLIDERS.push(
  ...[-34, -28, -22, -16, -10, 6, 14, 22, 30, 37].map((x) => circle(x, 32.6, 0.5)),
  ...[0, 8, 16].map((z) => circle(38, z, 0.5)),
  ...[2, -6, -14].map((z) => circle(-38.5, z, 0.5)),
);

export default function School({ dark }: { dark: boolean }) {
  const doorX = (floor: string) => {
    const d = CAMPUS_DOORS.find((c) => c.floor === floor)!;
    return [(d.mat.minX + d.mat.maxX) / 2];
  };
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[OUTDOOR.maxX - OUTDOOR.minX + 8, OUTDOOR.maxZ - OUTDOOR.minZ + 8]} />
        <meshStandardMaterial color={dark ? "#33452f" : "#9cc77e"} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[14, 0.005, 29.5]} receiveShadow>
        <planeGeometry args={[52, 9]} />
        <meshStandardMaterial color={dark ? "#595650" : "#cdc6b8"} />
      </mesh>
      <Building b={NORTH_WING} wall={dark ? "#b9ae98" : "#f1e6cc"} floors={4} skipX={doorX("N1")} dark={dark} />
      <Building b={SOUTH_WING} wall={dark ? "#b9ae98" : "#f1e6cc"} floors={4} skipX={doorX("S1")} dark={dark} />
      <Building b={CONNECTOR} wall={dark ? "#8fa3b8" : "#cfe0f0"} floors={4} dark={dark} />
      <Building b={MAIN} wall={dark ? "#b3a991" : "#eee2c6"} floors={5} dark={dark} />
      <Building b={KINDER} wall={dark ? "#c2a6a6" : "#f7dcdc"} floors={2} skipX={doorX("E1")} dark={dark} />
      <Clock p={[22, 11.6, MAIN.maxZ + 0.15]} />
      <GymHall dark={dark} />
      <Field dark={dark} />
      <Stands />
      <Courtyard dark={dark} />
      <Grounds dark={dark} />
      <Trees />
    </>
  );
}
