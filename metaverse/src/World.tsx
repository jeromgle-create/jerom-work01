import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { ZOOM_MAX, ZOOM_MIN, debugTeleport, input, labelEls, moveOrder, remoteTargets, rides, selfPos, serverNow, socket, view, type RideState } from "./net";
import { findPath } from "./pathfind";
import type { Player } from "./types";
import School, { resolveCollisions } from "./School";
import Interior, { resolveInterior } from "./Interior";
import Park, { RideVehicles, resolvePark } from "./Park";
import { RIDES, ZONE_RECTS, seatEndU, seatPose } from "../shared/layout.js";
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
  /** Click-to-move path (waypoints) and which click it belongs to. */
  const path = useRef<{ seq: number; pts: { x: number; z: number }[]; i: number } | null>(null);
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
    // Click / tap to move: plan a path when a new order arrives; keys or joystick cancel it.
    // Moving yourself (keys / joystick) brings a dragged camera back onto you.
    if (len0(mx, mz) > 0.05) view.recenter = true;
    if (len0(mx, mz) > 0.05 || riding.current) {
      if (path.current) {
        path.current = null;
        moveOrder.active = false;
      }
    } else if (moveOrder.active && path.current?.seq !== moveOrder.seq) {
      const pts = findPath({ x: pos.current.x, z: pos.current.z }, { x: moveOrder.x, z: moveOrder.z }, collide);
      path.current = pts ? { seq: moveOrder.seq, pts, i: 0 } : null;
      if (!pts) moveOrder.active = false;
    }
    if (path.current && !riding.current) {
      const p = path.current;
      let wp = p.pts[p.i];
      while (wp && Math.hypot(wp.x - pos.current.x, wp.z - pos.current.z) < 0.25) wp = p.pts[++p.i];
      if (!wp) {
        path.current = null;
        moveOrder.active = false; // arrived
      } else {
        const dx = wp.x - pos.current.x;
        const dz = wp.z - pos.current.z;
        const d = Math.hypot(dx, dz);
        mx = dx / d;
        mz = dz / d;
        // don't overshoot the last waypoint
        if (p.i === p.pts.length - 1 && d < SPEED * Math.min(dt, 0.1)) {
          const k = d / (SPEED * Math.min(dt, 0.1));
          mx *= k;
          mz *= k;
        }
      }
    }
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
    } else if (len > 0.001) {
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
    const debugJump = !!debugTeleport.pending;
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
      if (path.current && (z !== zone.current || debugJump)) {
        path.current = null; // went through a door / stairs: the old path is for another place
        moveOrder.active = false;
      }
      if (z !== zone.current) view.pan = { x: 0, z: 0 }; // new place: look at yourself again
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
    // Drag-to-pan: keep the looked-at point inside the current zone; ease back when recentering.
    const pan = view.pan;
    if (view.recenter && !view.dragging) {
      const k = Math.min(1, dt * 5);
      pan.x -= pan.x * k;
      pan.z -= pan.z * k;
      if (Math.hypot(pan.x, pan.z) < 0.05) {
        pan.x = pan.z = 0;
        view.recenter = false;
      }
    }
    const zr = ZONE_RECTS.find((r) => r.id === z) ?? ZONE_RECTS[0];
    pan.x = THREE.MathUtils.clamp(pan.x, zr.minX - pos.current.x, zr.maxX - pos.current.x);
    pan.z = THREE.MathUtils.clamp(pan.z, zr.minZ - pos.current.z, zr.maxZ - pos.current.z);
    const camTarget = pos.current.clone().addScaledVector(cam.offset, view.zoom); // pinch / wheel zoom
    camTarget.x += pan.x;
    camTarget.z += pan.z;
    if (view.dragging) camera.position.copy(camTarget); // follow the finger exactly while dragging
    else camera.position.lerp(camTarget, Math.min(1, dt * 5));
    camera.lookAt(pos.current.x + pan.x, pos.current.y + cam.lookY, pos.current.z + pan.z - cam.ahead);
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
const len0 = (x: number, z: number) => Math.hypot(x, z);

/** Ground point under the pointer (y = 0 plane). */
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raycaster = new THREE.Raycaster();

/**
 * Click (mouse) or short tap (touch) on the scene: walk there. Dragging with one finger / the mouse
 * pans the camera over the ground instead; multi-finger gestures (pinch zoom) do neither.
 */
function ClickToMove() {
  const el = useThree((s) => s.gl.domElement);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const down = new Map<number, { x: number; y: number; t: number }>();
    let multi = false;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      // e.timeStamp is when the touch happened, not when this handler ran (busy frames delay handlers)
      down.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp });
      if (down.size > 1) multi = true;
    };
    const onUp = (e: PointerEvent) => {
      const d = down.get(e.pointerId);
      down.delete(e.pointerId);
      const wasMulti = multi;
      if (down.size === 0) multi = false;
      if (!d || wasMulti) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10 || e.timeStamp - d.t > 500) return;
      const r = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(groundPlane, hit)) return;
      moveOrder.x = hit.x;
      moveOrder.z = hit.z;
      moveOrder.seq++;
      moveOrder.active = true;
    };
    const onCancel = (e: PointerEvent) => {
      down.delete(e.pointerId);
      if (down.size === 0) multi = false;
      if (down.size === 0) view.dragging = false;
    };
    // Drag to pan: move the camera so the ground point under the finger stays under the finger.
    const groundAt = (cx: number, cy: number, out: THREE.Vector3) => {
      const r = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      return raycaster.ray.intersectPlane(groundPlane, out);
    };
    const last = new Map<number, { x: number; y: number }>();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const onMove = (e: PointerEvent) => {
      const d = down.get(e.pointerId);
      if (!d || multi || down.size !== 1) return;
      if (!view.dragging && Math.hypot(e.clientX - d.x, e.clientY - d.y) <= 10) return;
      const prev = last.get(e.pointerId) ?? { x: d.x, y: d.y };
      last.set(e.pointerId, { x: e.clientX, y: e.clientY });
      view.dragging = true;
      view.recenter = false;
      if (groundAt(prev.x, prev.y, a) && groundAt(e.clientX, e.clientY, b)) {
        view.pan.x += a.x - b.x;
        view.pan.z += a.z - b.z;
      }
    };
    const onUpPan = (e: PointerEvent) => {
      last.delete(e.pointerId);
      if (down.size === 0) view.dragging = false;
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointerup", onUpPan);
    el.addEventListener("pointercancel", onCancel);
    el.addEventListener("pointermove", onMove);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointerup", onUpPan);
      el.removeEventListener("pointercancel", onCancel);
      el.removeEventListener("pointermove", onMove);
    };
  }, [el, camera]);
  return null;
}

/** Pulsing ring where the player was told to go. */
function MoveMarker() {
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const m = ring.current;
    if (!m) return;
    m.visible = moveOrder.active;
    if (!moveOrder.active) return;
    m.position.set(moveOrder.x, 0.05, moveOrder.z);
    const s = 1 + 0.15 * Math.sin(clock.elapsedTime * 6);
    m.scale.set(s, s, s);
  });
  return (
    <mesh ref={ring} rotation-x={-Math.PI / 2} visible={false}>
      <ringGeometry args={[0.35, 0.55, 32]} />
      <meshBasicMaterial color="#3bb273" transparent opacity={0.9} />
    </mesh>
  );
}

/** Push the fog back as the camera zooms out, so a far view stays clear instead of hazy. */
function FogFollowsZoom({ near, far }: { near: number; far: number }) {
  useFrame(({ scene }) => {
    const fog = scene.fog as THREE.Fog | null;
    if (!fog) return;
    const k = Math.max(1, view.zoom);
    fog.near = near * k;
    fog.far = far * k;
  });
  return null;
}

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
    <Canvas shadows camera={{ fov: 50, position: [0, 9, 11], far: 2500 }} dpr={[1, 2]} className="canvas">
      <color attach="background" args={[bg]} />
      <fog attach="fog" args={[bg, indoor ? 25 : 40, fogFar]} />
      <FogFollowsZoom near={indoor ? 25 : 40} far={fogFar} />
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
      <ClickToMove />
      <MoveMarker />
      {players
        .filter((p) => p.id !== selfId)
        .map((p) => (
          <RemotePlayer key={p.id} player={p} />
        ))}
    </Canvas>
  );
}
