// Server rules checked with plain Socket.IO clients ("bots"), no browser:
//  - chat delivery: near (3 m, same room), meeting group (chained, hysteresis), all
//  - ride boarding guards and shared vehicles (seats, departure, capacity)
// Needs a running server: MV_URL=http://localhost:4100 node tests/bots.mjs
import { io } from "socket.io-client";
import * as L from "../shared/layout.js";
import { URL, check, done } from "./lib.mjs";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const bots = [];
async function bot(name, x, z) {
  const s = io(URL, { transports: ["websocket"] });
  const b = { name, s, got: [], group: null };
  s.on("chat", (m) => b.got.push(`${m.scope}:${m.name}:${m.text}`));
  s.on("group:state", (g) => (b.group = g ? g.id + ":" + g.members.map((m) => m.name).sort().join(",") : null));
  await new Promise((r) => s.emit("join", { name }, r));
  s.emit("move", { x, z, ry: 0 });
  bots.push(b);
  return b;
}
const move = (b, x, z) => b.s.emit("move", { x, z, ry: 0 });
const clear = () => bots.forEach((b) => (b.got = []));

// ---------- chat ----------
const n1 = L.FLOOR_BY_ID.N1;
const counsel = n1.rooms[2]; // a north-row room next to the corridor
const cx = n1.cx + (counsel.minX + counsel.maxX) / 2;
const [A, B, C, D] = [await bot("A", -20, 15), await bot("B", -18, 15), await bot("C", -15.5, 15), await bot("D", -5, 15)];
const E = await bot("E", cx, -3.2); // inside the room
const F = await bot("F", cx, -1.2); // corridor, 2 m away through the wall
await wait(2200); // meetings need 1.5 s of standing close
check(A.group && A.group === B.group && B.group === C.group, "meeting: A–B–C chained into one group (A and C are 4.5 m apart)", A.group);
check(!D.group && !E.group && !F.group, "meeting: D (far) and E/F (wall between) have no group");
A.s.emit("chat", { scope: "near", text: "near1" });
await wait(800);
A.s.emit("chat", { scope: "group", text: "group1" });
await wait(800);
D.s.emit("chat", { scope: "all", text: "all1" });
await wait(800);
E.s.emit("chat", { scope: "near", text: "wall" });
await wait(600);
const has = (b, m) => b.got.includes(m);
check(has(A, "near:A:near1") && has(B, "near:A:near1") && !has(C, "near:A:near1"), "near chat reaches 3 m only (B yes, C at 4.5 m no)");
check([A, B, C].every((b) => has(b, "group:A:group1")) && !has(D, "group:A:group1"), "meeting chat reaches the whole group, nobody else");
check(bots.every((b) => has(b, "all:D:all1")), "all chat reaches everyone");
check(has(E, "near:E:wall") && !has(F, "near:E:wall"), "near chat does not pass through a wall (corridor 2 m away)");
move(C, -13.5, 15); // 4.5 m from B: leaves (keep radius 4)
await wait(1200);
check(!C.group && A.group === B.group, "meeting: walking >4 m away leaves the group");
move(C, -14.2, 15); // 3.8 m: not close enough to rejoin
await wait(2200);
check(!C.group, "meeting: 3.8 m is not enough to rejoin (needs ≤3 m)");
const gid = A.group?.split(":")[0];
move(C, -15.1, 15); // 2.9 m
await wait(2200);
check(C.group?.startsWith(gid + ":"), "meeting: coming back within 3 m rejoins the same group id");
clear();
D.s.emit("chat", { scope: "group", text: "nogroup" });
await wait(600);
check(bots.every((b) => !b.got.length), "meeting chat without a group is dropped");
bots.forEach((b) => b.s.close());
bots.length = 0;

// ---------- rides ----------
const station = (ride, end) => {
  const [x0, x1, z0, z1] = L.PARK_RIDES[ride][end].mat;
  return { x: L.PARK.cx + (x0 + x1) / 2, z: (z0 + z1) / 2 };
};
const ask = (b, m) => new Promise((r) => b.s.emit("ride:start", m, r));
const t1 = await bot("T1", 0, 0);
check(!(await ask(t1, { ride: 0, dir: "ab" })).ok, "ride: refused far from the station");
const st = station(0, "a");
move(t1, st.x, st.z);
const t2 = await bot("T2", st.x + 0.5, st.z);
await wait(300);
check(!(await ask(t1, { ride: 9, dir: "ab" })).ok, "ride: unknown ride refused");
const r1 = await ask(t1, { ride: 0, dir: "ab" });
const r2 = await ask(t2, { ride: 0, dir: "ab" });
check(r1.ok && r2.ok && r1.vehicle === r2.vehicle && r1.start === r2.start && r1.seat === 0 && r2.seat === 1, "ride: friends at the same station share one train (seats 0/1, same departure)", `${r1.vehicle}/${r2.vehicle}`);
check(r1.start - Date.now() > 5000, "ride: the train waits at the station before leaving", `${((r1.start - Date.now()) / 1000).toFixed(1)} s`);
check(!(await ask(t1, { ride: 0, dir: "ab" })).ok, "ride: boarding twice is refused");
let ended = false;
t1.s.on("ride", (r) => r.id === t1.s.id && r.ride === null && (ended = true));
t1.s.emit("ride:end");
await wait(400);
check(ended, "ride: ride:end clears the rider for everyone");
const top = station(1, "b");
const [c1, c2, c3] = [await bot("C1", top.x, top.z), await bot("C2", top.x + 0.5, top.z), await bot("C3", top.x - 0.5, top.z)];
await wait(300);
const [l1, l2, l3] = [await ask(c1, { ride: 1, dir: "ba" }), await ask(c2, { ride: 1, dir: "ba" }), await ask(c3, { ride: 1, dir: "ba" })];
check(l1.vehicle === l2.vehicle && l3.ok && l3.vehicle !== l1.vehicle, "ride: lift chairs seat two; the third rider gets the next chair");

// ---------- cafe stools ----------
const seat = L.CAFE_SEATS[0];
const sw = L.cafeSeatWorld(seat);
const sitAsk = (b, s) => new Promise((r) => b.s.emit("sit", { seat: s }, r));
const [K1, K2] = [await bot("K1", sw.x + 0.3, sw.z), await bot("K2", sw.x - 0.3, sw.z)];
const K3 = await bot("K3", sw.x + 8, sw.z + 8);
const seen = [];
K3.s.on("sit", (m) => seen.push(`${m.id === K1.s.id ? "K1" : "?"}:${m.seat}`));
await wait(300);
check(!(await sitAsk(K3, seat.id)).ok, "cafe: sitting is refused far from the stool");
check(!(await sitAsk(K1, "nope")).ok, "cafe: unknown stool refused");
check((await sitAsk(K1, seat.id)).ok && !(await sitAsk(K2, seat.id)).ok, "cafe: one sitter per stool (the second is refused)");
await wait(300);
check(seen.includes(`K1:${seat.id}`), "cafe: everyone is told who sits where");
const fresh = io(URL, { transports: ["websocket"] });
const ack = await new Promise((r) => fresh.emit("join", { name: "K5" }, r));
check(ack.players.find((p) => p.id === K1.s.id)?.seat === seat.id, "cafe: someone joining later sees who is sitting");
fresh.close();
move(K1, sw.x + 3, sw.z + 3); // walked off without saying so
await wait(400);
check(seen.includes("K1:null") && (await sitAsk(K2, seat.id)).ok, "cafe: walking away frees the stool for the next person");
bots.forEach((b) => b.s.close());
done();
process.exit(process.exitCode ?? 0);
