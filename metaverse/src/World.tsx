import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { input, labelEls, remoteTargets, selfPos, socket } from "./net";
import { WORLD_HALF, type Player } from "./types";

type Props = { selfId: string; selfStart: Player; players: Player[] };

const SPEED = 6;
const SEND_MS = 66;
const PLAYER_R = 0.45;

// Deterministic scenery so everyone sees the same world.
function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}
type Obstacle = { kind: "tree" | "block"; x: number; z: number; r: number; h: number; color: string };
const OBSTACLES: Obstacle[] = (() => {
  const rnd = seeded(42);
  const out: Obstacle[] = [];
  const palette = ["#e8d7c3", "#c9d6e8", "#e8c9c9", "#d1e8c9"];
  while (out.length < 34) {
    const x = (rnd() - 0.5) * WORLD_HALF * 1.8;
    const z = (rnd() - 0.5) * WORLD_HALF * 1.8;
    if (Math.hypot(x, z) < 7) continue; // keep the plaza open
    const tree = out.length % 3 !== 0;
    const r = tree ? 0.6 : 1.4 + rnd() * 0.8;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r + 1)) continue;
    out.push({
      kind: tree ? "tree" : "block",
      x,
      z,
      r,
      h: tree ? 2 + rnd() * 1.5 : 1.5 + rnd() * 3,
      color: tree ? "#3f9b5a" : palette[out.length % palette.length],
    });
  }
  return out;
})();

const FOUNTAIN = { x: 0, z: 0, r: 1.4 };

function resolveCollisions(pos: THREE.Vector3) {
  for (const o of [FOUNTAIN, ...OBSTACLES]) {
    const dx = pos.x - o.x;
    const dz = pos.z - o.z;
    const d = Math.hypot(dx, dz);
    const min = o.r + PLAYER_R;
    if (d < min && d > 1e-4) {
      pos.x = o.x + (dx / d) * min;
      pos.z = o.z + (dz / d) * min;
    }
  }
  pos.x = THREE.MathUtils.clamp(pos.x, -WORLD_HALF, WORLD_HALF);
  pos.z = THREE.MathUtils.clamp(pos.z, -WORLD_HALF, WORLD_HALF);
}

const tmp = new THREE.Vector3();
/** Place a player's DOM label above their head in screen space. */
function placeLabel(id: string, obj: THREE.Object3D, camera: THREE.Camera, w: number, h: number) {
  const el = labelEls.get(id);
  if (!el) return;
  tmp.set(obj.position.x, 2.45, obj.position.z).project(camera);
  if (tmp.z > 1 || Math.abs(tmp.x) > 1.2 || Math.abs(tmp.y) > 1.2) {
    el.style.visibility = "hidden";
    return;
  }
  el.style.visibility = "visible";
  el.style.transform = `translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px) translate(-50%, -100%)`;
}

function useDark() {
  const [dark, setDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => setDark(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return dark;
}

function Avatar({ color }: { color: string }) {
  return (
    <>
      <mesh position={[0, 0.75, 0]} castShadow>
        <capsuleGeometry args={[0.4, 0.7, 6, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 1.75, 0]} castShadow>
        <sphereGeometry args={[0.32, 20, 16]} />
        <meshStandardMaterial color="#ffe2c4" />
      </mesh>
      {/* eyes mark the facing direction (+z) */}
      <mesh position={[0.11, 1.8, 0.28]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshBasicMaterial color="#222" />
      </mesh>
      <mesh position={[-0.11, 1.8, 0.28]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshBasicMaterial color="#222" />
      </mesh>
    </>
  );
}

function LocalPlayer({ start }: { start: Player }) {
  const group = useRef<THREE.Group>(null);
  const pos = useRef(new THREE.Vector3(start.x, 0, start.z));
  const ry = useRef(start.ry);
  const lastSent = useRef({ t: 0, x: NaN, z: NaN, ry: NaN });
  const camera = useThree((s) => s.camera);
  const camOffset = useMemo(() => new THREE.Vector3(0, 9, 11), []);

  useEffect(() => {
    pos.current.set(start.x, 0, start.z);
    camera.position.copy(pos.current).add(camOffset);
  }, [start, camera, camOffset]);

  useFrame(({ size }, dt) => {
    const k = input.keys;
    let mx = input.joy.x;
    let mz = input.joy.y;
    if (k.has("a") || k.has("arrowleft")) mx -= 1;
    if (k.has("d") || k.has("arrowright")) mx += 1;
    if (k.has("w") || k.has("arrowup")) mz -= 1;
    if (k.has("s") || k.has("arrowdown")) mz += 1;
    const len = Math.hypot(mx, mz);
    if (len > 0.05) {
      const s = Math.min(len, 1) / len;
      pos.current.x += mx * s * SPEED * Math.min(dt, 0.1);
      pos.current.z += mz * s * SPEED * Math.min(dt, 0.1);
      resolveCollisions(pos.current);
      const target = Math.atan2(mx, mz);
      const diff = Math.atan2(Math.sin(target - ry.current), Math.cos(target - ry.current));
      ry.current += diff * Math.min(1, dt * 12);
    }
    selfPos.x = pos.current.x;
    selfPos.z = pos.current.z;
    const g = group.current;
    if (g) {
      g.position.copy(pos.current);
      g.rotation.y = ry.current;
    }
    const camTarget = pos.current.clone().add(camOffset);
    camera.position.lerp(camTarget, Math.min(1, dt * 5));
    camera.lookAt(pos.current.x, 1, pos.current.z);
    if (g) placeLabel(start.id, g, camera, size.width, size.height);

    const now = performance.now();
    const ls = lastSent.current;
    if (
      now - ls.t > SEND_MS &&
      (Math.abs(ls.x - pos.current.x) > 0.01 || Math.abs(ls.z - pos.current.z) > 0.01 || Math.abs(ls.ry - ry.current) > 0.02 || Number.isNaN(ls.x))
    ) {
      socket.emit("move", { x: pos.current.x, z: pos.current.z, ry: ry.current });
      lastSent.current = { t: now, x: pos.current.x, z: pos.current.z, ry: ry.current };
    }
  });

  return (
    <group ref={group}>
      <Avatar color={start.color} />
    </group>
  );
}

function RemotePlayer({ player }: { player: Player }) {
  const group = useRef<THREE.Group>(null);
  useEffect(() => {
    group.current?.position.set(player.x, 0, player.z);
  }, [player]);
  useFrame(({ camera, size }, dt) => {
    const t = remoteTargets.get(player.id);
    const g = group.current;
    if (!t || !g) return;
    const a = Math.min(1, dt * 10);
    g.position.x += (t.x - g.position.x) * a;
    g.position.z += (t.z - g.position.z) * a;
    const diff = Math.atan2(Math.sin(t.ry - g.rotation.y), Math.cos(t.ry - g.rotation.y));
    g.rotation.y += diff * a;
    placeLabel(player.id, g, camera, size.width, size.height);
  });
  return (
    <group ref={group}>
      <Avatar color={player.color} />
    </group>
  );
}

function Scenery({ dark }: { dark: boolean }) {
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[WORLD_HALF * 2 + 4, WORLD_HALF * 2 + 4]} />
        <meshStandardMaterial color={dark ? "#2c3a2f" : "#a9d18e"} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0]} receiveShadow>
        <circleGeometry args={[6, 48]} />
        <meshStandardMaterial color={dark ? "#4a4f57" : "#e7e1d6"} />
      </mesh>
      <mesh position={[0, 0.4, 0]} castShadow>
        <cylinderGeometry args={[1.2, 1.4, 0.8, 32]} />
        <meshStandardMaterial color={dark ? "#6b7380" : "#bfc6cf"} />
      </mesh>
      <mesh position={[0, 0.82, 0]}>
        <cylinderGeometry args={[1, 1, 0.05, 32]} />
        <meshStandardMaterial color="#5ab0ff" />
      </mesh>
      {OBSTACLES.map((o, i) =>
        o.kind === "tree" ? (
          <group key={i} position={[o.x, 0, o.z]}>
            <mesh position={[0, 0.5, 0]} castShadow>
              <cylinderGeometry args={[0.15, 0.2, 1, 8]} />
              <meshStandardMaterial color="#7a5232" />
            </mesh>
            <mesh position={[0, 1 + o.h / 2, 0]} castShadow>
              <coneGeometry args={[o.r + 0.2, o.h, 10]} />
              <meshStandardMaterial color={o.color} />
            </mesh>
          </group>
        ) : (
          <mesh key={i} position={[o.x, o.h / 2, o.z]} castShadow receiveShadow>
            <boxGeometry args={[o.r * 1.4, o.h, o.r * 1.4]} />
            <meshStandardMaterial color={o.color} />
          </mesh>
        ),
      )}
    </>
  );
}

export default function World({ selfId, selfStart, players }: Props) {
  const dark = useDark();

  useEffect(() => {
    const typing = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
    };
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return;
      input.keys.add(e.key.toLowerCase());
    };
    const up = (e: KeyboardEvent) => input.keys.delete(e.key.toLowerCase());
    const clear = () => input.keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, []);

  return (
    <Canvas shadows camera={{ fov: 50, position: [0, 9, 11] }} dpr={[1, 2]} className="canvas">
      <color attach="background" args={[dark ? "#141a24" : "#cfe8ff"]} />
      <fog attach="fog" args={[dark ? "#141a24" : "#cfe8ff", 25, 60]} />
      <hemisphereLight args={[dark ? "#8090b0" : "#ffffff", dark ? "#202820" : "#88aa77", dark ? 0.6 : 0.9]} />
      <directionalLight
        position={[12, 20, 8]}
        intensity={dark ? 0.7 : 1.4}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
      />
      <Scenery dark={dark} />
      <LocalPlayer start={selfStart} />
      {players
        .filter((p) => p.id !== selfId)
        .map((p) => (
          <RemotePlayer key={p.id} player={p} />
        ))}
    </Canvas>
  );
}
