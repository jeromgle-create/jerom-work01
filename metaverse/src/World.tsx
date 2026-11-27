import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { ZOOM_MAX, ZOOM_MIN, debugTeleport, input, labelEls, remoteTargets, rides, selfPos, serverNow, socket, view, type RideState } from "./net";
import type { Player } from "./types";
import School, { resolveCollisions } from "./School";
import Interior, { resolveInterior } from "./Interior";
import Park, { RideVehicles, resolvePark } from "./Park";
import { RIDES, seatEndU, seatPose } from "../shared/layout.js";
import { portalAt, zoneAt, type ZoneId } from "./zones";

const PORTAL_COOLDOWN_MS = 800;
// Outdoors: pulled back and aiming ahead so the building stays in view. Indoors: steep dollhouse view.
// Courtyard: the 남관 building stands between it and the usual camera, so look down from above.
const CAMERA = {
  outdoor: { offset: new THREE.Vector3(0, 10, 15), ahead: 5, lookY: 1.5 },
  courtyard: { offset: new THREE.Vector3(0, 17, 5.5), ahead: 0.5, lookY: 0.5 },
  indoor: { offset: new THREE.Vector3(0, 13, 8), ahead: 1, lookY: 0.5 },
};
const COURTYARD_Z = -8.6;
const camFor = (zone: ZoneId, z = 0) =>
  zone === "park" ? CAMERA.outdoor : zone !== "outdoor" ? CAMERA.indoor : z < COURTYARD_Z ? CAMERA.courtyard : CAMERA.outdoor;

function collide(pos: THREE.Vector3) {
  const zone = zoneAt(pos.x);
  if (zone === "outdoor") resolveCollisions(pos);
  else if (zone === "park") resolvePark(pos);
  else resolveInterior(zone, pos);
}

type Props = { selfId: string; selfStart: Player; players: Player[] };

const SPEED = 6;
const SEND_MS = 66;
const tmp = new THREE.Vector3();
/** Progress of a ride (0 while waiting at the station), or null once this rider's car has arrived. */
function rideProgress(r: RideState) {
  const u = (serverNow() - r.start) / RIDES[r.ride].duration;
  return u >= seatEndU(r.ride, r.seat) ? null : Math.max(0, u);
}

/** Place a player's DOM label above their head in screen space. */
function placeLabel(id: string, obj: THREE.Object3D, camera: THREE.Camera, w: number, h: number) {
  const el = labelEls.get(id);
  if (!el) return;
  tmp.set(obj.position.x, obj.position.y + 2.45, obj.position.z).project(camera);
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

function LocalPlayer({ start, onZone }: { start: Player; onZone: (z: ZoneId) => void }) {
  const group = useRef<THREE.Group>(null);
  const pos = useRef(new THREE.Vector3(start.x, 0, start.z));
  const ry = useRef(start.ry);
  const lastSent = useRef({ t: 0, x: NaN, z: NaN, ry: NaN });
  const camera = useThree((s) => s.camera);
  const zone = useRef<ZoneId>(zoneAt(start.x));
  const cooldownUntil = useRef(0);
  /** Current ride (train car / lift chair) and where to step off. */
  const riding = useRef<
    | (RideState & { land: { x: number; z: number; ry: number } })
    | { pending: true; land: { x: number; z: number; ry: number } }
    | null
  >(null);

  useEffect(() => {
    pos.current.set(start.x, 0, start.z);
    zone.current = zoneAt(start.x);
    onZone(zone.current);
    camera.position.copy(pos.current).add(camFor(zone.current, pos.current.z).offset);
  }, [start, camera, onZone]);

  useFrame(({ size }, dt) => {
    let jumped = false; // teleported this frame (portal, ride, test hook): cut the camera
    const k = input.keys;
    let mx = input.joy.x;
    let mz = input.joy.y;
    if (k.has("a") || k.has("arrowleft")) mx -= 1;
    if (k.has("d") || k.has("arrowright")) mx += 1;
    if (k.has("w") || k.has("arrowup")) mz -= 1;
    if (k.has("s") || k.has("arrowdown")) mz += 1;
    const len = Math.hypot(mx, mz);
    if (riding.current && "pending" in riding.current) {
      // Waiting for the server to assign a vehicle and seat (one round trip).
    } else if (riding.current) {
      // Seated: the vehicle waits for friends, then carries everyone; movement keys do nothing until arrival.
      const r = riding.current;
      const u = rideProgress(r);
      if (u === null) {
        pos.current.set(r.land.x, 0, r.land.z);
        ry.current = r.land.ry;
        riding.current = null;
        rides.delete(start.id);
        socket.emit("ride:end");
        cooldownUntil.current = performance.now() + PORTAL_COOLDOWN_MS;
      } else {
        const p = seatPose(r.ride, r.dir, u, r.seat);
        pos.current.set(p.x, p.y, p.z);
        ry.current = p.ry;
      }
    } else if (len > 0.05) {
      const s = Math.min(len, 1) / len;
      pos.current.x += mx * s * SPEED * Math.min(dt, 0.1);
      pos.current.z += mz * s * SPEED * Math.min(dt, 0.1);
      collide(pos.current);
      const target = Math.atan2(mx, mz);
      const diff = Math.atan2(Math.sin(target - ry.current), Math.cos(target - ry.current));
      ry.current += diff * Math.min(1, dt * 12);
      // Doors and stairs: stepping on a portal mat moves the player to its destination.
      const now = performance.now();
      const portal = now > cooldownUntil.current ? portalAt(pos.current.x, pos.current.z) : undefined;
      if (portal?.kind === "ride" && portal.ride !== undefined && portal.dir) {
        // Board: the server puts us in a vehicle waiting at this station (with friends) or opens a new one.
        const land = portal.to;
        riding.current = { pending: true, land };
        socket.emit("ride:start", { ride: portal.ride, dir: portal.dir }, (ack: ({ ok: true } & RideState) | { ok: false }) => {
          if (!riding.current) return;
          if (ack?.ok) {
            const r: RideState = { ride: ack.ride, dir: ack.dir, start: ack.start, vehicle: ack.vehicle, seat: ack.seat };
            // step off side by side instead of on top of each other
            const off = { x: (ack.seat % 2 ? 0.9 : -0.9), z: Math.floor(ack.seat / 2) * 1.1 };
            riding.current = { ...r, land: { ...land, x: land.x + off.x, z: land.z + off.z } };
            rides.set(start.id, r);
          } else riding.current = null; // refused (e.g. already riding): stay at the station
        });
        cooldownUntil.current = now + RIDES[portal.ride].duration;
      } else if (portal) {
        cooldownUntil.current = now + PORTAL_COOLDOWN_MS;
        pos.current.set(portal.to.x, 0, portal.to.z);
        ry.current = portal.to.ry;
        lastSent.current.t = 0; // send the new position right away
        jumped = true;
      }
    }
    if (debugTeleport.pending) {
      pos.current.set(debugTeleport.pending.x, 0, debugTeleport.pending.z);
      collide(pos.current);
      debugTeleport.pending = null;
      lastSent.current.t = 0;
      jumped = true;
    }
    const z = zoneAt(pos.current.x);
    const cam = camFor(z, pos.current.z);
    if (z !== zone.current || jumped) {
      if (z !== zone.current) onZone(z);
      zone.current = z;
      camera.position.copy(pos.current).addScaledVector(cam.offset, view.zoom); // cut, don't fly across the map
    }
    selfPos.x = pos.current.x;
    selfPos.z = pos.current.z;
    selfPos.y = pos.current.y;
    selfPos.ry = ry.current;
    const g = group.current;
    if (g) {
      g.position.copy(pos.current);
      g.rotation.y = ry.current;
    }
    const camTarget = pos.current.clone().addScaledVector(cam.offset, view.zoom); // pinch / wheel zoom
    camera.position.lerp(camTarget, Math.min(1, dt * 5));
    camera.lookAt(pos.current.x, pos.current.y + cam.lookY, pos.current.z - cam.ahead);
    if (g) placeLabel(start.id, g, camera, size.width, size.height);

    const now = performance.now();
    const ls = lastSent.current;
    if (
      now - ls.t > SEND_MS &&
      (ls.t === 0 ||
        Math.abs(ls.x - pos.current.x) > 0.01 ||
        Math.abs(ls.z - pos.current.z) > 0.01 ||
        Math.abs(ls.ry - ry.current) > 0.02 ||
        Number.isNaN(ls.x))
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

/** Two-finger pinch (touch) and mouse wheel change the camera distance. */
function ZoomControls() {
  const el = useThree((s) => s.gl.domElement);
  useEffect(() => {
    const clamp = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
    let startDist = 0;
    let startZoom = 1;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        startDist = dist(e.touches);
        startZoom = view.zoom;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !startDist) return;
      e.preventDefault();
      view.zoom = clamp(startZoom * (startDist / dist(e.touches))); // fingers apart = closer
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) startDist = 0;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      view.zoom = clamp(view.zoom * Math.pow(1.0015, e.deltaY));
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      el.removeEventListener("wheel", onWheel);
    };
  }, [el]);
  return null;
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
    const r = rides.get(player.id);
    const u = r ? rideProgress(r) : null;
    if (r && u !== null) {
      // Riding: pose comes from the shared path, the seat and the server's departure time (height included).
      const p = seatPose(r.ride, r.dir, u, r.seat);
      g.position.set(p.x, p.y, p.z);
      g.rotation.y = p.ry;
      placeLabel(player.id, g, camera, size.width, size.height);
      return;
    }
    g.position.y = 0;
    const a = Math.min(1, dt * 10);
    if (Math.hypot(t.x - g.position.x, t.z - g.position.z) > 8) {
      g.position.set(t.x, 0, t.z); // went through a door or stairs: snap instead of gliding across the map
    } else {
      g.position.x += (t.x - g.position.x) * a;
      g.position.z += (t.z - g.position.z) * a;
    }
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

export default function World({ selfId, selfStart, players }: Props) {
  const dark = useDark();
  const [zone, setZone] = useState<ZoneId>("outdoor");
  const indoor = zone !== "outdoor" && zone !== "park";
  const bg = indoor ? (dark ? "#1b1d22" : "#3a3f47") : dark ? "#141a24" : "#cfe8ff";
  const fogFar = indoor ? 60 : 130; // outdoors: let the mountains show through the haze

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
      <color attach="background" args={[bg]} />
      <fog attach="fog" args={[bg, indoor ? 25 : 40, fogFar]} />
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
      {zone === "park" ? <Park dark={dark} /> : indoor ? <Interior zone={zone} dark={dark} /> : <School dark={dark} />}
      <LocalPlayer start={selfStart} onZone={setZone} />
      <RideVehicles />
      <ZoomControls />
      {players
        .filter((p) => p.id !== selfId)
        .map((p) => (
          <RemotePlayer key={p.id} player={p} />
        ))}
    </Canvas>
  );
}
