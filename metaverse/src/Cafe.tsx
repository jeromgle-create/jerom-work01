// Lawn cafe (잔디광장 카페) in the park: a small cafe building (from the metaverse-cafe kit), an
// outdoor counter with a barista, a terrace with three tables, the regular customers (cafeNpcs.ts)
// and every guest's drink. Rendered inside the Park group, so everything is in park-local coords.
// Who ordered what and who sits where comes from the server (net.ts `cafe`).
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { buildBuilding } from "./cafe/models.js";
import { CAFE, CAFE_MENU, CAFE_SEATS, PARK, cafeTableSpot } from "../shared/layout.js";
import { box, circle, Box, Sign, type Collider } from "./parts";
import { cafe, labelEls, remoteTargets, sayBubble, selfPos, serverNow, socket } from "./net";
import { placeLabel } from "./labels";
import Human from "./Human";
import { NPCS, npcAt, type NpcPhase } from "./cafeNpcs";

/** Height of a seated guest's group (Human lowers a seated body by 0.5 m). */
export const CAFE_SEAT_Y = 0.06;
const TABLE_TOP = 0.76;

/** Things guests can't walk through (park-local). The barista's corner is closed off with the counter. */
export const CAFE_COLLIDERS: Collider[] = [
  box(CAFE.building.x, CAFE.building.z, CAFE.building.w, CAFE.building.d),
  box(CAFE.counter.x, (CAFE.building.z + CAFE.building.d / 2 + CAFE.counter.z + CAFE.counter.d / 2) / 2, CAFE.counter.w + 0.4, CAFE.counter.z + CAFE.counter.d / 2 - (CAFE.building.z + CAFE.building.d / 2)),
  ...CAFE.tables.map((t) => circle(t.x, t.z, 0.5)),
];

const cupMats = new Map<string, THREE.MeshStandardMaterial>();
const mat = (c: string) => {
  let m = cupMats.get(c);
  if (!m) cupMats.set(c, (m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 })));
  return m;
};
const CUP = new THREE.CylinderGeometry(0.05, 0.04, 0.13, 10);
const LID = new THREE.CylinderGeometry(0.047, 0.047, 0.008, 10);
const PLATE = new THREE.CylinderGeometry(0.1, 0.09, 0.015, 12);
const COOKIE = new THREE.CylinderGeometry(0.065, 0.065, 0.02, 10);

/** A cup (or a cookie on a plate) of menu item `item`; `left` sips remaining of `sips`. */
export function Drink({ item, left = 9, group }: { item: number; left?: number; group?: React.Ref<THREE.Group> }) {
  const m = CAFE_MENU[item];
  const fill = Math.max(0, Math.min(1, left / m.sips));
  return (
    <group ref={group}>
      {m.food ? (
        <>
          <mesh geometry={PLATE} material={mat("#ffffff")} position={[0, 0.008, 0]} castShadow />
          {fill > 0 && <mesh geometry={COOKIE} material={mat(m.color)} position={[0, 0.025, 0]} scale={[fill, 1, fill]} castShadow />}
        </>
      ) : (
        <>
          <mesh geometry={CUP} material={mat("#ffffff")} position={[0, 0.065, 0]} castShadow />
          <mesh geometry={CUP} material={mat("#2e8b6a")} position={[0, 0.06, 0]} scale={[1.03, 0.35, 1.03]} />
          {fill > 0 && <mesh geometry={LID} material={mat(m.color)} position={[0, 0.02 + 0.105 * fill, 0]} />}
        </>
      )}
    </group>
  );
}

function Terrace() {
  const items = useMemo(() => {
    const out: { p: [number, number, number]; s: [number, number, number]; c: string }[] = [];
    // wooden deck under the tables
    out.push({ p: [60, 0.03, 45.2], s: [10.5, 0.06, 7], c: "#c8a27a" });
    for (const t of CAFE.tables) {
      out.push({ p: [t.x, TABLE_TOP - 0.025, t.z], s: [0.9, 0.05, 0.9], c: "#f1ece3" });
      out.push({ p: [t.x, (TABLE_TOP - 0.05) / 2, t.z], s: [0.1, TABLE_TOP - 0.05, 0.1], c: "#6c757d" });
    }
    for (const s of CAFE_SEATS) out.push({ p: [s.x, CAFE.stoolTop / 2, s.z], s: [0.36, CAFE.stoolTop, 0.36], c: s.npc ? "#e09f3e" : "#2e8b6a" });
    // counter with a stone top, coffee machine and a cup stack
    const c = CAFE.counter;
    out.push({ p: [c.x, c.h / 2, c.z], s: [c.w, c.h, c.d], c: "#8b5a33" });
    out.push({ p: [c.x, c.h + 0.03, c.z], s: [c.w + 0.1, 0.06, c.d + 0.1], c: "#e4dcd0" });
    out.push({ p: [c.x + 1.0, c.h + 0.3, c.z - 0.15], s: [0.5, 0.5, 0.4], c: "#7d8597" });
    out.push({ p: [c.x - 1.1, c.h + 0.18, c.z - 0.1], s: [0.35, 0.25, 0.3], c: "#2b2f33" });
    // parasols over the guest tables
    return out;
  }, []);
  return (
    <>
      {items.map((it, i) => (
        <Box key={i} p={it.p} s={it.s} c={it.c} />
      ))}
      {CAFE.tables.filter((t) => !t.npc).map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]}>
          <mesh position={[0, 1.2, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 2.4, 6]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
          <mesh position={[0, 2.35, 0]} castShadow>
            <coneGeometry args={[1.3, 0.5, 8, 1, true]} />
            <meshStandardMaterial color={i ? "#e76f51" : "#2a9d8f"} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
      <Sign p={[CAFE.counter.x, 2.25, CAFE.counter.z + CAFE.counter.d / 2 + 0.02]} size={[2.6, 0.5]} text={`${CAFE.name} · 주문은 여기서`} bg="#2e8b6a" fg="#ffffff" />
      <Sign p={[CAFE.tables[2].x, 1.05, CAFE.tables[2].z - 0.46]} size={[0.8, 0.22]} text="예약석" bg="#fff3b0" fg="#7a4b00" />
    </>
  );
}

function Building() {
  const obj = useMemo(() => {
    const b = buildBuilding();
    const lights: THREE.Object3D[] = [];
    b.traverse((o) => {
      if ((o as THREE.Light).isLight) lights.push(o);
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    lights.forEach((l) => l.removeFromParent()); // no extra point light: the park is lit by the sun
    return b;
  }, []);
  return <primitive object={obj} position={[CAFE.building.x, 0, CAFE.building.z]} />;
}

/** The barista: faces the guests, turns to the machine while someone's order is being made. */
function Barista() {
  const g = useRef<THREE.Group>(null);
  const { camera, size } = useThree();
  const said = useRef(new Set<string>());
  useFrame((_, dt) => {
    const o = g.current;
    if (!o) return;
    const now = serverNow();
    let busy = false;
    for (const [id, c] of cafe) {
      const ord = c.order;
      if (!ord || ord.stage !== "making") continue;
      if (now < ord.readyAt) busy = true;
      else if (id === socket.id && !said.current.has(`${id}:${ord.readyAt}`)) {
        said.current.add(`${id}:${ord.readyAt}`);
        sayBubble("npc:barista", `주문하신 ${CAFE_MENU[ord.item].name} 나왔습니다!`);
      }
    }
    for (let i = 0; i < NPCS.length; i++) if (npcAt(i, now).phase === "order") busy = true;
    const target = busy ? Math.PI * 0.75 : 0; // turn towards the coffee machine (east side)
    const d = Math.atan2(Math.sin(target - o.rotation.y), Math.cos(target - o.rotation.y));
    o.rotation.y += d * Math.min(1, dt * 5);
    placeLabel("npc:barista", o, camera, size.width, size.height);
  });
  return (
    <group ref={g} position={[CAFE.barista.x, 0, CAFE.barista.z]}>
      <Human color="#f4f1ea" seed="barista" fallback={null} />
      {/* green apron */}
      <mesh position={[0, 1.0, 0.16]}>
        <boxGeometry args={[0.36, 0.55, 0.02]} />
        <meshStandardMaterial color="#2e8b6a" />
      </mesh>
    </group>
  );
}

/** One regular customer, posed from the shared schedule. */
function Npc({ i }: { i: number }) {
  const g = useRef<THREE.Group>(null);
  const cup = useRef<THREE.Group>(null);
  const tableCup = useRef<THREE.Group>(null);
  const seated = useRef(false);
  const lastPhase = useRef<{ phase: NpcPhase; start: number } | null>(null);
  // item / sips left change a few times per visit: keep them in state so the drink re-renders
  const [drink, setDrink] = useState(() => {
    const p = npcAt(i, serverNow());
    return { item: p.item, left: p.left };
  });
  const { camera, size } = useThree();
  useFrame(() => {
    const o = g.current;
    if (!o) return;
    const now = serverNow();
    const p = npcAt(i, now);
    o.visible = p.visible;
    o.position.set(p.x, p.seated ? CAFE_SEAT_Y : 0, p.z);
    o.rotation.y = p.ry;
    seated.current = p.seated;
    if (p.item !== drink.item || p.left !== drink.left) setDrink({ item: p.item, left: p.left });
    if (cup.current) cup.current.visible = p.visible && p.cup === "hand";
    const tc = tableCup.current;
    if (tc) {
      tc.visible = p.cup === "table";
      placeSip(tc, p.seat, p.sip);
    }
    // a bubble when a phase starts (each client fires it from the same schedule)
    const lp = lastPhase.current;
    if (lp && (lp.phase !== p.phase || lp.start !== p.phaseStart) && now - p.phaseStart < 3000) {
      const name = CAFE_MENU[p.item].name;
      if (p.phase === "order") sayBubble(`npc:${i}`, `${name} 하나 주세요!`, 3000);
      if (p.phase === "toSeat") sayBubble("npc:barista", `${NPCS[i].name}님, ${name} 나왔습니다!`, 3000);
      if (p.phase === "out") sayBubble(`npc:${i}`, "잘 마셨습니다!", 2500);
    }
    lastPhase.current = { phase: p.phase, start: p.phaseStart };
    placeLabel(`npc:${i}`, o, camera, size.width, size.height, p.seated ? 1.95 : 2.45);
  });
  return (
    <>
      <group ref={g}>
        <Human color={NPCS[i].color} seed={`npc-${NPCS[i].name}`} riding={() => seated.current} fallback={null} />
        <group ref={cup} position={[-0.3, 0.92, 0.18]}>
          <Drink item={drink.item} />
        </group>
      </group>
      <Drink item={drink.item} left={drink.left} group={tableCup} />
    </>
  );
}

/** Put a drink on the table in front of seat `seat`; sip 0..1 lifts it to the guest's mouth and back. */
function placeSip(o: THREE.Object3D, seat: number, sip: number) {
  const spot = cafeTableSpot(seat);
  const s = CAFE_SEATS[seat];
  const mouth = { x: s.x + Math.sin(s.ry) * 0.22, z: s.z + Math.cos(s.ry) * 0.22, y: CAFE_SEAT_Y + 1.12 };
  o.position.set(spot.x + (mouth.x - spot.x) * sip, TABLE_TOP + (mouth.y - TABLE_TOP) * sip, spot.z + (mouth.z - spot.z) * sip);
  o.rotation.set(0, 0, -0.9 * sip * Math.sign(Math.sin(s.ry))); // tip it towards the face
}

type DrinkRow = { id: string; item: number; left: number };
/** Guests' drinks: in the hand while carried, on the table in front of their stool once seated. */
function GuestDrinks() {
  const [rows, setRows] = useState<DrinkRow[]>([]);
  const sig = useRef("");
  const groups = useRef(new Map<string, THREE.Group>());
  useFrame(() => {
    const now = serverNow();
    const list: DrinkRow[] = [];
    for (const [id, c] of cafe) if (c.order && (c.order.stage === "held" || c.order.stage === "placed")) list.push({ id, item: c.order.item, left: c.order.left });
    const k = list.map((r) => `${r.id}:${r.item}:${r.left}`).join("|");
    if (k !== sig.current) {
      sig.current = k;
      setRows(list);
    }
    for (const [id, gr] of groups.current) {
      const ord = cafe.get(id)?.order;
      if (!ord) continue;
      if (ord.stage === "held") {
        // carried: right hand height, slightly in front of the guest
        const t = id === socket.id ? selfPos : remoteTargets.get(id);
        if (!t) continue;
        const ry = t.ry, lx = -0.3, lz = 0.18;
        gr.position.set(t.x - PARK.cx + Math.cos(ry) * lx + Math.sin(ry) * lz, 0.92, t.z - Math.sin(ry) * lx + Math.cos(ry) * lz);
        gr.rotation.set(0, ry, 0);
      } else if (ord.seat !== null) {
        const sip = ord.sipUntil > now ? Math.sin(((SIP_MS - (ord.sipUntil - now)) / SIP_MS) * Math.PI) : 0;
        placeSip(gr, ord.seat, Math.max(0, sip));
      }
    }
  });
  return (
    <>
      {rows.map((r) => (
        <group key={r.id} ref={(el) => void (el ? groups.current.set(r.id, el) : groups.current.delete(r.id))}>
          <Drink item={r.item} left={r.left} />
        </group>
      ))}
    </>
  );
}
const SIP_MS = 2200; // same as the server

export default function Cafe() {
  // Leaving the park unmounts the cafe: hide its name tags (they are only placed while rendered).
  useEffect(
    () => () => {
      for (const id of ["npc:barista", ...NPCS.map((_, i) => `npc:${i}`)]) {
        const el = labelEls.get(id);
        if (el) el.style.visibility = "hidden";
      }
    },
    [],
  );
  return (
    <>
      <Building />
      <Terrace />
      <Barista />
      {NPCS.map((_, i) => (
        <Npc key={i} i={i} />
      ))}
      <GuestDrinks />
    </>
  );
}
