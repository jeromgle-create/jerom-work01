// Shared building blocks: primitive meshes, instanced boxes, text signs and 2D collisions.
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

export const PLAYER_R = 0.45;
export type V3 = [number, number, number];

// ---------- collisions ----------
export type Collider =
  | { kind: "circle"; x: number; z: number; r: number }
  | { kind: "box"; minX: number; maxX: number; minZ: number; maxZ: number };
export const box = (cx: number, cz: number, w: number, d: number): Collider => ({
  kind: "box",
  minX: cx - w / 2,
  maxX: cx + w / 2,
  minZ: cz - d / 2,
  maxZ: cz + d / 2,
});
export const circle = (x: number, z: number, r: number): Collider => ({ kind: "circle", x, z, r });

function insideAny(colliders: Collider[], x: number, z: number) {
  return colliders.some((c) =>
    c.kind === "circle" ? Math.hypot(x - c.x, z - c.z) < c.r + PLAYER_R - 1e-3 : x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ,
  );
}

/** Push a player (circle of PLAYER_R) out of every collider. */
export function pushOut(pos: THREE.Vector3, colliders: Collider[]) {
  for (const c of colliders) {
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
      // Center ended up inside the box (teleport, spawn): push out through the nearest side that
      // doesn't land inside another collider. Where two boxes touch (a seam between buildings),
      // the nearest side alone would bounce the player straight into the neighbour.
      const pushes = [
        [c.minX - PLAYER_R - pos.x, 0],
        [c.maxX + PLAYER_R - pos.x, 0],
        [0, c.minZ - PLAYER_R - pos.z],
        [0, c.maxZ + PLAYER_R - pos.z],
      ];
      pushes.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
      const ok = pushes.find(([dx, dz]) => !insideAny(colliders, pos.x + dx, pos.z + dz)) ?? pushes[0];
      pos.x += ok[0];
      pos.z += ok[1];
    }
  }
}

// ---------- meshes ----------

export function Box({ p, s, c, shadow = true }: { p: V3; s: V3; c: string; shadow?: boolean }) {
  return (
    <mesh position={p} castShadow={shadow} receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} />
    </mesh>
  );
}

/** Many identical boxes in one draw call. Each item: position + optional per-item size and color. */
export function BoxInstances({ items, shadow = true }: { items: { p: V3; s: V3; c: string }[]; shadow?: boolean }) {
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

export function Pole({ p, h, r = 0.06, c = "#9aa3ad" }: { p: [number, number]; h: number; r?: number; c?: string }) {
  return (
    <mesh position={[p[0], h / 2, p[1]]} castShadow>
      <cylinderGeometry args={[r, r, h, 10]} />
      <meshStandardMaterial color={c} metalness={0.3} roughness={0.5} />
    </mesh>
  );
}

export function useTextTexture(text: string, bg: string, fg: string, w = 1024, h = 256) {
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

export type SignProps = { p: V3; size: [number, number]; text: string; bg: string; fg: string; ry?: number };
export function Sign({ p, size, text, bg, fg, ry = 0 }: SignProps) {
  const tex = useTextTexture(text, bg, fg, 1024, Math.round((1024 * size[1]) / size[0]));
  return (
    <mesh position={p} rotation-y={ry}>
      <planeGeometry args={size} />
      <meshStandardMaterial map={tex} />
    </mesh>
  );
}

