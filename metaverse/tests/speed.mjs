// Server movement check (no teleporting), with Socket.IO bots. Starts its own server WITHOUT
// MV_ALLOW_TELEPORT on port 4102, so it works next to the test server on :4100.
//   node tests/speed.mjs
import { spawn } from "node:child_process";
import { io } from "socket.io-client";
import * as L from "../shared/layout.js";
import { check, done, round } from "./lib.mjs";

const PORT = 4102;
const URL = `http://localhost:${PORT}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn("node", ["server/index.js"], { env: { ...process.env, PORT: String(PORT), MV_ALLOW_TELEPORT: "" }, stdio: "ignore" });
await wait(1200);

/** A bot that tracks where the server has it (from the state broadcast) and the snap-backs it got. */
async function bot(name) {
  const s = io(URL, { transports: ["websocket"] });
  const ack = await new Promise((r) => s.emit("join", { name }, r));
  const me = ack.players.find((p) => p.id === ack.selfId);
  const b = { s, id: ack.selfId, x: me.x, z: me.z, server: { x: me.x, z: me.z }, corrections: [] };
  s.on("state", (rows) => {
    for (const [id, x, z] of rows) if (id === b.id) b.server = { x, z };
  });
  s.on("correct", (c) => b.corrections.push(c));
  return b;
}
const send = (b, x, z) => {
  b.x = x;
  b.z = z;
  b.s.emit("move", { x, z, ry: 0 });
};
/** Walk in a straight line at ~6.8 m/s (0.45 m every 66 ms), like a fast client. */
async function walkTo(b, x, z) {
  for (;;) {
    const d = Math.hypot(x - b.x, z - b.z);
    if (d < 0.01) return;
    const k = Math.min(1, 0.45 / d);
    send(b, b.x + (x - b.x) * k, b.z + (z - b.z) * k);
    await wait(66);
  }
}
const at = (b, x, z, tol = 0.6) => Math.hypot(b.server.x - x, b.server.z - z) <= tol;
const mid = (r) => ({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 });

try {
  const a = await bot("속도검사");
  console.log("\n# walking is accepted");
  const s0 = { x: a.x, z: a.z };
  await walkTo(a, s0.x + 6, s0.z);
  await wait(300);
  check(at(a, s0.x + 6, s0.z) && a.corrections.length === 0, "walking 6 m at walking speed: server follows, no snap-back");

  console.log("\n# jumps are refused");
  const before = { ...a.server };
  send(a, 30, -30); // 50+ m in one message
  await wait(400);
  check(at(a, before.x, before.z) && a.corrections.length === 1, "a 50 m jump is refused and the client is told to go back", JSON.stringify(a.corrections[0] ?? null));
  const c = a.corrections[0];
  check(c && Math.hypot(c.x - before.x, c.z - before.z) < 0.01, "snap-back points to the last accepted position");
  a.x = before.x;
  a.z = before.z;
  send(a, before.x + 0.4, before.z); // after snapping back, normal walking works again
  await wait(300);
  check(at(a, before.x + 0.4, before.z), "walking works again after a snap-back");
  // Many small, fast steps: faster than walking for long enough is refused too.
  a.corrections = [];
  for (let i = 0; i < 20; i++) {
    send(a, a.x + 1.5, a.z); // 1.5 m every 30 ms = 50 m/s
    await wait(30);
  }
  await wait(300);
  check(a.corrections.length > 0 && a.server.x < before.x + 0.4 + 20, "running at 50 m/s with small steps is held back", `server moved ${round(a.server.x - before.x - 0.4)} m of 30 m`);
  a.x = a.server.x;
  a.z = a.server.z;
  await wait(600);

  console.log("\n# doors are allowed");
  a.corrections = [];
  const gate = L.PORTALS.find((p) => p.from === "outdoor" && p.to.x >= L.PARK.cx - 100);
  await walkTo(a, mid(gate).x, mid(gate).z);
  send(a, gate.to.x, gate.to.z); // the door takes us to the park (2400 m away)
  await wait(300);
  check(at(a, gate.to.x, gate.to.z) && a.corrections.length === 0, "walking through the park gate (a 2400 m jump) is allowed");
  send(a, -17, 17); // but not jumping back from the park entrance to the school field
  await wait(300);
  check(at(a, gate.to.x, gate.to.z) && a.corrections.length === 1, "jumping from the park to the school field is refused");
  a.x = a.server.x;
  a.z = a.server.z;
  await wait(600);

  console.log("\n# rides: the server places riders itself");
  a.corrections = [];
  const lift = L.PORTALS.find((p) => p.kind === "ride" && p.ride === 1 && p.dir === "ab");
  await walkTo(a, mid(lift).x, mid(lift).z);
  const r = await new Promise((res) => a.s.emit("ride:start", { ride: 1, dir: "ab" }, res));
  check(r?.ok, "boarded the sky lift");
  await wait(r.start - Date.now() + 6000); // 6 s after departure
  send(a, a.x + 200, a.z); // a cheating client reports somewhere else
  await wait(300);
  const p = L.seatPose(1, "ab", (Date.now() - 150 - r.start) / L.RIDES[1].duration, r.seat);
  check(Math.hypot(a.server.x - p.x, a.server.z - p.z) < 3, "while riding, the server keeps the rider on the lift", `${round(Math.hypot(a.server.x - p.x, a.server.z - p.z))} m from the chair`);
  await new Promise((res) => {
    a.s.on("ride", (m) => m.id === a.id && m.ride === null && res());
  });
  await wait(200);
  const land = { x: lift.to.x + (r.seat % 2 ? 0.9 : -0.9), z: lift.to.z + Math.floor(r.seat / 2) * 1.1 };
  a.x = land.x;
  a.z = land.z;
  send(a, land.x, land.z + 0.3);
  await wait(300);
  check(at(a, land.x, land.z + 0.3) && a.corrections.length === 0, "after the ride, the rider steps off at the far station and walks on");
} finally {
  server.kill();
}
done();
process.exit(process.exitCode ?? 0);
