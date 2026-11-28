// 서울대공원-inspired park next to the school (its own zone). A simplified reinterpretation, not
// an accurate map: entrance plaza and elephant-train stop (south), lake with the train loop and the
// sky lift (center), zoo (north-east), rose garden and greenhouse (west), campsite (south-west),
// lawn (south-east), mountains beyond. Everything here is in park-local coordinates.
import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Box, BoxInstances, ImageSign, Sign, box, circle, pushOut, type Collider, type V3 } from "./parts";
import { materials, worldMapped } from "./look";
import { Forest, HILL } from "./School";
import { PARK, PARK_EXIT_MAT, PARK_RIDES } from "./zones";
import { CAR_GAP, LIFT_LEFT, LIFT_LEN, LIFT_LINE, RIDES, liftCableY, ridePose } from "../shared/layout.js";
import type { RideState } from "./net";
import { rides, serverNow } from "./net";
import Cafe, { CAFE_COLLIDERS } from "./Cafe";
import ParkDogs from "./ParkDogs";

type Item = { p: V3; s: V3; c: string };
type Rect = [number, number, number, number]; // minX, maxX, minZ, maxZ

const HW = (PARK.maxX - PARK.minX) / 2;
const HD = (PARK.maxZ - PARK.minZ) / 2;
export const LAKE = { x: 8, z: 4, r: 16 };
export const LOOP = { x: 8, z: 4, rx: 27, rz: 24 }; // train road around the lake
const LIFT = { a: new THREE.Vector3(-14, 0, 37.5), b: new THREE.Vector3(64, 0, -46), y: 9 };

type Pen = { name: string; rect: Rect; ground: string; animal: "giraffe" | "elephant" | "lion" | "zebra" | "penguin" | "flamingo" | "rabbit"; count: number };
export const PENS: Pen[] = [
  { name: "기린", rect: [22, 34, -32, -18], ground: "#c9b27c", animal: "giraffe", count: 2 },
  { name: "코끼리", rect: [38, 52, -32, -18], ground: "#b59b74", animal: "elephant", count: 2 },
  { name: "사자", rect: [56, 68, -32, -18], ground: "#d4b483", animal: "lion", count: 2 },
  { name: "얼룩말", rect: [22, 34, -54, -38], ground: "#a3b18a", animal: "zebra", count: 3 },
  { name: "펭귄", rect: [38, 48, -54, -40], ground: "#cfe8ef", animal: "penguin", count: 6 },
  { name: "홍학", rect: [50, 58, -54, -40], ground: "#9ad1d4", animal: "flamingo", count: 5 },
  { name: "어린이동물원", rect: [52, 66, -12, -2], ground: "#cfe1b9", animal: "rabbit", count: 6 },
];
export const GREENHOUSE = { x: -48, z: -40, w: 20, d: 12 };
export const FOUNTAIN = { x: -34, z: -4, r: 2.2 };
export const TENTS: [number, number, string][] = [];
for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) TENTS.push([-62 + i * 8, 30 + j * 9, ["#e76f51", "#2a9d8f", "#e9c46a", "#457b9d"][(i + j) % 4]]);
const TREES: [number, number][] = (() => {
  const out: [number, number][] = [];
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const blocked = (x: number, z: number) =>
    Math.hypot((x - LOOP.x) / (LOOP.rx + 3), (z - LOOP.z) / (LOOP.rz + 3)) < 1.15 ||
    (x > 18 && z < -1) || // zoo
    (x < -26 && z > -50 && z < 58) || // gardens, greenhouse, campsite
    (x > 26 && z > 22) || // lawn
    (Math.abs(x) < 18 && z > 40); // entrance
  while (out.length < 70) {
    const x = (rnd() - 0.5) * 2 * (HW - 3);
    const z = (rnd() - 0.5) * 2 * (HD - 3);
    if (!blocked(x, z)) out.push([x, z]);
  }
  // a line of trees along the north edge in front of the mountains
  for (let x = -66; x <= 66; x += 6) out.push([x, -57]);
  return out;
})();

// ---------- collisions ----------
const fence = (r: Rect, gapX?: number): Collider[] => {
  const [x0, x1, z0, z1] = r;
  const t = 0.2;
  const out: Collider[] = [
    { kind: "box", minX: x0, maxX: x1, minZ: z0 - t, maxZ: z0 + t },
    { kind: "box", minX: x0 - t, maxX: x0 + t, minZ: z0, maxZ: z1 },
    { kind: "box", minX: x1 - t, maxX: x1 + t, minZ: z0, maxZ: z1 },
  ];
  if (gapX === undefined) out.push({ kind: "box", minX: x0, maxX: x1, minZ: z1 - t, maxZ: z1 + t });
  else {
    out.push({ kind: "box", minX: x0, maxX: gapX - 1.3, minZ: z1 - t, maxZ: z1 + t });
    out.push({ kind: "box", minX: gapX + 1.3, maxX: x1, minZ: z1 - t, maxZ: z1 + t });
  }
  return out;
};
const LOCAL_COLLIDERS: Collider[] = [
  circle(LAKE.x, LAKE.z, LAKE.r),
  ...PENS.flatMap((p) => (p.animal === "rabbit" ? fence(p.rect, (p.rect[0] + p.rect[1]) / 2) : fence(p.rect))),
  box(GREENHOUSE.x, GREENHOUSE.z, GREENHOUSE.w, GREENHOUSE.d),
  circle(FOUNTAIN.x, FOUNTAIN.z, FOUNTAIN.r),
  ...TENTS.map(([x, z]) => circle(x, z, 1.6)),
  box(-11, 52, 3, 2.4), // ticket booth
  circle(-6, 46, 0.6),
  circle(6, 46, 0.6), // entrance arch pillars
  ...TREES.map(([x, z]) => circle(x, z, 0.5)),
  ...CAFE_COLLIDERS, // lawn cafe: building, counter (with the barista's corner), tables
];
const WORLD_COLLIDERS: Collider[] = LOCAL_COLLIDERS.map((c) =>
  c.kind === "box" ? { ...c, minX: c.minX + PARK.cx, maxX: c.maxX + PARK.cx } : { ...c, x: c.x + PARK.cx },
);

export function resolvePark(pos: THREE.Vector3) {
  pushOut(pos, WORLD_COLLIDERS);
  pos.x = THREE.MathUtils.clamp(pos.x, PARK.minX, PARK.maxX);
  pos.z = THREE.MathUtils.clamp(pos.z, PARK.minZ, PARK.maxZ);
}

// ---------- animals (built from rounded parts, gently wandering) ----------
const SPHERE = new THREE.SphereGeometry(0.5, 20, 14);
const LIMB = new THREE.CylinderGeometry(0.5, 0.42, 1, 10);
/** Box-sized part drawn rounded: tall thin parts (legs, necks, trunks) as tapered cylinders, the rest as ellipsoids. */
function Soft({ p, s, c }: { p: V3; s: V3; c: string }) {
  const limb = s[1] > 1.8 * Math.max(s[0], s[2]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }), [c]);
  return <mesh position={p} scale={limb ? s : [s[0] * 1.08, s[1] * 1.08, s[2] * 1.05]} geometry={limb ? LIMB : SPHERE} material={mat} castShadow />;
}
function Animal({ kind }: { kind: Pen["animal"] }) {
  switch (kind) {
    case "giraffe":
      return (
        <>
          <Soft p={[0, 1.6, 0]} s={[0.9, 0.8, 1.6]} c="#e9b44c" />
          {[-0.3, 0.3].flatMap((x) => [-0.55, 0.55].map((z) => <Soft key={`${x}${z}`} p={[x, 0.6, z]} s={[0.15, 1.2, 0.15]} c="#d39b2d" />))}
          <Soft p={[0, 2.9, 0.65]} s={[0.3, 2, 0.3]} c="#e9b44c" />
          <Soft p={[0, 3.95, 0.85]} s={[0.35, 0.35, 0.6]} c="#e9b44c" />
          <Soft p={[-0.2, 1.8, 0.3]} s={[0.25, 0.25, 0.02]} c="#8b5a2b" />
          <Soft p={[0.25, 1.5, -0.4]} s={[0.3, 0.3, 0.02]} c="#8b5a2b" />
        </>
      );
    case "elephant":
      return (
        <>
          <Soft p={[0, 1.4, 0]} s={[1.6, 1.4, 2.4]} c="#8d99ae" />
          {[-0.5, 0.5].flatMap((x) => [-0.8, 0.8].map((z) => <Soft key={`${x}${z}`} p={[x, 0.4, z]} s={[0.45, 0.8, 0.45]} c="#7d8597" />))}
          <Soft p={[0, 1.7, 1.45]} s={[1, 1, 0.8]} c="#8d99ae" />
          <Soft p={[0, 1.0, 1.95]} s={[0.3, 1.2, 0.3]} c="#7d8597" />
          <Soft p={[-0.7, 1.8, 1.3]} s={[0.1, 0.9, 0.8]} c="#a3aab8" />
          <Soft p={[0.7, 1.8, 1.3]} s={[0.1, 0.9, 0.8]} c="#a3aab8" />
        </>
      );
    case "lion":
      return (
        <>
          <Soft p={[0, 0.8, 0]} s={[0.8, 0.7, 1.6]} c="#d4a373" />
          {[-0.25, 0.25].flatMap((x) => [-0.55, 0.55].map((z) => <Soft key={`${x}${z}`} p={[x, 0.25, z]} s={[0.18, 0.5, 0.18]} c="#c08552" />))}
          <Soft p={[0, 1.15, 0.85]} s={[0.95, 0.95, 0.5]} c="#9c6644" />
          <Soft p={[0, 1.1, 1.1]} s={[0.5, 0.5, 0.35]} c="#d4a373" />
        </>
      );
    case "zebra":
      return (
        <>
          <Soft p={[0, 1, 0]} s={[0.7, 0.7, 1.5]} c="#f8f9fa" />
          {[-0.45, -0.15, 0.15, 0.45].map((z) => (
            <Soft key={z} p={[0, 1, z]} s={[0.72, 0.72, 0.1]} c="#212529" />
          ))}
          {[-0.2, 0.2].flatMap((x) => [-0.5, 0.5].map((z) => <Soft key={`${x}${z}`} p={[x, 0.33, z]} s={[0.14, 0.66, 0.14]} c="#f8f9fa" />))}
          <Soft p={[0, 1.5, 0.85]} s={[0.3, 0.6, 0.5]} c="#f8f9fa" />
        </>
      );
    case "penguin":
      return (
        <>
          <Soft p={[0, 0.35, 0]} s={[0.4, 0.7, 0.35]} c="#212529" />
          <Soft p={[0, 0.33, 0.12]} s={[0.3, 0.55, 0.15]} c="#ffffff" />
          <Soft p={[0, 0.5, 0.25]} s={[0.1, 0.06, 0.12]} c="#f4a261" />
        </>
      );
    case "flamingo":
      return (
        <>
          <Soft p={[0, 1.2, 0]} s={[0.35, 0.35, 0.6]} c="#ff8fab" />
          <Soft p={[0, 0.55, 0]} s={[0.05, 1.1, 0.05]} c="#ff5d8f" />
          <Soft p={[0, 1.6, 0.25]} s={[0.08, 0.6, 0.08]} c="#ff8fab" />
          <Soft p={[0, 1.9, 0.35]} s={[0.15, 0.12, 0.25]} c="#ff8fab" />
        </>
      );
    default:
      return (
        <>
          <Soft p={[0, 0.2, 0]} s={[0.35, 0.3, 0.5]} c="#f1faee" />
          <Soft p={[0, 0.4, 0.2]} s={[0.25, 0.25, 0.25]} c="#f1faee" />
          <Soft p={[-0.06, 0.62, 0.2]} s={[0.06, 0.25, 0.06]} c="#ffc8dd" />
          <Soft p={[0.06, 0.62, 0.2]} s={[0.06, 0.25, 0.06]} c="#ffc8dd" />
        </>
      );
  }
}

function PenAnimals({ pen }: { pen: Pen }) {
  const refs = useRef<(THREE.Group | null)[]>([]);
  const [x0, x1, z0, z1] = pen.rect;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const rx = (x1 - x0) / 2 - 1.6;
  const rz = (z1 - z0) / 2 - 1.6;
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    refs.current.forEach((g, i) => {
      if (!g) return;
      const speed = pen.animal === "penguin" || pen.animal === "rabbit" ? 0.35 : 0.12;
      const a = t * speed + (i * Math.PI * 2) / pen.count;
      const r = 0.45 + 0.4 * Math.sin(i * 1.7);
      g.position.set(cx + Math.cos(a) * rx * r, pen.animal === "rabbit" || pen.animal === "penguin" ? Math.abs(Math.sin(t * 4 + i)) * 0.12 : 0, cz + Math.sin(a) * rz * r);
      g.rotation.y = -a; // face along the path
    });
  });
  return (
    <>
      {Array.from({ length: pen.count }, (_, i) => (
        <group key={i} ref={(el) => (refs.current[i] = el)}>
          <Animal kind={pen.animal} />
        </group>
      ))}
    </>
  );
}

// ---------- moving rides ----------
function ElephantTrain() {
  const cars = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.09;
    cars.current.forEach((g, i) => {
      if (!g) return;
      const a = t - i * 0.075;
      const x = LOOP.x + Math.cos(a) * LOOP.rx;
      const z = LOOP.z + Math.sin(a) * LOOP.rz;
      g.position.set(x, 0, z);
      g.rotation.y = -a; // tangent of the ellipse (approx.)
    });
  });
  const colors = ["#8d99ae", "#e76f51", "#2a9d8f", "#e9c46a"];
  return (
    <>
      {colors.map((c, i) => (
        <group key={i} ref={(el) => (cars.current[i] = el)}>
          <Box p={[0, 0.7, 0]} s={[1.6, 1, 2.6]} c={c} />
          <Box p={[0, 1.7, 0]} s={[1.7, 0.12, 2.7]} c="#ffffff" />
          {[-0.65, 0.65].flatMap((x) => [-0.9, 0.9].map((z) => <Box key={`${x}${z}`} p={[x, 1.2, z]} s={[0.08, 1, 0.08]} c="#ffffff" />))}
          {i === 0 && (
            <>
              <Box p={[0, 1.1, 1.6]} s={[1.2, 1.2, 0.6]} c="#8d99ae" />
              <Box p={[0, 0.5, 2]} s={[0.25, 0.9, 0.25]} c="#7d8597" />
              <Box p={[-0.75, 1.2, 1.5]} s={[0.1, 0.8, 0.7]} c="#a3aab8" />
              <Box p={[0.75, 1.2, 1.5]} s={[0.1, 0.8, 0.7]} c="#a3aab8" />
            </>
          )}
        </group>
      ))}
    </>
  );
}

/** A point on the chairlift's cable loop at distance `s` (metres) from station a's boarding point. */
const LOOP_R = LIFT_LINE.side;
const LOOP_LEN = 2 * LIFT_LEN + 2 * Math.PI * LOOP_R;
const D = { x: (LIFT.b.x - LIFT.a.x) / LIFT_LEN, z: (LIFT.b.z - LIFT.a.z) / LIFT_LEN };
function loopPoint(s: number) {
  s = ((s % LOOP_LEN) + LOOP_LEN) % LOOP_LEN;
  const L = LIFT_LEN;
  const r = LOOP_R;
  const arc = Math.PI * r;
  if (s < L) {
    const k = s / L;
    return { x: LIFT.a.x + D.x * s + LIFT_LEFT.x * r, z: LIFT.a.z + D.z * s + LIFT_LEFT.z * r, y: liftCableY(k), ry: Math.atan2(D.x, D.z) };
  }
  if (s < L + arc) {
    const th = (s - L) / r; // around the far bullwheel, left line → right line
    const c = Math.cos(th);
    const sn = Math.sin(th);
    return {
      x: LIFT.b.x + LIFT_LEFT.x * r * c + D.x * r * sn,
      z: LIFT.b.z + LIFT_LEFT.z * r * c + D.z * r * sn,
      y: LIFT_LINE.station,
      ry: Math.atan2(D.x * c - LIFT_LEFT.x * sn, D.z * c - LIFT_LEFT.z * sn),
    };
  }
  if (s < 2 * L + arc) {
    const k = 1 - (s - L - arc) / L;
    return { x: LIFT.a.x + D.x * k * L - LIFT_LEFT.x * r, z: LIFT.a.z + D.z * k * L - LIFT_LEFT.z * r, y: liftCableY(k), ry: Math.atan2(-D.x, -D.z) };
  }
  const th = (s - 2 * L - arc) / r; // around the near bullwheel, right line → left line
  const c = Math.cos(th);
  const sn = Math.sin(th);
  return {
    x: LIFT.a.x - LIFT_LEFT.x * r * c - D.x * r * sn,
    z: LIFT.a.z - LIFT_LEFT.z * r * c - D.z * r * sn,
    y: LIFT_LINE.station,
    ry: Math.atan2(-D.x * c + LIFT_LEFT.x * sn, -D.z * c + LIFT_LEFT.z * sn),
  };
}

const CHAIR_COLORS = ["#e63946", "#457b9d", "#f4a261", "#2a9d8f"];
/** A two-seat chair hanging from its cable grip (group origin = grip on the cable). */
function Chair({ color }: { color: string }) {
  const drop = LIFT_LINE.hang - 0.35; // grip → seat surface
  return (
    <>
      <Box p={[0, -0.04, 0]} s={[0.18, 0.12, 0.34]} c="#2b2d31" shadow={false} />
      <Box p={[0, -drop / 2, -0.12]} s={[0.05, drop, 0.05]} c="#3a3d42" shadow={false} />
      <Box p={[0, -drop + 0.62, -0.12]} s={[1.15, 0.05, 0.05]} c="#3a3d42" shadow={false} />
      <Box p={[0, -drop, 0]} s={[1.15, 0.1, 0.56]} c={color} />
      <Box p={[0, -drop + 0.32, -0.27]} s={[1.15, 0.55, 0.06]} c={color} />
      <Box p={[0, -drop + 0.28, 0.18]} s={[1.1, 0.04, 0.04]} c="#3a3d42" shadow={false} />
      <Box p={[0, -drop - 0.42, 0.3]} s={[1.05, 0.04, 0.2]} c="#3a3d42" shadow={false} />
    </>
  );
}

function SkyLift() {
  const n = 18;
  const chairs = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }) => {
    chairs.current.forEach((g, i) => {
      if (!g) return;
      const p = loopPoint(clock.elapsedTime * 3 + (i / n) * LOOP_LEN);
      g.position.set(p.x, p.y, p.z);
      g.rotation.y = p.ry;
    });
  });
  // one continuous cable around both bullwheels
  const cable = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let s = 0; s < LOOP_LEN; s += 0.6) {
      const p = loopPoint(s);
      pts.push(new THREE.Vector3(p.x, p.y, p.z));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 900, 0.045, 5, true);
  }, []);
  const M = materials();
  const towers = useMemo(() => {
    const count = 6;
    return Array.from({ length: count }, (_, i) => {
      const k = LIFT_LINE.ramp + ((1 - 2 * LIFT_LINE.ramp) * i) / (count - 1);
      return { x: LIFT.a.x + D.x * k * LIFT_LEN, z: LIFT.a.z + D.z * k * LIFT_LEN, y: liftCableY(k) };
    });
  }, []);
  const angle = Math.atan2(D.x, D.z);
  return (
    <>
      <mesh geometry={cable} material={M.steel} castShadow />
      {towers.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]} rotation-y={angle}>
          {/* tapered steel tube on a concrete footing */}
          <mesh position={[0, 0.25, 0]} material={M.stone} receiveShadow>
            <boxGeometry args={[1.4, 0.5, 1.4]} />
          </mesh>
          <mesh position={[0, (t.y + 0.7) / 2, 0]} material={M.steel} castShadow>
            <cylinderGeometry args={[0.2, 0.34, t.y + 0.7, 12]} />
          </mesh>
          {/* crossarm across both lines */}
          <mesh position={[0, t.y + 0.55, 0]} material={M.steel} castShadow>
            <boxGeometry args={[2 * LOOP_R + 1.2, 0.22, 0.3]} />
          </mesh>
          {/* sheave trains the cable runs over */}
          {[1, -1].map((sd) => (
            <group key={sd} position={[sd * LOOP_R, t.y + 0.1, 0]}>
              <Box p={[0, 0.2, 0]} s={[0.08, 0.4, 0.08]} c="#5d6168" shadow={false} />
              <Box p={[0, 0, 0]} s={[0.16, 0.2, 1.5]} c="#2b2d31" shadow={false} />
              {[-0.5, 0, 0.5].map((z) => (
                <mesh key={z} position={[0, -0.02, z]} rotation-z={Math.PI / 2}>
                  <cylinderGeometry args={[0.13, 0.13, 0.12, 12]} />
                  <meshStandardMaterial color="#c9cdd2" metalness={0.7} roughness={0.35} />
                </mesh>
              ))}
            </group>
          ))}
        </group>
      ))}
      <LiftStation at={LIFT.a} away={-1} />
      <LiftStation at={LIFT.b} away={1} />
      {Array.from({ length: n }, (_, i) => (
        <group key={i} ref={(el) => (chairs.current[i] = el)}>
          <Chair color={CHAIR_COLORS[i % CHAIR_COLORS.length]} />
        </group>
      ))}
    </>
  );
}

/**
 * Lift terminal: concrete boarding platform with a loading line, the horizontal bullwheel the cable
 * turns around (spokes, hub, axle), the drive housing above it and a steel frame with a roof.
 * `away` = which way along the a→b axis points out of the line (-1 at a, +1 at b).
 */
function LiftStation({ at, away }: { at: THREE.Vector3; away: 1 | -1 }) {
  const M = materials();
  const angle = Math.atan2(D.x * away, D.z * away); // local +z points out of the line
  const y = LIFT_LINE.station;
  const r = LOOP_R;
  return (
    <group position={[at.x, 0, at.z]} rotation-y={angle}>
      {/* boarding platform and loading line under both cable lines */}
      <BoxInstances
        material={M.stone}
        items={[{ p: [0, 0.06, -1.2], s: [6.6, 0.12, 7.4], c: "#cfcac0" }]}
      />
      <BoxInstances
        shadow={false}
        items={[
          { p: [0, 0.125, 0], s: [2 * r + 1.4, 0.01, 0.14], c: "#f2c230" },
          { p: [0, 0.125, -3.2], s: [6.4, 0.01, 0.1], c: "#ffffff" },
        ]}
      />
      {/* bullwheel */}
      <mesh position={[0, y, 0]} rotation-x={Math.PI / 2} material={M.steel} castShadow>
        <torusGeometry args={[r, 0.09, 10, 48]} />
      </mesh>
      {[0, Math.PI / 3, (2 * Math.PI) / 3].map((a) => (
        <mesh key={a} position={[0, y, 0]} rotation-y={a} material={M.steel}>
          <boxGeometry args={[0.08, 0.08, 2 * r]} />
        </mesh>
      ))}
      <mesh position={[0, y + 0.55, 0]} material={M.steel} castShadow>
        <cylinderGeometry args={[0.16, 0.24, 1.3, 12]} />
      </mesh>
      {/* drive housing */}
      <mesh position={[0, y + 1.55, 0.6]} castShadow>
        <boxGeometry args={[2.4, 0.9, 2.6]} />
        <meshStandardMaterial color="#2f6f9f" roughness={0.45} metalness={0.3} />
      </mesh>
      {/* steel frame and roof, clear of the cable lines */}
      {[-1, 1].flatMap((sd) =>
        [-1.6, 2.6].map((z) => (
          <mesh key={`${sd}${z}`} position={[sd * (r + 1.6), 2.35, z]} material={M.steel} castShadow>
            <boxGeometry args={[0.22, 4.7, 0.22]} />
          </mesh>
        )),
      )}
      {[-1, 1].map((sd) => (
        <mesh key={`b${sd}`} position={[sd * (r + 1.6), 4.6, 0.5]} material={M.steel}>
          <boxGeometry args={[0.2, 0.25, 4.6]} />
        </mesh>
      ))}
      <mesh position={[0, 4.85, 0.5]} castShadow material={M.metalRoof}>
        <boxGeometry args={[2 * r + 4.0, 0.2, 5.4]} />
      </mesh>
    </group>
  );
}

function SwanBoats() {
  const boats = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }) => {
    boats.current.forEach((g, i) => {
      if (!g) return;
      const a = clock.elapsedTime * 0.05 * (i % 2 ? -1 : 1) + i * 2;
      const r = LAKE.r * (0.45 + 0.15 * i);
      g.position.set(LAKE.x + Math.cos(a) * r, 0.05 + Math.sin(clock.elapsedTime * 2 + i) * 0.04, LAKE.z + Math.sin(a) * r);
      g.rotation.y = -a + (i % 2 ? 0 : Math.PI);
    });
  });
  return (
    <>
      {[0, 1, 2].map((i) => (
        <group key={i} ref={(el) => (boats.current[i] = el)}>
          <Box p={[0, 0.25, 0]} s={[1.2, 0.5, 1.8]} c="#ffffff" />
          <Box p={[0, 0.9, 0.75]} s={[0.25, 0.9, 0.25]} c="#ffffff" />
          <Box p={[0, 1.3, 0.95]} s={[0.25, 0.25, 0.4]} c="#ffffff" />
          <Box p={[0, 1.3, 1.2]} s={[0.12, 0.1, 0.15]} c="#f4a261" />
        </group>
      ))}
    </>
  );
}

// ---------- vehicles that carry riders ----------
const POOL = 6;
const TRAIN_COLORS = ["#8d99ae", "#e76f51", "#2a9d8f"];

function TrainCar({ head, color }: { head: boolean; color: string }) {
  return (
    <>
      <Box p={[0, 0.7, 0]} s={[1.6, 1, 2.6]} c={color} />
      <Box p={[0, 2.5, 0]} s={[1.7, 0.12, 2.7]} c="#ffffff" />
      {[-0.65, 0.65].flatMap((x) => [-1.15, 1.15].map((z) => <Box key={`${x}${z}`} p={[x, 1.85, z]} s={[0.08, 1.3, 0.08]} c="#ffffff" />))}
      {head && (
        <>
          <Box p={[0, 1.1, 1.6]} s={[1.2, 1.2, 0.6]} c="#8d99ae" />
          <Box p={[0, 0.5, 2]} s={[0.25, 0.9, 0.25]} c="#7d8597" />
          <Box p={[-0.75, 1.2, 1.5]} s={[0.1, 0.8, 0.7]} c="#a3aab8" />
          <Box p={[0.75, 1.2, 1.5]} s={[0.1, 0.8, 0.7]} c="#a3aab8" />
        </>
      )}
    </>
  );
}

/**
 * Trains and lift chairs for everyone currently riding (this player included). Poses come from the
 * shared ride paths and the server start time, so every viewer sees the same thing.
 */
export function RideVehicles() {
  const trains = useRef<(THREE.Group | null)[][]>(Array.from({ length: POOL }, () => []));
  const chairs = useRef<(THREE.Group | null)[]>([]);
  useFrame(() => {
    let ti = 0;
    let ci = 0;
    const now = serverNow();
    // one vehicle per vehicle id, however many friends sit in it
    const byVehicle = new Map<string, RideState>();
    for (const r of rides.values()) if (!byVehicle.has(r.vehicle)) byVehicle.set(r.vehicle, r);
    for (const r of byVehicle.values()) {
      const spec = RIDES[r.ride];
      const raw = (now - r.start) / spec.duration;
      const u = Math.max(0, raw); // waits at the station until departure
      if (raw >= 1 + 3 * CAR_GAP) continue;
      if (spec.vehicle === "train" && ti < POOL) {
        trains.current[ti].forEach((g, k) => {
          if (!g) return;
          const p = ridePose(r.ride, r.dir, u - k * CAR_GAP);
          g.visible = u - k * CAR_GAP < 1;
          g.position.set(p.x - PARK.cx, 0, p.z - PARK.cz);
          g.rotation.y = p.ry;
        });
        ti++;
      } else if (spec.vehicle === "chair" && ci < POOL) {
        const g = chairs.current[ci];
        const p = ridePose(r.ride, r.dir, u);
        if (g) {
          g.visible = true;
          // group origin = grip on the cable, the chair hangs below (seat under the rider)
          g.position.set(p.x - PARK.cx, p.y + LIFT_LINE.hang, p.z - PARK.cz);
          g.rotation.y = p.ry;
        }
        ci++;
      }
    }
    for (; ti < POOL; ti++) trains.current[ti].forEach((g) => g && (g.visible = false));
    for (; ci < POOL; ci++) {
      const g = chairs.current[ci];
      if (g) g.visible = false;
    }
  });
  return (
    <group position={[PARK.cx, 0, PARK.cz]}>
      {Array.from({ length: POOL }, (_, i) =>
        TRAIN_COLORS.map((c, k) => (
          <group key={`t${i}${k}`} visible={false} ref={(el) => (trains.current[i][k] = el)}>
            <TrainCar head={k === 0} color={c} />
          </group>
        )),
      )}
      {Array.from({ length: POOL }, (_, i) => (
        <group key={`c${i}`} visible={false} ref={(el) => (chairs.current[i] = el)}>
          <Chair color="#ffb703" />
        </group>
      ))}
    </group>
  );
}

// ---------- trees (instanced) ----------
const TREE_COLORS = ["#3f7f5f", "#4f9a6c", "#62b48a", "#e2b92a", "#efb3c6"];
function Trees({ spots }: { spots: [number, number][] }) {
  const trees = useMemo(() => spots.map(([x, z], i) => ({ x, z, c: TREE_COLORS[i % 7 < 3 ? i % 3 : (i % 7) - 3 > 1 ? 1 : 3 + ((i % 7) % 2)], h: 0.85 + ((i * 37) % 10) / 20 })), [spots]);
  return <Forest trees={trees} />;
}
// (old box trees, kept for reference: replaced by the shared Forest)
export function TreeInstances({ spots }: { spots: [number, number][] }) {
  const trunks = useRef<THREE.InstancedMesh>(null);
  const crowns = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    const palette = ["#2d6a4f", "#40916c", "#52b788", "#e9c22c", "#f2b5c9"];
    spots.forEach(([x, z], i) => {
      const s = 0.85 + ((i * 37) % 10) / 20;
      trunks.current!.setMatrixAt(i, m.compose(new THREE.Vector3(x, 1.1 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s)));
      crowns.current!.setMatrixAt(i, m.compose(new THREE.Vector3(x, 2.9 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s)));
      crowns.current!.setColorAt(i, c.set(palette[i % 7 < 3 ? i % 3 : (i % 7) - 3 > 1 ? 1 : 3 + ((i % 7) % 2)]));
    });
    trunks.current!.instanceMatrix.needsUpdate = true;
    crowns.current!.instanceMatrix.needsUpdate = true;
    if (crowns.current!.instanceColor) crowns.current!.instanceColor.needsUpdate = true;
    trunks.current!.computeBoundingSphere();
    crowns.current!.computeBoundingSphere();
  }, [spots]);
  return (
    <>
      <instancedMesh ref={trunks} args={[undefined, undefined, spots.length]} castShadow>
        <cylinderGeometry args={[0.16, 0.22, 2.2, 8]} />
        <meshStandardMaterial color="#6e4b2f" />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[undefined, undefined, spots.length]} castShadow>
        <icosahedronGeometry args={[1.3, 1]} />
        <meshStandardMaterial flatShading />
      </instancedMesh>
    </>
  );
}

// ---------- static scenery ----------
const BLOOM = new THREE.IcosahedronGeometry(0.5, 1);
function Grounds({ dark }: { dark: boolean }) {
  const items = useMemo(() => {
    const out: Item[] = [];
    const paved = dark ? "#5b5850" : "#d7cfbf";
    // entrance plaza and main road north
    out.push({ p: [0, 0.006, 52], s: [34, 0.01, 16], c: paved });
    // (train road around the lake: see RingRoad)
    // zoo walkways and pens
    out.push({ p: [45, 0.006, -35], s: [48, 0.01, 4], c: paved }, { p: [45, 0.006, -15.5], s: [48, 0.01, 3], c: paved });
    out.push({ p: [20, 0.006, -33], s: [3, 0.01, 44], c: paved });
    for (const pen of PENS) {
      const [x0, x1, z0, z1] = pen.rect;
      out.push({ p: [(x0 + x1) / 2, 0.01, (z0 + z1) / 2], s: [x1 - x0, 0.01, z1 - z0], c: pen.ground });
      const add = (x: number, z: number, sx: number, sz: number) => out.push({ p: [x, 0.6, z], s: [sx, 1.2, sz], c: "#8d6e63" });
      add((x0 + x1) / 2, z0, x1 - x0, 0.12);
      add(x0, (z0 + z1) / 2, 0.12, z1 - z0);
      add(x1, (z0 + z1) / 2, 0.12, z1 - z0);
      if (pen.animal === "rabbit") {
        const g = (x0 + x1) / 2;
        add((x0 + g - 1.3) / 2, z1, g - 1.3 - x0, 0.12);
        add((g + 1.3 + x1) / 2, z1, x1 - g - 1.3, 0.12);
      } else add((x0 + x1) / 2, z1, x1 - x0, 0.12);
      if (pen.animal === "penguin") out.push({ p: [(x0 + x1) / 2, 0.02, (z0 + z1) / 2 - 2], s: [x1 - x0 - 3, 0.02, 5], c: "#4cc9f0" });
      if (pen.animal === "flamingo") out.push({ p: [(x0 + x1) / 2, 0.02, (z0 + z1) / 2], s: [x1 - x0 - 2.5, 0.02, z1 - z0 - 5], c: "#48cae4" });
    }
    // rose garden: beds of roses with an arch tunnel down the middle
    const roses = ["#e63946", "#ff8fab", "#ffb3c6", "#ffffff", "#c9184a"];
    const blooms: Item[] = []; // rose bushes, drawn round
    for (let r = 0; r < 6; r++)
      for (const side of [-1, 1]) {
        const x = -48 + side * (3.4 + (r % 2) * 0);
        const z = -18 + r * 5.4;
        out.push({ p: [x + side * 4, 0.2, z], s: [9, 0.4, 2.4], c: "#3a5a40" });
        for (let k = 0; k < 9; k++) blooms.push({ p: [x + side * (0.2 + k), 0.6, z + ((k % 2) - 0.5) * 0.9], s: [0.5, 0.42, 0.5], c: roses[(k + r) % roses.length] });
      }
    for (let z = -19; z <= 12; z += 2.6) {
      out.push({ p: [-50, 1.4, z], s: [0.12, 2.8, 0.12], c: "#ffffff" }, { p: [-46, 1.4, z], s: [0.12, 2.8, 0.12], c: "#ffffff" }, { p: [-48, 2.85, z], s: [4.2, 0.12, 0.12], c: "#ffffff" });
      out.push({ p: [-48, 2.95, z], s: [3.6, 0.3, 0.6], c: roses[Math.abs(Math.round(z)) % roses.length] });
    }
    // greenhouse base
    out.push({ p: [GREENHOUSE.x, 0.3, GREENHOUSE.z], s: [GREENHOUSE.w, 0.6, GREENHOUSE.d], c: "#adb5bd" });
    // campsite: picnic tables, campfire
    for (let i = 0; i < 4; i++) {
      out.push({ p: [-58 + i * 8, 0.38, 54], s: [2, 0.08, 1], c: "#a47148" }, { p: [-58 + i * 8, 0.22, 53.2], s: [2, 0.06, 0.35], c: "#a47148" }, { p: [-58 + i * 8, 0.22, 54.8], s: [2, 0.06, 0.35], c: "#a47148" });
    }
    out.push({ p: [-50, 0.15, 43.5], s: [1.6, 0.3, 1.6], c: "#6c757d" }, { p: [-50, 0.45, 43.5], s: [0.6, 0.5, 0.6], c: "#f77f00" });
    // lawn: lighter grass and picnic mats
    out.push({ p: [48, 0.006, 41], s: [38, 0.01, 34], c: dark ? "#4f6f4a" : "#b5e48c" });
    ["#ffafcc", "#bde0fe", "#ffd6a5", "#caffbf"].forEach((c, i) => out.push({ p: [38 + (i % 2) * 14, 0.02, 32 + Math.floor(i / 2) * 14], s: [3, 0.02, 3], c }));
    // ticket booth + arch pillars
    out.push({ p: [-11, 1.2, 52], s: [3, 2.4, 2.4], c: "#f1faee" }, { p: [-11, 2.55, 52], s: [3.4, 0.3, 2.8], c: "#2a9d8f" });
    out.push({ p: [-6, 2.2, 46], s: [1, 4.4, 1], c: "#2a9d8f" }, { p: [6, 2.2, 46], s: [1, 4.4, 1], c: "#2a9d8f" }, { p: [0, 4.6, 46], s: [13, 1.6, 1], c: "#2a9d8f" });
    // (lift stations: see LiftStation)
    // perimeter hedge
    out.push({ p: [0, 0.6, -HD - 0.5], s: [2 * HW + 2, 1.2, 1], c: "#2d6a4f" }, { p: [-HW - 0.5, 0.6, 0], s: [1, 1.2, 2 * HD + 2], c: "#2d6a4f" }, { p: [HW + 0.5, 0.6, 0], s: [1, 1.2, 2 * HD + 2], c: "#2d6a4f" });
    // ride / exit mats
    const mat = (r: [number, number, number, number], c: string) => out.push({ p: [(r[0] + r[1]) / 2, 0.03, (r[2] + r[3]) / 2], s: [r[1] - r[0], 0.02, r[3] - r[2]], c });
    for (const [i, r] of PARK_RIDES.entries()) {
      const y = i === 1 ? 0.13 : 0.03; // lift mats lie on the station platform
      for (const m of [r.a.mat, r.b.mat] as [number, number, number, number][])
        out.push({ p: [(m[0] + m[1]) / 2, y, (m[2] + m[3]) / 2], s: [m[1] - m[0], 0.02, m[3] - m[2]], c: "#e09f3e" });
    }
    mat(PARK_EXIT_MAT as [number, number, number, number], "#3bb273");
    return Object.assign(out, { blooms });
  }, [dark]);
  // surfaces by colour: paving, pen ground, fences, hedges / beds, the rest plain
  const groups = useMemo(() => {
    const paved = dark ? "#5b5850" : "#d7cfbf";
    const pens = new Set(PENS.map((p) => p.ground));
    const by: Record<"pavers" | "soil" | "wood" | "leaves" | "plain", Item[]> = { pavers: [], soil: [], wood: [], leaves: [], plain: [] };
    for (const it of items) {
      const k = it.c === paved ? "pavers" : pens.has(it.c) && it.s[1] < 0.05 ? "soil" : it.c === "#8d6e63" || it.c === "#a47148" ? "wood" : it.c === "#2d6a4f" || it.c === "#3a5a40" ? "leaves" : "plain";
      by[k].push(it);
    }
    return by;
  }, [items, dark]);
  const M = materials();
  return (
    <>
      <BoxInstances items={groups.pavers} material={M.pavers} shadow={false} />
      <BoxInstances items={groups.soil} material={M.soil} shadow={false} />
      <BoxInstances items={groups.wood} material={M.wood} />
      <BoxInstances items={groups.leaves} material={M.leaves} />
      <BoxInstances items={groups.plain} />
      <BoxInstances items={items.blooms} geometry={BLOOM} material={M.leaves} />
    </>
  );
}

let roadDarkMat: THREE.Material | null = null;
const roadDark = () => (roadDarkMat ??= worldMapped("pavers", 3, { color: "#6a665e" }));
/** Smooth paved road for the elephant train around the lake. */
function RingRoad({ dark }: { dark: boolean }) {
  const geo = useMemo(() => {
    const g = new THREE.RingGeometry(1 - 1.7 / 25.5, 1 + 1.7 / 25.5, 120, 1);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  return (
    <mesh geometry={geo} position={[LOOP.x, 0.012, LOOP.z]} scale={[LOOP.rx, 1, LOOP.rz]} receiveShadow material={dark ? roadDark() : materials().pavers} />
  );
}

/** Lake / fountain water with drifting ripples. */
function Water({ r, y, x, z, calm = false }: { r: number; y: number; x: number; z: number; calm?: boolean }) {
  const M = materials();
  useFrame((_, dt) => {
    const n = M.water.normalMap!;
    n.offset.x += dt * 0.012;
    n.offset.y += dt * 0.007;
  });
  M.water.normalMap!.repeat.set(2.5, 2.5);
  return (
    <mesh rotation-x={-Math.PI / 2} position={[x, y, z]} material={calm ? M.pool : M.water} receiveShadow>
      <circleGeometry args={[r, 64]} />
    </mesh>
  );
}

function Mountains({ dark }: { dark: boolean }) {
  const hillMats = useMemo(
    () => (dark ? ["#2a3d2f"] : ["#4e7f4e", "#46744a", "#5a8a55"]).map((c) => worldMapped("grass", 14, { roughness: 1, color: c })),
    [dark],
  );
  const peaks: [number, number, number, number][] = [
    [-60, -95, 26, 34],
    [-20, -105, 34, 44],
    [25, -100, 30, 38],
    [70, -92, 24, 30],
    [-95, -60, 22, 26],
    [100, -55, 22, 26],
  ];
  return (
    <>
      {peaks.map(([x, z, h, r], i) => (
        <mesh key={i} position={[x, -1, z]} scale={[r, h, r * 0.9]} geometry={HILL} material={hillMats[i % hillMats.length]} />
      ))}
    </>
  );
}

function Signs() {
  const s = (p: V3, text: string, bg = "#ffffff", fg = "#1d3557", w = 3.4) => <Sign key={text + p.join()} p={p} size={[w, 0.6]} text={text} bg={bg} fg={fg} />;
  return (
    <>
      <ImageSign url="/signs/park.webp" p={[0, 4.6, 46.52]} size={[10.5, 1.4]} fallback={{ p: [0, 4.6, 46.52], size: [9, 0.7], text: PARK.name, bg: "#2a9d8f", fg: "#ffffff" }} />
      {s([-11, 1.6, 53.25], "매표소", "#ffffff", "#2a9d8f", 2)}
      {s([0, 1.6, 59.4], "▼ 한빛초등학교로 돌아가기", "#3bb273", "#ffffff", 4.6)}
      {s([12, 2.4, 53.2], "코끼리열차 타기 → 동물원 (8초 안에 친구도 함께)", "#e09f3e", "#ffffff", 6.4)}
      {s([40, 2.4, -12.3], "코끼리열차 타기 → 정문 (8초 안에 친구도 함께)", "#e09f3e", "#ffffff", 6.2)}
      {s([-14, 5.6, 37.4], "스카이리프트 타기 → 동물원 정상 (2인승)", "#457b9d", "#ffffff", 5.6)}
      {s([64, 5.6, -43.2], "스카이리프트 타기 → 호숫가 (2인승)", "#457b9d", "#ffffff", 5)}
      {s([LAKE.x, 1.2, LAKE.z + LAKE.r + 1.2], "대공원 호수 · 둘레길", "#e0fbfc", "#1d3557", 4)}
      {s([45, 2.2, -13.6], "동물원", "#ffb703", "#3d2c00", 3)}
      {PENS.map((p) => s([(p.rect[0] + p.rect[1]) / 2, 1.8, p.rect[3] + 0.25], p.name, "#fff3b0", "#7a4b00", Math.max(1.6, p.name.length * 0.55)))}
      {s([-48, 3.6, 13.5], "테마가든 · 장미원", "#ff8fab", "#ffffff", 4)}
      {s([-38, 1.4, -10], "모란·작약원", "#ffffff", "#9b2c5a", 2.6)}
      {s([GREENHOUSE.x, 1.6, GREENHOUSE.z + GREENHOUSE.d / 2 + 0.2], "식물원 · 전시온실", "#d8f3dc", "#1b4332", 4)}
      {s([-48, 2, 25], "자연캠핑장", "#ffffff", "#2a9d8f", 3)}
      {s([48, 1.4, 24.5], "잔디광장", "#d8f3dc", "#1b4332", 2.6)}
      {s([0, 7, -58], "청계산", "#2d6a4f", "#ffffff", 3)}
    </>
  );
}

function Greenhouse() {
  return (
    <group position={[GREENHOUSE.x, 0.6, GREENHOUSE.z]}>
      <mesh scale={[GREENHOUSE.w / 2, 5, GREENHOUSE.d / 2]} material={materials().domeGlass}>
        <sphereGeometry args={[1, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      {/* steel ribs of the dome */}
      {Array.from({ length: 8 }, (_, i) => (
        <group key={`r${i}`} scale={[GREENHOUSE.w / 2, 5, GREENHOUSE.d / 2]}>
          <mesh rotation-y={(i / 8) * Math.PI} material={materials().frame}>
            <torusGeometry args={[1.002, 0.008, 6, 48, Math.PI]} />
          </mesh>
        </group>
      ))}
      {[-5, -1, 3, 6].map((x, i) => (
        <mesh key={i} position={[x, 1.2, (i % 2 ? 1.5 : -1.5)]}>
          <icosahedronGeometry args={[1.2, 0]} />
          <meshStandardMaterial color={["#2d6a4f", "#52b788", "#95d5b2", "#40916c"][i]} flatShading />
        </mesh>
      ))}
    </group>
  );
}

function Tents() {
  return (
    <>
      {TENTS.map(([x, z, c], i) => (
        <mesh key={i} position={[x, 0.9, z]} rotation-y={Math.PI / 4}>
          <coneGeometry args={[1.7, 1.8, 4]} />
          <meshStandardMaterial color={c} flatShading />
        </mesh>
      ))}
    </>
  );
}

export default function Park({ dark }: { dark: boolean }) {
  const M = materials();
  M.grass.color.set(dark ? "#3c5236" : "#a7cf86");
  M.soil.color.set(dark ? "#6e6350" : "#d8c49c");
  M.water.color.set(dark ? "#16324a" : "#2f6f8f");
  return (
    <group position={[PARK.cx, 0, PARK.cz]}>
      <mesh rotation-x={-Math.PI / 2} receiveShadow material={materials().grass}>
        <planeGeometry args={[2 * HW + 600, 2 * HD + 600]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[LAKE.x, 0.02, LAKE.z]} receiveShadow material={materials().soil}>
        <circleGeometry args={[LAKE.r + 1.2, 64]} />
      </mesh>
      <Water x={LAKE.x} y={0.04} z={LAKE.z} r={LAKE.r} />
      <RingRoad dark={dark} />
      <Water x={FOUNTAIN.x} y={0.3} z={FOUNTAIN.z} r={FOUNTAIN.r - 0.15} calm />
      <BoxInstances items={[{ p: [FOUNTAIN.x, 0.15, FOUNTAIN.z], s: [FOUNTAIN.r * 2, 0.3, FOUNTAIN.r * 2], c: "#c9c3b8" }]} material={materials().stone} />
      <Box p={[FOUNTAIN.x, 0.9, FOUNTAIN.z]} s={[0.3, 1.5, 0.3]} c="#caf0f8" />
      <Grounds dark={dark} />
      <Greenhouse />
      <Tents />
      <Trees spots={TREES} />
      <Mountains dark={dark} />
      {PENS.map((p) => (
        <PenAnimals key={p.name} pen={p} />
      ))}
      <ElephantTrain />
      <SkyLift />
      <SwanBoats />
      <Cafe />
      <ParkDogs />
      <Signs />
    </group>
  );
}
