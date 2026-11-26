// A generic Korean elementary school campus (fictional "한빛초등학교"), built from primitives.
// Layout: camera looks north (-z). Main building on the north edge, dirt field in the middle,
// playground east, gym and chin-up bars west, main gate on the south wall.
import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { WORLD_HALF } from "./types";

export const SCHOOL_NAME = "한빛초등학교";
const PLAYER_R = 0.45;

// ---------- collisions ----------
type Collider =
  | { kind: "circle"; x: number; z: number; r: number }
  | { kind: "box"; minX: number; maxX: number; minZ: number; maxZ: number };
const box = (cx: number, cz: number, w: number, d: number): Collider => ({
  kind: "box",
  minX: cx - w / 2,
  maxX: cx + w / 2,
  minZ: cz - d / 2,
  maxZ: cz + d / 2,
});
const circle = (x: number, z: number, r: number): Collider => ({ kind: "circle", x, z, r });

// Scenery placement shared by rendering and collisions.
const BUILDING = { x: 0, z: -19.5, w: 30, d: 6, floors: 4, floorH: 3 };
const PODIUM = { x: 0, z: -12, w: 6, d: 2.6, h: 1.1 };
const GYM = { x: -21.5, z: 3, w: 5.8, d: 14, h: 5 };
const FIELD = { x: 0, z: 3.5, w: 34, d: 27 };
const SAND = { x: 20.8, z: -5, w: 5.6, d: 14 };
const GINKGO = [-22, -18, -14, -10, -6, 6, 10, 14, 18, 22].map((x) => [x, 22.4] as const);
const CHERRY = [
  [-19, -21],
  [19, -21],
  [-17, -14.5],
  [17, -14.5],
  [22.5, 6],
  [22.5, 11],
  [22.5, 16],
] as const;
const BENCHES = [-12, -6, 6, 12].map((x) => [x, 19] as const);
const FLOWERBEDS = [
  [-9, -15.2],
  [9, -15.2],
] as const;
const FLAG = { x: -7, z: -13.6 };
const STATUE = { x: 7, z: -13.4 };

const COLLIDERS: Collider[] = [
  // Main building and gym colliders run past the boundary wall, so there is no
  // hidden alley behind them that the clamp to the world edge would let players slip into.
  { kind: "box", minX: BUILDING.x - BUILDING.w / 2, maxX: BUILDING.x + BUILDING.w / 2, minZ: -WORLD_HALF - 2, maxZ: BUILDING.z + BUILDING.d / 2 },
  box(PODIUM.x, PODIUM.z, PODIUM.w, PODIUM.d),
  { kind: "box", minX: -WORLD_HALF - 2, maxX: GYM.x + GYM.w / 2, minZ: GYM.z - GYM.d / 2, maxZ: GYM.z + GYM.d / 2 },
  box(15.9, FIELD.z, 1.2, 5.4), // east goal
  box(-15.9, FIELD.z, 1.2, 5.4), // west goal
  box(20.4, -9.5, 1.6, 4.4), // slide
  box(21, -4.5, 3, 3), // jungle gym
  box(20.6, 0.6, 3.6, 1.6), // swings
  ...[-10, -8.5, -7].map((z) => circle(-19.5, z, 0.25)), // chin-up bar posts (approx.)
  ...GINKGO.map(([x, z]) => circle(x, z, 0.55)),
  ...CHERRY.map(([x, z]) => circle(x, z, 0.55)),
  ...BENCHES.map(([x, z]) => box(x, z, 2.2, 0.8)),
  ...FLOWERBEDS.map(([x, z]) => box(x, z, 6, 1.2)),
  circle(FLAG.x, FLAG.z, 0.5),
  circle(STATUE.x, STATUE.z, 0.8),
  box(-4.2, 24, 1.4, 1.4), // gate pillars
  box(4.2, 24, 1.4, 1.4),
];

export function resolveCollisions(pos: THREE.Vector3) {
  for (const c of COLLIDERS) {
    if (c.kind === "circle") {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + PLAYER_R;
      if (d < min && d > 1e-4) {
        pos.x = c.x + (dx / d) * min;
        pos.z = c.z + (dz / d) * min;
      }
      continue;
    }
    const cx = THREE.MathUtils.clamp(pos.x, c.minX, c.maxX);
    const cz = THREE.MathUtils.clamp(pos.z, c.minZ, c.maxZ);
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d = Math.hypot(dx, dz);
    if (d > 1e-4) {
      if (d < PLAYER_R) {
        pos.x = cx + (dx / d) * PLAYER_R;
        pos.z = cz + (dz / d) * PLAYER_R;
      }
    } else {
      // Center ended up inside the box: push out through the nearest side.
      const pushes = [
        [c.minX - PLAYER_R - pos.x, 0],
        [c.maxX + PLAYER_R - pos.x, 0],
        [0, c.minZ - PLAYER_R - pos.z],
        [0, c.maxZ + PLAYER_R - pos.z],
      ];
      pushes.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
      pos.x += pushes[0][0];
      pos.z += pushes[0][1];
    }
  }
  pos.x = THREE.MathUtils.clamp(pos.x, -WORLD_HALF, WORLD_HALF);
  pos.z = THREE.MathUtils.clamp(pos.z, -WORLD_HALF, WORLD_HALF);
}

// ---------- helpers ----------
type V3 = [number, number, number];

function Box({ p, s, c, shadow = true }: { p: V3; s: V3; c: string; shadow?: boolean }) {
  return (
    <mesh position={p} castShadow={shadow} receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} />
    </mesh>
  );
}

/** Many identical boxes in one draw call. Each item: position + optional per-item size and color. */
function BoxInstances({ items, shadow = true }: { items: { p: V3; s: V3; c: string }[]; shadow?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const color = new THREE.Color();
    items.forEach((it, i) => {
      m.compose(new THREE.Vector3(...it.p), q, new THREE.Vector3(...it.s));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, color.set(it.c));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} castShadow={shadow} receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial />
    </instancedMesh>
  );
}

function Pole({ p, h, r = 0.06, c = "#9aa3ad" }: { p: [number, number]; h: number; r?: number; c?: string }) {
  return (
    <mesh position={[p[0], h / 2, p[1]]} castShadow>
      <cylinderGeometry args={[r, r, h, 10]} />
      <meshStandardMaterial color={c} metalness={0.3} roughness={0.5} />
    </mesh>
  );
}

function useTextTexture(text: string, bg: string, fg: string, w = 1024, h = 256) {
  return useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let size = h * 0.62;
    const font = (s: number) =>
      `bold ${s}px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", "Noto Sans CJK KR", sans-serif`;
    ctx.font = font(size);
    while (ctx.measureText(text).width > w * 0.9 && size > 10) ctx.font = font((size -= 4));
    ctx.fillText(text, w / 2, h / 2 + h * 0.03);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }, [text, bg, fg, w, h]);
}

type SignProps = { p: V3; size: [number, number]; text: string; bg: string; fg: string; ry?: number };
function Sign({ p, size, text, bg, fg, ry = 0 }: SignProps) {
  const tex = useTextTexture(text, bg, fg, 1024, Math.round((1024 * size[1]) / size[0]));
  return (
    <mesh position={p} rotation-y={ry}>
      <planeGeometry args={size} />
      <meshStandardMaterial map={tex} />
    </mesh>
  );
}

// ---------- pieces ----------
function MainBuilding({ dark }: { dark: boolean }) {
  const { x, z, w, d, floors, floorH } = BUILDING;
  const H = floors * floorH;
  const front = z + d / 2;
  const wall = dark ? "#b9ae98" : "#f1e6cc";
  const glass = dark ? "#e8d48a" : "#7f9fbe"; // lit windows at night
  const cols = 13;
  const windows = useMemo(() => {
    const out: { p: V3; s: V3; c: string }[] = [];
    for (let f = 0; f < floors; f++) {
      for (let i = 0; i < cols; i++) {
        const wx = x - w / 2 + 1.6 + (i * (w - 3.2)) / (cols - 1);
        if (Math.abs(wx - x) < 2.2) continue; // central stair core
        const wy = f * floorH + 1.7;
        out.push({ p: [wx, wy, front + 0.03], s: [1.7, 1.5, 0.06], c: "#ffffff" });
        out.push({ p: [wx, wy, front + 0.06], s: [1.5, 1.3, 0.04], c: glass });
      }
    }
    return out;
  }, [x, w, floors, floorH, front, glass]);
  return (
    <group>
      <Box p={[x, H / 2, z]} s={[w, H, d]} c={wall} />
      <Box p={[x, 0.35, front + 0.02]} s={[w + 0.1, 0.7, 0.1]} c="#a8553f" />
      {Array.from({ length: floors }, (_, f) => (
        <Box key={f} p={[x, (f + 1) * floorH - 0.1, front + 0.12]} s={[w + 0.2, 0.2, 0.25]} c="#ffffff" />
      ))}
      <BoxInstances items={windows} shadow={false} />
      {/* stair core with clock and school name */}
      <Box p={[x, (H + 2.4) / 2, front - 0.4]} s={[4, H + 2.4, 1.2]} c={dark ? "#a39882" : "#e3d5b5"} />
      <Clock p={[x, H + 0.9, front + 0.22]} />
      <Sign p={[x, H - 1.2, front + 0.22]} size={[3.6, 0.9]} text={SCHOOL_NAME} bg="#2f5f9e" fg="#ffffff" />
      {/* entrance */}
      <Box p={[x, 1.2, front + 0.21]} s={[2.6, 2.4, 0.04]} c="#3d4b5c" shadow={false} />
      <Box p={[x, 2.75, front + 1]} s={[4.6, 0.25, 2]} c="#ffffff" />
      <Box p={[x, 0.08, front + 1.2]} s={[5, 0.16, 2.4]} c="#c9c2b6" />
      <Box p={[x, H + 0.15, z]} s={[w + 0.3, 0.3, d + 0.3]} c="#d9cdb0" />
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
      <mesh>
        <circleGeometry args={[0.85, 32]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, 0, -0.01]}>
        <circleGeometry args={[0.95, 32]} />
        <meshStandardMaterial color="#2f5f9e" />
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

function Field({ dark }: { dark: boolean }) {
  const line = "#f7f4ee";
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[FIELD.x, 0.01, FIELD.z]} receiveShadow>
        <planeGeometry args={[FIELD.w, FIELD.d]} />
        <meshStandardMaterial color={dark ? "#7d6a52" : "#d8b98c"} />
      </mesh>
      {/* oval track line and center circle */}
      <mesh rotation-x={-Math.PI / 2} position={[FIELD.x, 0.02, FIELD.z]} scale={[1.45, 1, 1]}>
        <ringGeometry args={[9.55, 9.75, 64]} />
        <meshBasicMaterial color={line} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[FIELD.x, 0.02, FIELD.z]}>
        <ringGeometry args={[2.3, 2.45, 48]} />
        <meshBasicMaterial color={line} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[FIELD.x, 0.02, FIELD.z]}>
        <planeGeometry args={[0.15, 19]} />
        <meshBasicMaterial color={line} />
      </mesh>
      <Goal x={15.9} dir={-1} />
      <Goal x={-15.9} dir={1} />
    </group>
  );
}

function Goal({ x, dir }: { x: number; dir: 1 | -1 }) {
  const z = FIELD.z;
  const white = "#ffffff";
  return (
    <group>
      <Pole p={[x + dir * 0.5, z - 2.5]} h={2} r={0.07} c={white} />
      <Pole p={[x + dir * 0.5, z + 2.5]} h={2} r={0.07} c={white} />
      <Box p={[x + dir * 0.5, 2, z]} s={[0.14, 0.14, 5.1]} c={white} />
      <mesh position={[x - dir * 0.1, 1, z]}>
        <boxGeometry args={[1.2, 2, 5]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.25} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Podium() {
  const { x, z, w, d, h } = PODIUM;
  return (
    <group>
      <Box p={[x, h / 2, z]} s={[w, h, d]} c="#c7c1b5" />
      <Box p={[x, h / 3, z + d / 2 + 0.35]} s={[2.4, (h * 2) / 3, 0.7]} c="#b8b2a6" />
      <Box p={[x, h / 6, z + d / 2 + 0.95]} s={[2.4, h / 3, 0.6]} c="#b8b2a6" />
      <Box p={[x, h + 0.45, z - d / 2 + 0.1]} s={[w, 0.9, 0.12]} c="#4f7cc0" />
    </group>
  );
}

function Flagpole() {
  const tex = useTextTexture("한빛", "#2e8b57", "#ffffff", 512, 340);
  return (
    <group>
      <Box p={[FLAG.x, 0.15, FLAG.z]} s={[1, 0.3, 1]} c="#b8b2a6" />
      <Pole p={[FLAG.x, FLAG.z]} h={8} r={0.07} />
      <mesh position={[FLAG.x + 0.9, 7.2, FLAG.z]}>
        <planeGeometry args={[1.8, 1.2]} />
        <meshStandardMaterial map={tex} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Statue() {
  // "Girl reading a book" statue, a common sight in Korean school yards.
  const { x, z } = STATUE;
  const bronze = "#8c6d46";
  return (
    <group position={[x, 0, z]}>
      <Box p={[0, 0.5, 0]} s={[1.2, 1, 1.2]} c="#cfc8bc" />
      <mesh position={[0, 1.45, 0]} castShadow>
        <capsuleGeometry args={[0.25, 0.4, 4, 10]} />
        <meshStandardMaterial color={bronze} metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[0, 2.05, 0]} castShadow>
        <sphereGeometry args={[0.2, 14, 12]} />
        <meshStandardMaterial color={bronze} metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.55, 0.28]} rotation-x={-0.6}>
        <boxGeometry args={[0.45, 0.32, 0.05]} />
        <meshStandardMaterial color={bronze} metalness={0.4} roughness={0.5} />
      </mesh>
    </group>
  );
}

function Playground({ dark }: { dark: boolean }) {
  const red = "#e04b3c";
  const yellow = "#f2c230";
  const blue = "#3c7fd1";
  const green = "#3bb273";
  const bars: { p: V3; s: V3; c: string }[] = [];
  // jungle gym: 3x3x3 cube frame
  const jg = { x: 21, z: -4.5, n: 3 }; // n x n x n cells of 1m
  const off = (i: number) => i - jg.n / 2;
  for (let i = 0; i <= jg.n; i++) {
    for (let j = 0; j <= jg.n; j++) {
      bars.push({ p: [jg.x + off(i), jg.n / 2, jg.z + off(j)], s: [0.07, jg.n, 0.07], c: (i + j) % 2 ? green : blue });
    }
    for (let k = 1; k <= jg.n; k++) {
      bars.push({ p: [jg.x, k, jg.z + off(i)], s: [jg.n, 0.07, 0.07], c: yellow });
      bars.push({ p: [jg.x + off(i), k, jg.z], s: [0.07, 0.07, jg.n], c: yellow });
    }
  }
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[SAND.x, 0.015, SAND.z]} receiveShadow>
        <planeGeometry args={[SAND.w, SAND.d]} />
        <meshStandardMaterial color={dark ? "#8f8160" : "#ecdcae"} />
      </mesh>
      {/* slide */}
      <group position={[20.4, 0, -11]}>
        <Box p={[0, 1.4, 0]} s={[1.4, 0.15, 1.4]} c={blue} />
        {[-0.6, 0.6].flatMap((a) => [-0.6, 0.6].map((b) => <Pole key={`${a}${b}`} p={[a, b]} h={1.4} r={0.06} c={blue} />))}
        <Box p={[0, 0.7, -0.75]} s={[1, 1.4, 0.08]} c={yellow} />
        <mesh position={[0, 0.75, 1.65]} rotation-x={0.55} castShadow>
          <boxGeometry args={[0.9, 0.08, 2.4]} />
          <meshStandardMaterial color={red} />
        </mesh>
      </group>
      <BoxInstances items={bars} />
      {/* swings */}
      <group position={[20.6, 0, 0.6]}>
        {[-1.7, 1.7].map((a) => (
          <group key={a}>
            <mesh position={[a, 1.25, -0.6]} rotation-x={0.45} castShadow>
              <cylinderGeometry args={[0.07, 0.07, 2.7, 8]} />
              <meshStandardMaterial color={red} />
            </mesh>
            <mesh position={[a, 1.25, 0.6]} rotation-x={-0.45} castShadow>
              <cylinderGeometry args={[0.07, 0.07, 2.7, 8]} />
              <meshStandardMaterial color={red} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 2.45, 0]} rotation-z={Math.PI / 2} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 3.6, 8]} />
          <meshStandardMaterial color={red} />
        </mesh>
        {[-0.8, 0.8].map((a) => (
          <group key={a}>
            <Box p={[a - 0.25, 1.5, 0]} s={[0.03, 1.9, 0.03]} c="#555" shadow={false} />
            <Box p={[a + 0.25, 1.5, 0]} s={[0.03, 1.9, 0.03]} c="#555" shadow={false} />
            <Box p={[a, 0.55, 0]} s={[0.7, 0.06, 0.3]} c={yellow} />
          </group>
        ))}
      </group>
    </group>
  );
}

function ChinUpBars() {
  return (
    <group>
      {[
        [-10, 1.2],
        [-8.5, 1.5],
        [-7, 1.8],
      ].map(([z, h]) => (
        <group key={z}>
          <Pole p={[-19.5, z - 0.6]} h={h} r={0.06} c="#6c7a89" />
          <Pole p={[-19.5, z + 0.6]} h={h} r={0.06} c="#6c7a89" />
          <mesh position={[-19.5, h, z]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.04, 0.04, 1.2, 8]} />
            <meshStandardMaterial color="#c0c6cc" metalness={0.5} roughness={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Gym({ dark }: { dark: boolean }) {
  const { x, z, w, d, h } = GYM;
  return (
    <group>
      <Box p={[x, h / 2, z]} s={[w, h, d]} c={dark ? "#a9a38f" : "#ebe4d2"} />
      <mesh position={[x, h, z]} rotation-x={Math.PI / 2} castShadow>
        <cylinderGeometry args={[w / 2, w / 2, d, 24, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color="#4f86c6" side={THREE.DoubleSide} />
      </mesh>
      {[-4.5, -1.5, 1.5, 4.5].map((dz) => (
        <Box key={dz} p={[x + w / 2 + 0.03, 3, z + dz]} s={[0.06, 1.6, 2]} c="#7f9fbe" shadow={false} />
      ))}
      <Box p={[x + w / 2 + 0.03, 1.1, z + 6]} s={[0.06, 2.2, 1.6]} c="#3d4b5c" shadow={false} />
      <Sign p={[x + w / 2 + 0.05, h - 0.6, z]} size={[3, 0.8]} text="강당" bg="#ffffff" fg="#2f5f9e" ry={Math.PI / 2} />
    </group>
  );
}

function Tree({ x, z, crown }: { x: number; z: number; crown: string }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.1, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.22, 2.2, 8]} />
        <meshStandardMaterial color="#6e4b2f" />
      </mesh>
      <mesh position={[0, 2.9, 0]} castShadow>
        <icosahedronGeometry args={[1.3, 1]} />
        <meshStandardMaterial color={crown} flatShading />
      </mesh>
    </group>
  );
}

function Bench({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <Box p={[0, 0.45, 0]} s={[2, 0.1, 0.6]} c="#a86f3d" />
      <Box p={[0, 0.85, 0.27]} s={[2, 0.5, 0.08]} c="#a86f3d" />
      <Box p={[-0.85, 0.22, 0]} s={[0.1, 0.45, 0.5]} c="#555" />
      <Box p={[0.85, 0.22, 0]} s={[0.1, 0.45, 0.5]} c="#555" />
    </group>
  );
}

function Flowerbed({ x, z }: { x: number; z: number }) {
  const colors = ["#ff6b8b", "#ffd23f", "#ff9f43", "#c56cf0", "#ffffff"];
  return (
    <group position={[x, 0, z]}>
      <Box p={[0, 0.25, 0]} s={[6, 0.5, 1.2]} c="#9c8f7a" />
      <Box p={[0, 0.52, 0]} s={[5.7, 0.06, 0.95]} c="#5b3f2a" shadow={false} />
      <BoxInstances
        shadow={false}
        items={Array.from({ length: 14 }, (_, i) => ({
          p: [-2.6 + i * 0.4, 0.68, i % 2 ? 0.2 : -0.2] as V3,
          s: [0.26, 0.26, 0.26] as V3,
          c: colors[i % colors.length],
        }))}
      />
    </group>
  );
}

function Walls({ dark }: { dark: boolean }) {
  const E = WORLD_HALF + 0.6;
  const c = dark ? "#9d9585" : "#d8cfc0";
  const cap = "#a8553f";
  const h = 1.6;
  const seg = (p: V3, s: V3, k: string) => (
    <group key={k}>
      <Box p={p} s={s} c={c} />
      <Box p={[p[0], h + 0.08, p[2]]} s={[s[0] + 0.1, 0.16, s[2] + 0.1]} c={cap} />
    </group>
  );
  return (
    <group>
      {seg([0, h / 2, -E], [2 * E, h, 0.4], "n")}
      {seg([-E, h / 2, 0], [0.4, h, 2 * E], "w")}
      {seg([E, h / 2, 0], [0.4, h, 2 * E], "e")}
      {seg([-(E + 4.9) / 2, h / 2, E], [E - 4.9, h, 0.4], "sw")}
      {seg([(E + 4.9) / 2, h / 2, E], [E - 4.9, h, 0.4], "se")}
    </group>
  );
}

function Gate() {
  return (
    <group>
      <Box p={[-4.2, 1.4, 24.3]} s={[1.2, 2.8, 1.2]} c="#8d8478" />
      <Box p={[4.2, 1.4, 24.3]} s={[1.2, 2.8, 1.2]} c="#8d8478" />
      <Sign p={[-4.2, 1.9, 24.91]} size={[1, 2]} text="한빛" bg="#f5f1e8" fg="#2b2b2b" />
      <Box p={[0, 3.3, 24.3]} s={[9.6, 0.5, 0.5]} c="#2f5f9e" />
      <Sign p={[0, 3.3, 24.56]} size={[6, 0.42]} text={SCHOOL_NAME} bg="#2f5f9e" fg="#ffffff" />
    </group>
  );
}

export default function School({ dark }: { dark: boolean }) {
  return (
    <>
      {/* base ground: grass around, paved apron in front of the building */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[WORLD_HALF * 2 + 6, WORLD_HALF * 2 + 6]} />
        <meshStandardMaterial color={dark ? "#33452f" : "#9cc77e"} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.005, -14.5]} receiveShadow>
        <planeGeometry args={[36, 4.5]} />
        <meshStandardMaterial color={dark ? "#595650" : "#cdc6b8"} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.005, 20.8]} receiveShadow>
        <planeGeometry args={[7.2, 6.4]} />
        <meshStandardMaterial color={dark ? "#595650" : "#cdc6b8"} />
      </mesh>
      <MainBuilding dark={dark} />
      <Field dark={dark} />
      <Podium />
      <Flagpole />
      <Statue />
      <Playground dark={dark} />
      <ChinUpBars />
      <Gym dark={dark} />
      {GINKGO.map(([x, z]) => (
        <Tree key={`g${x}`} x={x} z={z} crown="#e9c22c" />
      ))}
      {CHERRY.map(([x, z]) => (
        <Tree key={`c${x}${z}`} x={x} z={z} crown="#f2b5c9" />
      ))}
      {BENCHES.map(([x, z]) => (
        <Bench key={x} x={x} z={z} />
      ))}
      {FLOWERBEDS.map(([x, z]) => (
        <Flowerbed key={x} x={x} z={z} />
      ))}
      <Walls dark={dark} />
      <Gate />
    </>
  );
}
