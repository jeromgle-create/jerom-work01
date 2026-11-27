// Click / tap to move: A* over a walkability grid built from the same collision code the player uses.
// Portal mats (doors, stairs, rides) are avoided unless they are the destination, so a path never
// takes someone through a door they did not click.
import * as THREE from "three";
import { OUTDOOR, PARK, FLOOR_BY_ID, PORTALS, zoneAt } from "./zones";

type Collide = (p: THREE.Vector3) => void;
type Grid = { zone: string; minX: number; minZ: number; cell: number; nx: number; nz: number; free: Uint8Array };

const grids = new Map<string, Grid>();

function zoneRect(zone: string) {
  if (zone === "outdoor") return OUTDOOR;
  if (zone === "park") return PARK;
  const f = FLOOR_BY_ID[zone];
  return { minX: f.cx + f.minX, maxX: f.cx + f.maxX, minZ: f.cz + f.minZ, maxZ: f.cz + f.maxZ };
}

function buildGrid(zone: string, collide: Collide): Grid {
  const r = zoneRect(zone);
  const cell = zone === "outdoor" || zone === "park" ? 0.75 : 0.5;
  const nx = Math.ceil((r.maxX - r.minX) / cell) + 1;
  const nz = Math.ceil((r.maxZ - r.minZ) / cell) + 1;
  const free = new Uint8Array(nx * nz);
  const v = new THREE.Vector3();
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = r.minX + i * cell;
      const z = r.minZ + j * cell;
      v.set(x, 0, z);
      collide(v);
      free[j * nx + i] = Math.hypot(v.x - x, v.z - z) < 1e-3 ? 1 : 0;
    }
  return { zone, minX: r.minX, minZ: r.minZ, cell, nx, nz, free };
}

function gridFor(zone: string, collide: Collide) {
  let g = grids.get(zone);
  if (!g) {
    g = buildGrid(zone, collide);
    grids.set(zone, g);
  }
  return g;
}

/** Portal mats in this zone, as cell-index rectangles. */
function portalCells(g: Grid) {
  return PORTALS.filter((p) => p.from === g.zone).map((p) => ({
    i0: Math.floor((p.minX - g.minX) / g.cell) - 1,
    i1: Math.ceil((p.maxX - g.minX) / g.cell) + 1,
    j0: Math.floor((p.minZ - g.minZ) / g.cell) - 1,
    j1: Math.ceil((p.maxZ - g.minZ) / g.cell) + 1,
  }));
}

/** Nearest walkable cell to (i, j) by growing rings. */
function nearestFree(g: Grid, i: number, j: number, ok: (k: number) => boolean) {
  const clampI = (v: number) => Math.max(0, Math.min(g.nx - 1, v));
  const clampJ = (v: number) => Math.max(0, Math.min(g.nz - 1, v));
  i = clampI(i);
  j = clampJ(j);
  if (ok(j * g.nx + i)) return [i, j] as const;
  for (let r = 1; r < 40; r++) {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (let dj = -r; dj <= r; dj++)
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const a = clampI(i + di);
        const b = clampJ(j + dj);
        if (ok(b * g.nx + a)) {
          const d = di * di + dj * dj;
          if (d < bestD) (bestD = d), (best = [a, b]);
        }
      }
    if (best) return best;
  }
  return null;
}

/** Straight line between two cells only crosses walkable cells. */
function clearLine(g: Grid, ok: (k: number) => boolean, i0: number, j0: number, i1: number, j1: number) {
  const n = Math.ceil(Math.max(Math.abs(i1 - i0), Math.abs(j1 - j0)) * 2);
  for (let s = 1; s < n; s++) {
    const i = Math.round(i0 + ((i1 - i0) * s) / n);
    const j = Math.round(j0 + ((j1 - j0) * s) / n);
    if (!ok(j * g.nx + i)) return false;
  }
  return true;
}

/**
 * Path from `from` to `to` (world x/z) in the zone of `from`, or null if unreachable.
 * Returns smoothed waypoints ending exactly at the (possibly adjusted) destination.
 */
export function findPath(from: { x: number; z: number }, to: { x: number; z: number }, collide: Collide) {
  const zone = zoneAt(from.x);
  if (zoneAt(to.x) !== zone) return null;
  const g = gridFor(zone, collide);
  const cellOf = (x: number, z: number) => [Math.round((x - g.minX) / g.cell), Math.round((z - g.minZ) / g.cell)] as const;
  const [ti0, tj0] = cellOf(to.x, to.z);
  // mats are walls unless the click landed on (or right next to) that mat
  const mats = portalCells(g);
  const targetMat = mats.find((m) => ti0 >= m.i0 && ti0 <= m.i1 && tj0 >= m.j0 && tj0 <= m.j1);
  const blockedByMat = (k: number) => {
    const i = k % g.nx;
    const j = (k / g.nx) | 0;
    return mats.some((m) => m !== targetMat && i > m.i0 && i < m.i1 && j > m.j0 && j < m.j1);
  };
  const ok = (k: number) => g.free[k] === 1 && !blockedByMat(k);
  const s = nearestFree(g, ...cellOf(from.x, from.z), ok);
  const t = nearestFree(g, ti0, tj0, ok);
  if (!s || !t) return null;
  const start = s[1] * g.nx + s[0];
  const goal = t[1] * g.nx + t[0];
  // A* (8 directions, no corner cutting)
  const N = g.nx * g.nz;
  const gScore = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heap: [number, number][] = [];
  const push = (k: number, f: number) => {
    heap.push([f, k]);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (heap[p][0] <= heap[c][0]) break;
      [heap[p], heap[c]] = [heap[c], heap[p]];
      c = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let c = 0;
      for (;;) {
        const l = 2 * c + 1;
        const r = l + 1;
        let m = c;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === c) break;
        [heap[m], heap[c]] = [heap[c], heap[m]];
        c = m;
      }
    }
    return top[1];
  };
  const h = (k: number) => {
    const dx = Math.abs((k % g.nx) - t[0]);
    const dz = Math.abs(((k / g.nx) | 0) - t[1]);
    return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
  };
  gScore[start] = 0;
  push(start, h(start));
  const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  let found = start === goal;
  let guard = 0;
  let best = start; // closest explored cell to the target: used when the target can't be reached
  let bestH = h(start);
  while (heap.length && !found && guard++ < 200000) {
    const k = pop();
    if (closed[k]) continue;
    closed[k] = 1;
    const hk = h(k);
    if (hk < bestH) (bestH = hk), (best = k);
    if (k === goal) {
      found = true;
      break;
    }
    const i = k % g.nx;
    const j = (k / g.nx) | 0;
    for (const [di, dj, cost] of DIRS) {
      const a = i + di;
      const b = j + dj;
      if (a < 0 || b < 0 || a >= g.nx || b >= g.nz) continue;
      const n = b * g.nx + a;
      if (!ok(n) || closed[n]) continue;
      if (di && dj && (!ok(j * g.nx + a) || !ok(b * g.nx + i))) continue; // no squeezing past corners
      const ng = gScore[k] + cost;
      if (ng < gScore[n]) {
        gScore[n] = ng;
        came[n] = k;
        push(n, ng + h(n));
      }
    }
  }
  // Unreachable target (e.g. inside a fenced pen): walk to the closest point we can reach instead.
  const end = found ? goal : best;
  if (end === start && !found) return null;
  const cells: number[] = [];
  for (let k = end; k !== -1; k = came[k]) cells.unshift(k);
  // string-pull: keep only the corners needed to stay on walkable cells
  const pts: [number, number][] = [];
  let anchor = 0;
  for (let n = 2; n < cells.length; n++) {
    const a = cells[anchor];
    const c = cells[n];
    if (!clearLine(g, ok, a % g.nx, (a / g.nx) | 0, c % g.nx, (c / g.nx) | 0)) {
      anchor = n - 1;
      pts.push([cells[anchor] % g.nx, (cells[anchor] / g.nx) | 0]);
    }
  }
  const out = pts.map(([i, j]) => ({ x: g.minX + i * g.cell, z: g.minZ + j * g.cell }));
  // finish at the clicked point when it is walkable, else at the nearest walkable cell
  const endFree = found && t[0] === ti0 && t[1] === tj0;
  out.push(endFree ? { x: to.x, z: to.z } : { x: g.minX + (end % g.nx) * g.cell, z: g.minZ + ((end / g.nx) | 0) * g.cell });
  return out;
}

/** For tests: drop cached grids (e.g. after layout changes). */
export function clearPathCache() {
  grids.clear();
}
