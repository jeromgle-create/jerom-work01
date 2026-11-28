// Headless simulation of the world's movement rules (no browser, no server):
//  - every zone: flood-fill from a landing point -> all rooms, portals and campus doors reachable
//  - every portal landing is free (not inside a collider) and not on another portal
//  - random walks never end up inside solid buildings / across room partitions
//  - click-to-move paths walk to their target with real collisions and avoid unrelated mats
// Bundles the TypeScript collision / path code with esbuild, so run it from the metaverse folder:
//   node tests/sim.mjs
import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { join as pjoin, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as THREE from "three";
import { check, done } from "./lib.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../..");
// bundle next to the tests (gitignored) so the external "three" resolves from the project
const dir = pjoin(root, "tests", ".cache");
mkdirSync(dir, { recursive: true });
await build({
  stdin: {
    contents: `
      export { resolveCollisions } from "${root}/src/School";
      export { resolveInterior } from "${root}/src/Interior";
      export { resolvePark } from "${root}/src/Park";
      export { findPath } from "${root}/src/pathfind";
      export * from "${root}/shared/layout.js";`,
    resolveDir: root,
    loader: "ts",
  },
  bundle: true,
  platform: "browser", // the client code imports socket.io-client's browser build
  format: "esm",
  jsx: "automatic",
  outfile: pjoin(dir, "lib.mjs"),
  logLevel: "error",
  external: ["three"],
});
// minimal browser globals for module init (socket.io-client reads location; it never connects here)
globalThis.location = { protocol: "http:", host: "localhost", hostname: "localhost", port: "80", href: "http://localhost/" };
globalThis.window = globalThis;
const L = await import(pathToFileURL(pjoin(dir, "lib.mjs")).href + `?t=${Date.now()}`);

const collide = (p) => {
  const z = L.zoneAt(p.x);
  if (z === "outdoor") L.resolveCollisions(p);
  else if (z === "park") L.resolvePark(p);
  else L.resolveInterior(z, p);
};
const isFree = (x, z) => {
  const p = new THREE.Vector3(x, 0, z);
  collide(p);
  return Math.hypot(p.x - x, p.z - z) < 1e-6;
};
const inR = (c, r) => c[0] >= r.minX && c[0] <= r.maxX && c[1] >= r.minZ && c[1] <= r.maxZ;

function flood(R, sx, sz, step = 0.3) {
  const NI = Math.round((R.maxX - R.minX) / step);
  const NJ = Math.round((R.maxZ - R.minZ) / step);
  const toW = (i, j) => [R.minX + i * step, R.minZ + j * step];
  const si = Math.round((sx - R.minX) / step);
  const sj = Math.round((sz - R.minZ) / step);
  if (!isFree(...toW(si, sj))) return null;
  const seen = new Set([si + "," + sj]);
  const q = [[si, sj]];
  const cells = [];
  while (q.length) {
    const [i, j] = q.pop();
    cells.push(toW(i, j));
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di;
      const b = j + dj;
      if (a < 0 || b < 0 || a > NI || b > NJ || seen.has(a + "," + b)) continue;
      seen.add(a + "," + b);
      if (isFree(...toW(a, b))) q.push([a, b]);
    }
  }
  return cells;
}

// ---------- reachability ----------
const portalsOK = (zone, cells) => L.PORTALS.filter((p) => p.from === zone).every((p) => cells.some((c) => inR(c, p)));
const campus = flood(L.OUTDOOR, L.SPAWN.x, L.SPAWN.z);
check(campus && portalsOK("outdoor", campus), "campus: every building door and the park gate reachable from spawn");
const park = flood(L.PARK, L.PARK.cx, 55.5);
check(park && portalsOK("park", park), "park: exit and all ride stations reachable");
for (const f of L.FLOORS) {
  const R = { minX: f.cx + f.minX, maxX: f.cx + f.maxX, minZ: f.cz + f.minZ, maxZ: f.cz + f.maxZ };
  const landing = L.PORTALS.find((p) => p.to.x > R.minX && p.to.x < R.maxX);
  const cells = flood(R, landing.to.x, landing.to.z, 0.25);
  const unreachable = cells
    ? f.rooms
        .filter((r) => r.kind !== "void")
        .filter((r) => cells.filter((c) => inR(c, { minX: f.cx + r.minX + 0.3, maxX: f.cx + r.maxX - 0.3, minZ: f.cz + r.minZ + 0.3, maxZ: f.cz + r.maxZ - 0.3 })).length < 12)
        .map((r) => r.name)
    : ["(landing blocked)"];
  check(cells && portalsOK(f.id, cells) && unreachable.length === 0, `${f.label}: all ${f.rooms.filter((r) => r.kind !== "void").length} rooms + stairs/exit reachable`, unreachable.join(", "));
}
const badLandings = L.PORTALS.filter((p) => !isFree(p.to.x, p.to.z) || L.portalAt(p.to.x, p.to.z)).map((p) => `${p.from}:${p.label}`);
check(badLandings.length === 0, `all ${L.PORTALS.length} portal landings are free and not on a portal`, badLandings.join(", "));

// ---------- random walks ----------
function randomWalk(R, walks, steps, bad) {
  let n = 0;
  for (let k = 0; k < walks; k++) {
    // start where a player can actually stand (players never begin inside furniture or walls)
    let p;
    do p = new THREE.Vector3(R.minX + Math.random() * (R.maxX - R.minX), 0, R.minZ + Math.random() * (R.maxZ - R.minZ));
    while (!isFree(p.x, p.z));
    let a = Math.random() * 6.3;
    for (let i = 0; i < steps; i++) {
      if (Math.random() < 0.05) a = Math.random() * 6.3;
      const prev = p.clone();
      p.x += Math.cos(a) * 0.1;
      p.z += Math.sin(a) * 0.1;
      collide(p);
      if (bad(prev, p)) n++;
    }
  }
  return n;
}
const solid = [
  { minX: -36, maxX: 2, minZ: -26, maxZ: -19 }, // 북관
  { minX: -30, maxX: 2, minZ: -9, maxZ: -2 }, // 남관
  { minX: 8, maxX: 36, minZ: -26, maxZ: 8 }, // 본관
];
check(randomWalk(L.OUTDOOR, 600, 300, (_, p) => solid.some((r) => p.x > r.minX && p.x < r.maxX && p.z > r.minZ && p.z < r.maxZ)) === 0, "campus random walks never enter a building");
for (const id of ["N1", "S3", "E2"]) {
  const f = L.FLOOR_BY_ID[id];
  const R = { minX: f.cx + f.minX, maxX: f.cx + f.maxX, minZ: f.cz + f.minZ, maxZ: f.cz + f.maxZ };
  const bounds = (_, p) => p.x < R.minX || p.x > R.maxX || p.z < R.minZ || p.z > R.maxZ;
  // crossing a partition between two rooms (away from the corridor) means walking through a wall
  const roomOf = (v) => L.roomAt(v.x, v.z);
  const through = (a, b) => {
    const ra = roomOf(a);
    const rb = roomOf(b);
    return ra && rb && ra !== rb && ra.row === rb.row && !L.OPEN_KINDS.has(ra.kind) && !L.OPEN_KINDS.has(rb.kind);
  };
  check(randomWalk(R, 300, 300, (a, b) => bounds(a, b) || through(a, b)) === 0, `${f.label} random walks stay inside and never cross room walls`);
}

// ---------- click-to-move paths ----------
function walkPath(from, to) {
  const pts = L.findPath(from, to, collide);
  if (!pts) return { result: "no path" };
  const p = new THREE.Vector3(from.x, 0, from.z);
  let i = 0;
  for (let steps = 0; i < pts.length && steps < 20000; steps++) {
    const wp = pts[i];
    const dx = wp.x - p.x;
    const dz = wp.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.25) {
      i++;
      continue;
    }
    p.x += (dx / d) * Math.min(d, 0.1);
    p.z += (dz / d) * Math.min(d, 0.1);
    collide(p);
    const hit = L.portalAt(p.x, p.z);
    if (hit) return { result: "portal", portal: hit, end: pts[pts.length - 1] };
  }
  const end = pts[pts.length - 1];
  return { result: Math.hypot(p.x - end.x, p.z - end.z) < 0.3 ? "arrived" : "stuck", end };
}
const P = L.PARK.cx;
const E2 = L.FLOOR_BY_ID.E2;
const room = (f, name) => {
  const r = f.rooms.find((r) => r.name === name);
  return { x: f.cx + (r.minX + r.maxX) / 2, z: f.cz + (r.minZ + r.maxZ) / 2 };
};
check(walkPath({ x: -17, z: 17 }, { x: -16, z: -14 }).result === "arrived", "path: field -> courtyard around 남관");
check(walkPath({ x: -17, z: 17 }, { x: -16, z: -18.2 }).portal?.kind === "enter", "path: clicking 북관 door mat walks in");
check(walkPath({ x: -14, z: 0.6 }, { x: 6, z: 0.6 }).result === "arrived", "path: walking past 남관 door does not enter it");
check(walkPath({ x: E2.cx - 20, z: 0 }, room(E2, "교장실")).result === "arrived", "path: corridor -> 교장실 through the door");
const up = L.PORTALS.find((p) => p.from === "E2" && p.kind === "up");
check(walkPath({ x: E2.cx - 20, z: 0 }, { x: (up.minX + up.maxX) / 2, z: (up.minZ + up.maxZ) / 2 }).portal?.kind === "up", "path: clicking the stairs mat goes upstairs");
check(walkPath({ x: P, z: 52 }, { x: P + 45, z: -35 }).result === "arrived", "path: park plaza -> zoo walkway");
// park cafe: walk in through the door, reach the counter and every stool
const CX = P + L.CAFE.x;
const CZ = L.CAFE.z;
const beside = L.CAFE_SEATS.map((s) => {
  const [tx, tz] = L.CAFE_TABLES[s.table];
  const d = Math.hypot(s.x - tx, s.z - tz);
  return { id: s.id, x: CX + s.x + ((s.x - tx) / d) * 0.5, z: CZ + s.z + ((s.z - tz) / d) * 0.5 };
});
const nearCell = (x, z) => park.some(([cx, cz]) => Math.hypot(cx - x, cz - z) < 0.35);
check(nearCell(CX + 0.6, CZ - 0.4) && beside.every((b) => nearCell(b.x, b.z)), "cafe: counter and all 4 stools reachable on foot", beside.filter((b) => !nearCell(b.x, b.z)).map((b) => b.id).join(","));
check(walkPath({ x: P, z: 52 }, { x: CX + 0.6, z: CZ - 0.4 }).result === "arrived", "path: park plaza -> cafe counter through the door");
check(walkPath({ x: CX, z: CZ - 5 }, { x: CX + 0.6, z: CZ - 0.4 }).result === "arrived", "path: from behind the cafe -> counter walks around to the door");
check(!isFree(CX, CZ - 2.5) && !isFree(CX - 2, CZ + 2.4) && isFree(CX, CZ + 2.4), "cafe: walls are solid, the doorway is open");
check(L.locationKey(CX, CZ) === "park:cafe" && L.locationKey(CX, CZ + 4) === "park", "cafe: inside is its own chat room");
const pen = walkPath({ x: P, z: 52 }, { x: P + 28, z: -25 });
check(pen.result === "arrived" && pen.end.x - P > 34, "path: click inside the giraffe pen stops outside the fence", pen.end && `x=${(pen.end.x - P).toFixed(1)}`);
done();
