// The park cafe "카페 쉼터": the user's cafe building (models.js), a barista, two regulars who come in,
// order, sit and drink, a dog by the door, and this player's own order (cup on the counter, in hand,
// on the table). Everything here is in cafe-local coordinates (the group sits at CAFE in the park).
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { buildAnimal, buildBuilding } from "./models.js";
import Human from "../Human";
import { Sign, circle, type Collider } from "../parts";
import { CAFE, CAFE_SEATS, CAFE_TABLES, PARK, inCafe } from "../../shared/layout.js";
import { remoteTargets, seats, selfPos } from "../net";
import { SIP_MS, cafe, changed, type Near } from "./state";

/** The building is sunk so its floor is level with the lawn (players walk at y = 0). */
const FLOOR = -0.33;
/** Height of a seated body on a stool (see Human's sitting pose). */
export const SEAT_Y = 0.05;
const COUNTER_TOP = 1.41 + FLOOR;
const TABLE_TOP = 1.115 + FLOOR;
const PICKUP: [number, number] = [0, -1.15];
const DOOR = { x: 0, z: 2.4 };
const DOG = { x: -2.2, z: 3.7 };

/** Walls (door gap 1.6 m), counter, window boxes, tables and the dog, in park-local coordinates. */
export function cafeColliders(): Collider[] {
  const b = (x0: number, x1: number, z0: number, z1: number): Collider => ({ kind: "box", minX: CAFE.x + x0, maxX: CAFE.x + x1, minZ: CAFE.z + z0, maxZ: CAFE.z + z1 });
  return [
    b(-3.2, 3.2, -2.7, -2.3), // back
    b(-3.2, -2.8, -2.7, 2.5), // west
    b(2.8, 3.2, -2.7, 2.5), // east
    b(-3.2, -0.8, 2.3, 2.5), // front, left of the door
    b(0.8, 3.2, 2.3, 2.5), // front, right of the door
    b(-0.9, 2.8, -2.3, -0.95), // counter (and the barista's space behind it)
    b(-2.65, -1.15, 2.5, 2.85),
    b(1.15, 2.65, 2.5, 2.85), // window boxes
    ...CAFE_TABLES.map(([x, z]) => circle(CAFE.x + x, CAFE.z + z, 0.32)), // bodies may brush the table edge
    circle(CAFE.x + DOG.x, CAFE.z + DOG.z, 0.3),
  ];
}

const toLocal = (x: number, z: number) => ({ x: x - PARK.cx - CAFE.x, z: z - PARK.cz - CAFE.z });
const seatById = (id: string) => CAFE_SEATS.find((s) => s.id === id)!;
/** A spot just off a stool, away from its table (where you stand to sit down or after getting up). */
export function besideSeat(id: string) {
  const s = seatById(id);
  const [tx, tz] = CAFE_TABLES[s.table];
  const dx = s.x - tx;
  const dz = s.z - tz;
  const d = Math.hypot(dx, dz);
  return { x: s.x + (dx / d) * 0.5, z: s.z + (dz / d) * 0.5 };
}
/** Where a drink stands on the table in front of a stool. */
function onTable(id: string) {
  const s = seatById(id);
  const [tx, tz] = CAFE_TABLES[s.table];
  return { x: tx + (s.x - tx) * 0.45, z: tz + (s.z - tz) * 0.45 };
}
/** Stools nobody (player or regular) is using. */
const npcSeats = new Set<string>();
const taken = (id: string) => cafe.seat === id || [...seats.values()].includes(id) || npcSeats.has(id);

// ---------- the building ----------
function Building() {
  const root = useMemo(() => {
    const r = buildBuilding();
    // No real lamp light: one point light makes every surface in the park costlier to draw (slow
    // phones); the bulb still glows and the sun lights the room once the roof is hidden.
    const lamp = r.getObjectByName("Bld_LampLight");
    lamp?.removeFromParent();
    // move table 1 (and its stools) to CAFE_TABLES[1]
    for (const n of ["Bld_Table_1", "Bld_TableLeg_1", "Bld_Stool_1_0", "Bld_Stool_1_1"]) {
      const o = r.getObjectByName(n);
      if (o) o.position.add(new THREE.Vector3(CAFE_TABLES[1][0] - 1.4, 0, CAFE_TABLES[1][1] - 0.9));
    }
    r.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    return r;
  }, []);
  // Inside, the front wall and the roof would hide everyone: take them away (dollhouse view).
  const hide = useMemo(() => {
    const out: THREE.Object3D[] = [];
    root.traverse((o) => {
      if (o.name === "Bld_Front" || o.userData.roof) out.push(o);
    });
    return out;
  }, [root]);
  const door = useMemo(() => root.getObjectByName("Bld_DoorPivot")!, [root]);
  const sign = useRef<THREE.Group>(null);
  const open = useRef(0);
  useFrame((_, dt) => {
    const inside = inCafe(selfPos.x, selfPos.z);
    for (const o of hide) o.visible = !inside;
    if (sign.current) sign.current.visible = !inside;
    // the door opens by itself when someone comes near
    const near = (x: number, z: number) => {
      const l = toLocal(x, z);
      return Math.hypot(l.x - DOOR.x, l.z - DOOR.z) < 2.4;
    };
    let someone = near(selfPos.x, selfPos.z) || npcNearDoor.value;
    if (!someone) for (const t of remoteTargets.values()) if (near(t.x, t.z)) someone = true;
    open.current += ((someone ? 1 : 0) - open.current) * Math.min(1, dt * 4);
    door.rotation.y = (root.userData.doorOpenAngle as number) * open.current;
  });
  return (
    <>
      <primitive object={root} position-y={FLOOR} />
      <group ref={sign}>
        <Sign p={[0, 4.2 + FLOOR, 2.6]} size={[2.1, 0.34]} text={CAFE.name} bg="#f4ead2" fg="#7a4b2a" />
      </group>
    </>
  );
}

// ---------- a cup or a cookie ----------
function Treat({ kind, color }: { kind: "cup" | "cookie"; color: string }) {
  return kind === "cup" ? (
    <group>
      <mesh position-y={0.055} castShadow>
        <cylinderGeometry args={[0.045, 0.035, 0.11, 14]} />
        <meshStandardMaterial color="#f8f8f4" roughness={0.4} />
      </mesh>
      <mesh position-y={0.108}>
        <cylinderGeometry args={[0.042, 0.042, 0.006, 14]} />
        <meshStandardMaterial color={color} roughness={0.3} />
      </mesh>
      <mesh position={[0.05, 0.06, 0]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.022, 0.007, 6, 12]} />
        <meshStandardMaterial color="#f8f8f4" roughness={0.4} />
      </mesh>
    </group>
  ) : (
    <mesh position-y={0.012} castShadow>
      <cylinderGeometry args={[0.065, 0.065, 0.022, 16]} />
      <meshStandardMaterial color={color} roughness={0.8} />
    </mesh>
  );
}

/** This player's order: on the counter when ready, in hand, on the table, lifted for each sip. */
function MyOrder() {
  const g = useRef<THREE.Group>(null);
  const o = cafe.order;
  useFrame(() => {
    const grp = g.current;
    const ord = cafe.order;
    if (!grp) return;
    grp.visible = !!ord && ord.status !== "preparing";
    if (!ord || !grp.visible) return;
    if (ord.status === "ready") grp.position.set(PICKUP[0], COUNTER_TOP, PICKUP[1]);
    else if (ord.status === "held") {
      // in the right hand, at waist height in front of the body
      const l = toLocal(selfPos.x, selfPos.z);
      const s = Math.sin(selfPos.ry);
      const c = Math.cos(selfPos.ry);
      grp.position.set(l.x + s * 0.32 - c * 0.2, 0.95, l.z + c * 0.32 + s * 0.2);
    } else if (cafe.seat) {
      const t = onTable(cafe.seat);
      const st = seatById(cafe.seat);
      const left = cafe.sipUntil - performance.now();
      // a sip: up to the mouth, hold, back down
      const k = left > 0 ? Math.sin(Math.min(1, (SIP_MS - left) / SIP_MS) * Math.PI) : 0;
      const lift = Math.min(1, k * 1.6);
      grp.position.set(
        THREE.MathUtils.lerp(t.x, st.x + (t.x - st.x) * 0.35, lift),
        THREE.MathUtils.lerp(TABLE_TOP, SEAT_Y + 1.12, lift),
        THREE.MathUtils.lerp(t.z, st.z + (t.z - st.z) * 0.35, lift),
      );
    }
  });
  return <group ref={g}>{o && <Treat key={o.item.id + o.readyAt} kind={o.item.kind} color={o.item.color} />}</group>;
}

// ---------- the regulars ----------
type P2 = [number, number];
const DOOR_OUT: P2 = [0, 3.7];
const DOOR_IN: P2 = [0, 1.7];
const AISLE: P2 = [0, 0.35];
type Npc = {
  seed: string;
  color: string;
  home: P2;
  counter: P2;
  x: number;
  z: number;
  ry: number;
  state: "home" | "toCounter" | "ordering" | "toSeat" | "sitting" | "leaving";
  t: number;
  pts: P2[];
  seat: string | null;
  sipAt: number;
};
const npcNearDoor = { value: false };
/** Whether a regular is ordering right now (the barista works at the machine). */
const npcOrdering = { value: false };

function Regulars() {
  const npcs = useMemo<Npc[]>(
    () => [
      { seed: "민지", color: "#e76f9a", home: [-9, 8], counter: [-0.45, -0.5], x: -9, z: 8, ry: Math.PI, state: "home", t: 3, pts: [], seat: null, sipAt: 0 },
      { seed: "준호", color: "#3f7cc4", home: [8, 10], counter: [1.65, -0.5], x: 8, z: 10, ry: Math.PI, state: "home", t: 12, pts: [], seat: null, sipAt: 0 },
    ],
    [],
  );
  const groups = useRef<(THREE.Group | null)[]>([]);
  const cups = useRef<(THREE.Group | null)[]>([]);
  useEffect(() => () => npcSeats.clear(), []);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    let nearDoor = false;
    let ordering = false;
    npcs.forEach((n, i) => {
      const leave = () => {
        const back: P2[] = n.seat ? [Object.values(besideSeat(n.seat)) as P2] : [];
        if (n.seat) npcSeats.delete(n.seat);
        n.seat = null;
        n.pts = [...back, AISLE, DOOR_IN, DOOR_OUT, n.home];
        n.state = "leaving";
      };
      if (n.state === "home") {
        n.t -= dt;
        if (n.t <= 0) {
          const free = CAFE_SEATS.filter((s) => !taken(s.id));
          if (!free.length) n.t = 6;
          else {
            n.seat = free[Math.floor(Math.random() * free.length)].id;
            npcSeats.add(n.seat);
            n.pts = [DOOR_OUT, DOOR_IN, AISLE, n.counter];
            n.state = "toCounter";
          }
        }
      } else if (n.state === "ordering") {
        ordering = true;
        n.ry = Math.PI; // facing the counter (north)
        n.t -= dt;
        if (n.t <= 0) {
          if (n.seat && cafe.seat !== n.seat && ![...seats.values()].includes(n.seat)) {
            const b = besideSeat(n.seat);
            n.pts = [AISLE, [b.x, b.z]];
            n.state = "toSeat";
          } else leave();
        }
      } else if (n.state === "sitting") {
        // a player sat down here: make room
        if (!n.seat || cafe.seat === n.seat || [...seats.values()].includes(n.seat)) leave();
        else {
          n.t -= dt;
          if (n.t <= 0) leave();
        }
      }
      if (n.pts.length) {
        const [tx, tz] = n.pts[0];
        const dx = tx - n.x;
        const dz = tz - n.z;
        const d = Math.hypot(dx, dz);
        const step = 1.4 * dt;
        if (d <= step) {
          n.x = tx;
          n.z = tz;
          n.pts.shift();
          if (!n.pts.length) {
            if (n.state === "toCounter") {
              n.state = "ordering";
              n.t = 5;
            } else if (n.state === "toSeat" && n.seat) {
              const s = seatById(n.seat);
              n.x = s.x;
              n.z = s.z;
              n.ry = s.ry;
              n.state = "sitting";
              n.t = 16 + Math.random() * 8;
              n.sipAt = 2;
            } else if (n.state === "leaving") {
              n.state = "home";
              n.ry = Math.PI;
              n.t = 10 + Math.random() * 12;
            }
          }
        } else {
          n.x += (dx / d) * step;
          n.z += (dz / d) * step;
          const target = Math.atan2(dx, dz);
          n.ry += Math.atan2(Math.sin(target - n.ry), Math.cos(target - n.ry)) * Math.min(1, dt * 10);
        }
      }
      if (Math.hypot(n.x - DOOR.x, n.z - DOOR.z) < 2.4) nearDoor = true;
      const g = groups.current[i];
      if (g) {
        g.position.set(n.x, n.state === "sitting" ? SEAT_Y : 0, n.z);
        g.rotation.y = n.ry;
      }
      const cup = cups.current[i];
      if (cup) {
        cup.visible = n.state === "sitting" || n.state === "toSeat";
        if (n.state === "toSeat") {
          const s = Math.sin(n.ry);
          const c = Math.cos(n.ry);
          cup.position.set(n.x + s * 0.32 - c * 0.2, 0.95, n.z + c * 0.32 + s * 0.2);
        } else if (n.seat && n.state === "sitting") {
          n.sipAt -= dt;
          if (n.sipAt < -SIP_MS / 1000) n.sipAt = 3 + Math.random() * 3;
          const k = n.sipAt < 0 ? Math.min(1, Math.sin((-n.sipAt / (SIP_MS / 1000)) * Math.PI) * 1.6) : 0;
          const t = onTable(n.seat);
          const st = seatById(n.seat);
          cup.position.set(
            THREE.MathUtils.lerp(t.x, st.x + (t.x - st.x) * 0.35, k),
            THREE.MathUtils.lerp(TABLE_TOP, SEAT_Y + 1.12, k),
            THREE.MathUtils.lerp(t.z, st.z + (t.z - st.z) * 0.35, k),
          );
        }
      }
    });
    npcNearDoor.value = nearDoor;
    npcOrdering.value = ordering;
  });
  return (
    <>
      {npcs.map((n, i) => (
        <group key={n.seed}>
          <group ref={(el) => void (groups.current[i] = el)}>
            <Human color={n.color} seed={n.seed} riding={() => n.state === "sitting"} fallback={null} />
          </group>
          <group ref={(el) => void (cups.current[i] = el)} visible={false}>
            <Treat kind="cup" color={i ? "#3b2416" : "#c8a27a"} />
          </group>
        </group>
      ))}
    </>
  );
}

// ---------- barista and dog ----------
function Barista() {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const o = cafe.order;
    const x = o?.status === "preparing" || npcOrdering.value ? 1.5 : o?.status === "ready" ? PICKUP[0] : 0.6;
    if (g.current) g.current.position.x += (x - g.current.position.x) * Math.min(1, dt * 2.5);
  });
  return (
    <group ref={g} position={[0.6, 0, -1.95]}>
      <Human color="#f4f1ea" seed="barista" fallback={null} />
      {/* green apron */}
      <mesh position={[0, 0.98, 0.15]}>
        <boxGeometry args={[0.34, 0.56, 0.02]} />
        <meshStandardMaterial color="#2e8b6a" roughness={0.8} />
      </mesh>
    </group>
  );
}

function Dog() {
  const dog = useMemo(() => {
    const d = buildAnimal();
    d.traverse((o) => void ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true)));
    return d;
  }, []);
  const mixer = useMemo(() => new THREE.AnimationMixer(dog), [dog]);
  useEffect(() => {
    const clip = dog.animations.find((c) => c.name === "Sit");
    if (clip) mixer.clipAction(clip).play();
    return () => void mixer.stopAllAction();
  }, [dog, mixer]);
  useFrame((_, dt) => mixer.update(Math.min(dt, 0.1)));
  return <primitive object={dog} position={[DOG.x, 0, DOG.z]} rotation-y={0.5} />;
}

// ---------- what the player stands next to ----------
function Proximity() {
  useFrame(() => {
    const l = toLocal(selfPos.x, selfPos.z);
    let near: Near = null;
    if (!cafe.seat && inCafe(selfPos.x, selfPos.z)) {
      if (l.x > -1.1 && l.x < 2.3 && l.z < 0.5) near = "counter";
      else {
        let best = 1.2;
        for (const s of CAFE_SEATS) {
          const d = Math.hypot(l.x - s.x, l.z - s.z);
          if (d < best && !taken(s.id)) {
            best = d;
            near = { seat: s.id };
          }
        }
      }
    }
    const key = (n: Near) => (n === null ? "" : n === "counter" ? "c" : n.seat);
    let dirty = key(near) !== key(cafe.near);
    cafe.near = near;
    const o = cafe.order;
    if (o?.status === "preparing" && performance.now() >= o.readyAt) {
      o.status = "ready";
      cafe.msg = `${o.item.name} 나왔습니다! 카운터에서 받아 가세요.`;
      dirty = true;
    }
    if (o?.status === "held" && cafe.seat) {
      o.status = "placed";
      cafe.msg = o.item.kind === "cookie" ? "쿠키를 테이블에 놓았어요. 한 입 먹어 볼까요?" : "음료를 테이블에 놓았어요. 한 모금 마셔 볼까요?";
      dirty = true;
    } else if (o?.status === "placed" && !cafe.seat) {
      o.status = "held"; // got up: take it along
      dirty = true;
    }
    // walked away from the cafe: drop the last message
    if (cafe.msg && !cafe.seat && Math.hypot(l.x, l.z - 2) > 7 && (!o || o.status === "held")) {
      cafe.msg = "";
      cafe.menuOpen = false;
      dirty = true;
    }
    if (dirty) changed();
  });
  return null;
}

export default function Cafe() {
  return (
    <group position={[CAFE.x, 0, CAFE.z]}>
      <Building />
      <Barista />
      <Regulars />
      <Dog />
      <MyOrder />
      <Proximity />
    </group>
  );
}
