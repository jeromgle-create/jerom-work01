// Real-time server: serves the built client and relays avatar/chat state via Socket.IO.
import express from "express";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";
import { Server } from "socket.io";
import { CAFE, CAFE_MENU, CAFE_MIN_PRICE, CAFE_SEATS, CAR_GAP, PARK, PARK_RIDES, PORTALS, RIDES, SPAWN, ZONE_RECTS, cafeStandSpot, locationKey, seatCar, seatEndU, seatPose } from "../shared/layout.js";

const PORT = Number(process.env.PORT) || 3001;
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS) || 50;
const TICK_MS = 66; // ~15 state broadcasts per second
const CHAT_MAX = 200;
const NAME_MAX = 16;
const CHAT_COOLDOWN_MS = 700;
// Proximity chat: "near" reaches everyone within NEAR_R of the sender; "group" reaches the sender's
// meeting group (people chained within GROUP_JOIN_R; an existing link survives up to GROUP_KEEP_R).
const NEAR_R = 3;
const GROUP_JOIN_R = 3;
const GROUP_KEEP_R = 4;
const GROUP_TICK_MS = 300;
const GROUP_DWELL_MS = 1500; // must stay close this long to form a meeting (ignores walk-bys and spawn overlap)
const MAX_VOICE = Number(process.env.MAX_VOICE) || 8; // peer-to-peer mesh: keep small
const SIGNAL_MAX = 20000; // bytes of JSON per WebRTC signaling message
// Movement check: players walk at 6 m/s. Each player has a distance budget that refills at
// MOVE_SPEED (walking speed + slack for network jitter) up to MOVE_BURST metres; a move that needs
// more is a jump and is refused (the client is snapped back) unless it goes through a door/stairs
// portal. While riding, the server places the player on the ride itself.
// MV_ALLOW_TELEPORT=1 turns the check off for the test build's teleport hook (never on Render).
const MOVE_SPEED = 9;
const MOVE_BURST = 12; // ~2 s of walking: absorbs network hiccups (moves arriving in a bunch)
const MOVE_SLACK = 0.5; // collision push-out
const PORTAL_REACH = 3; // how far from a portal mat / landing a jump through it may start / end
const ALLOW_TELEPORT = process.env.MV_ALLOW_TELEPORT === "1";
const CORRECT_MS = 500; // at most one snap-back message per player per this many ms
// Lawn cafe: how close (m) a guest must be to sit on a stool; a sip takes this long (ms).
const SEAT_REACH = 2.2;
const SIP_MS = 2200;
// ICE servers for WebRTC. Set ICE_SERVERS to a JSON array to add a TURN relay later without code changes.
const ICE_SERVERS = (() => {
  try {
    if (process.env.ICE_SERVERS) return JSON.parse(process.env.ICE_SERVERS);
  } catch {
    console.warn("ICE_SERVERS is not valid JSON; using default STUN");
  }
  return [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
})();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  // Same-origin in production; allow the Vite dev server in development.
  cors: process.env.NODE_ENV === "production" ? undefined : { origin: true },
});

const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
app.get("/healthz", (_req, res) => res.json({ ok: true, players: players.size }));
app.get("/api/ice", (_req, res) => res.json({ iceServers: ICE_SERVERS }));
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get("*", (_req, res) => res.sendFile(path.join(distDir, "index.html")));
}

/** @type {Map<string, {id:string,name:string,color:string,x:number,z:number,ry:number,lastChat:number,voice:boolean,muted:boolean,group:string|null}>} */
const players = new Map();
const dirty = new Set();

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
// locationKey (from shared/layout.js): walls separate conversations; open areas count as the corridor.

/** Distance from a point to a rectangle (0 inside). */
const rectDist = (x, z, r) => Math.hypot(Math.max(r.minX - x, 0, x - r.maxX), Math.max(r.minZ - z, 0, z - r.maxZ));
/** A long jump is allowed when it starts at a door/stairs mat and ends at that mat's landing. */
function throughPortal(p, c) {
  return PORTALS.some(
    (pt) => pt.kind !== "ride" && rectDist(p.x, p.z, pt) <= PORTAL_REACH && Math.hypot(c.x - pt.to.x, c.z - pt.to.z) <= PORTAL_REACH,
  );
}

/** Clamp a position into the nearest walkable zone. */
function clampToZones(x, z) {
  let best = null;
  for (const zn of ZONE_RECTS) {
    const cx = clamp(x, zn.minX, zn.maxX);
    const cz = clamp(z, zn.minZ, zn.maxZ);
    const d = (cx - x) ** 2 + (cz - z) ** 2;
    if (!best || d < best.d) best = { x: cx, z: cz, d };
  }
  return best;
}
const num = (v, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const clean = (s, max) =>
  String(s ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max);
const publicPlayer = ({ id, name, color, x, z, ry, voice, muted, ride, cafe }) => ({ id, name, color, x, z, ry, voice, muted, ride: ride ?? null, cafe: cafe ?? null });
/** Cafe state of one guest as clients see it: their seat and their order (null when none). */
const cafeView = (p) => ({ id: p.id, ...p.cafe });
const voiceState = (p) => ({ id: p.id, voice: p.voice, muted: p.muted });

io.on("connection", (socket) => {
  socket.on("join", (payload, ack) => {
    if (players.has(socket.id)) return;
    if (players.size >= MAX_PLAYERS) {
      ack?.({ ok: false, error: "방이 가득 찼습니다. 잠시 후 다시 시도해 주세요." });
      return;
    }
    const name = clean(payload?.name, NAME_MAX) || "손님";
    const color = /^#[0-9a-fA-F]{6}$/.test(payload?.color) ? payload.color : "#4f8cff";
    // Spawn on a ring around the middle of the field (kept free of scenery).
    const angle = Math.random() * Math.PI * 2;
    const radius = 2.5 + Math.random() * 2.5;
    const player = {
      id: socket.id,
      name,
      color,
      x: SPAWN.x + Math.cos(angle) * radius,
      z: SPAWN.z + Math.sin(angle) * radius,
      ry: 0,
      lastChat: 0,
      voice: false,
      muted: false,
      group: null,
      ride: null, // { ride, dir, start, vehicle, seat } while sitting in the elephant train or a lift chair
      // lawn cafe: seat index (or null) and order { item, readyAt, stage: "making"|"ready"|"held"|"placed", seat, left, sipUntil }
      cafe: { seat: null, order: null },
      wallet: CAFE.wallet, // cafe pocket money (only this player is told the amount)
      rideTimer: null,
      budget: MOVE_BURST, // metres the player may still move right now (see MOVE_SPEED)
      lastMoveAt: Date.now(),
      lastCorrect: 0,
    };
    players.set(socket.id, player);
    ack?.({ ok: true, selfId: socket.id, now: Date.now(), wallet: player.wallet, players: [...players.values()].map(publicPlayer) });
    socket.broadcast.emit("playerJoined", publicPlayer(player));
    io.emit("system", { text: `${name} 님이 입장했습니다.`, ts: Date.now() });
  });

  socket.on("move", (m) => {
    const p = players.get(socket.id);
    if (!p) return;
    const now = Date.now();
    p.budget = Math.min(MOVE_BURST, p.budget + (MOVE_SPEED * (now - p.lastMoveAt)) / 1000);
    p.lastMoveAt = now;
    if (p.cafe.seat !== null) {
      // On a cafe stool: stay there until "cafe:stand".
      p.budget = MOVE_BURST;
      return;
    }
    if (p.ride) {
      // Seated: the ride decides where the player is.
      const r = p.ride;
      const u = clamp((now - r.start) / RIDES[r.ride].duration, 0, seatEndU(r.ride, r.seat));
      const s = seatPose(r.ride, r.dir, u, r.seat);
      p.x = s.x;
      p.z = s.z;
      p.ry = s.ry;
      p.budget = MOVE_BURST;
      dirty.add(socket.id);
      return;
    }
    const c = clampToZones(num(m?.x, p.x), num(m?.z, p.z));
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    if (ALLOW_TELEPORT || d <= p.budget + MOVE_SLACK) p.budget = Math.max(0, p.budget - d);
    else if (throughPortal(p, c)) p.budget = MOVE_BURST;
    else {
      // Too far, too fast: keep the old position and put the player back there.
      if (now - p.lastCorrect > CORRECT_MS) {
        p.lastCorrect = now;
        socket.emit("correct", { x: p.x, z: p.z });
      }
      return;
    }
    p.x = c.x;
    p.z = c.z;
    p.ry = num(m?.ry, p.ry);
    dirty.add(socket.id);
  });

  socket.on("chat", (m) => {
    const p = players.get(socket.id);
    if (!p) return;
    const now = Date.now();
    if (now - p.lastChat < CHAT_COOLDOWN_MS) return;
    const text = clean(m?.text, CHAT_MAX);
    if (!text) return;
    const scope = m?.scope === "near" || m?.scope === "group" ? m.scope : "all";
    const msg = { id: p.id, name: p.name, color: p.color, text, ts: now, scope };
    if (scope === "all") {
      io.emit("chat", msg);
    } else if (scope === "near") {
      // Recipients are decided here, so clients never receive conversations they are not part of.
      const here = locationKey(p.x, p.z);
      const to = [...players.values()].filter(
        (o) => Math.hypot(o.x - p.x, o.z - p.z) <= NEAR_R && locationKey(o.x, o.z) === here,
      );
      for (const o of to) io.to(o.id).emit("chat", { ...msg, recipients: to.length });
    } else {
      if (!p.group) return;
      const gid = p.group;
      for (const o of players.values()) if (o.group === gid) io.to(o.id).emit("chat", { ...msg, groupId: gid });
    }
    p.lastChat = now;
  });

  // --- Voice chat: the server only relays WebRTC signaling; audio flows peer to peer. ---
  socket.on("voice:join", (_payload, ack) => {
    const p = players.get(socket.id);
    if (!p) return ack?.({ ok: false, error: "먼저 입장해 주세요." });
    if (!p.voice) {
      const inVoice = [...players.values()].filter((o) => o.voice).length;
      if (inVoice >= MAX_VOICE) {
        return ack?.({ ok: false, error: `음성 채팅은 최대 ${MAX_VOICE}명까지 참여할 수 있습니다.` });
      }
    }
    p.voice = true;
    p.muted = false;
    const peers = [...players.values()].filter((o) => o.voice && o.id !== p.id).map((o) => o.id);
    ack?.({ ok: true, peers });
    io.emit("voice:state", voiceState(p));
  });

  socket.on("voice:mute", (m) => {
    const p = players.get(socket.id);
    if (!p || !p.voice) return;
    p.muted = !!m?.muted;
    io.emit("voice:state", voiceState(p));
  });

  socket.on("voice:leave", () => {
    const p = players.get(socket.id);
    if (!p || !p.voice) return;
    p.voice = false;
    p.muted = false;
    io.emit("voice:state", voiceState(p));
  });

  socket.on("rtc:signal", (m) => {
    const p = players.get(socket.id);
    const target = players.get(m?.to);
    if (!p?.voice || !target?.voice || target.id === p.id) return;
    let size = 0;
    try {
      size = JSON.stringify(m.data ?? null).length;
    } catch {
      return;
    }
    if (size > SIGNAL_MAX) return;
    io.to(target.id).emit("rtc:signal", { from: p.id, data: m.data });
  });

  // --- Rides: the server picks a vehicle + seat and its departure time; clients derive poses from it. ---
  const endRide = (p) => {
    if (!p.ride) return;
    clearTimeout(p.rideTimer);
    // Step off where the client does: the arrival landing, side by side by seat.
    const r = p.ride;
    const pt = PORTALS.find((q) => q.kind === "ride" && q.ride === r.ride && q.dir === r.dir);
    if (pt) {
      p.x = pt.to.x + (r.seat % 2 ? 0.9 : -0.9);
      p.z = pt.to.z + Math.floor(r.seat / 2) * 1.1;
      dirty.add(p.id);
    }
    p.budget = MOVE_BURST;
    p.lastMoveAt = Date.now();
    const v = vehicles.get(p.ride.vehicle);
    if (v) {
      v.seats[p.ride.seat] = null;
      if (v.seats.every((x) => x === null) && Date.now() > v.start) vehicles.delete(p.ride.vehicle);
    }
    p.ride = null;
    p.rideTimer = null;
    io.emit("ride", { id: p.id, ride: null });
  };
  socket.on("ride:start", (m, ack) => {
    const p = players.get(socket.id);
    const ride = m?.ride;
    const dir = m?.dir === "ba" ? "ba" : "ab";
    if (!p || !Number.isInteger(ride) || !RIDES[ride] || p.ride || p.cafe.seat !== null) return ack?.({ ok: false });
    // must be standing at the boarding station
    const st = dir === "ab" ? PARK_RIDES[ride].a : PARK_RIDES[ride].b;
    const [x0, x1, z0, z1] = st.mat;
    const cx = PARK.cx + (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    if (Math.hypot(p.x - cx, p.z - cz) > 6) return ack?.({ ok: false });
    // Join a vehicle still waiting at this station with a free seat, or open a new one.
    const now = Date.now();
    const spec = RIDES[ride];
    let vid = null;
    let seat = -1;
    for (const [id, v] of vehicles) {
      if (v.ride !== ride || v.dir !== dir || v.start - now < 300) continue;
      const free = v.seats.indexOf(null);
      if (free >= 0) {
        vid = id;
        seat = free;
        break;
      }
    }
    if (vid === null) {
      vid = `v${++vehicleSeq}`;
      vehicles.set(vid, { ride, dir, start: now + spec.boardWait, seats: new Array(spec.capacity).fill(null) });
      seat = 0;
    }
    const v = vehicles.get(vid);
    v.seats[seat] = p.id;
    p.ride = { ride, dir, start: v.start, vehicle: vid, seat };
    // safety net if the client never reports arrival
    const endAt = v.start + spec.duration * (1 + seatCar(ride, seat) * CAR_GAP) + 1500;
    p.rideTimer = setTimeout(() => endRide(p), endAt - now);
    io.emit("ride", { id: p.id, ...p.ride });
    ack?.({ ok: true, ...p.ride });
  });
  socket.on("ride:end", () => {
    const p = players.get(socket.id);
    if (p) endRide(p);
  });

  // --- Lawn cafe: the server takes orders, keeps the barista's timing and gives out stools. ---
  const near = (p, x, z, r) => Math.hypot(p.x - (PARK.cx + x), p.z - z) <= r;
  const sendCafe = (p) => io.emit("cafe", cafeView(p));
  socket.on("cafe:order", (m, ack) => {
    const p = players.get(socket.id);
    const item = m?.item;
    if (!p || !Number.isInteger(item) || !CAFE_MENU[item] || p.ride) return ack?.({ ok: false });
    if (p.cafe.order && p.cafe.order.stage !== "placed") return ack?.({ ok: false, error: "이미 주문한 것이 있어요." });
    if (!near(p, CAFE.order.x, CAFE.order.z, CAFE.order.reach)) return ack?.({ ok: false, error: "카운터 앞에서 주문해 주세요." });
    const price = CAFE_MENU[item].price;
    if (p.wallet < price) return ack?.({ ok: false, error: "돈이 모자라요. '용돈 받기'를 눌러 보세요." });
    p.wallet -= price;
    socket.emit("cafe:wallet", p.wallet);
    const now = Date.now();
    // An empty cup left on the table is cleared by the next order.
    p.cafe.order = { item, readyAt: now + CAFE_MENU[item].prep, stage: "making", seat: null, left: CAFE_MENU[item].sips, sipUntil: 0 };
    sendCafe(p);
    ack?.({ ok: true });
  });
  // Pocket money: only once it can't buy anything any more.
  socket.on("cafe:allowance", (_m, ack) => {
    const p = players.get(socket.id);
    if (!p || p.wallet >= CAFE_MIN_PRICE) return ack?.({ ok: false, error: "아직 돈이 남아 있어요." });
    p.wallet = CAFE.wallet;
    socket.emit("cafe:wallet", p.wallet);
    ack?.({ ok: true, wallet: p.wallet });
  });
  socket.on("cafe:pickup", (_m, ack) => {
    const p = players.get(socket.id);
    const o = p?.cafe.order;
    // small tolerance: the client's idea of server time can be a few hundred ms off
    if (!p || !o || o.stage !== "making" || Date.now() < o.readyAt - 500) return ack?.({ ok: false });
    if (!near(p, CAFE.order.x, CAFE.order.z, CAFE.order.reach)) return ack?.({ ok: false, error: "카운터 앞에서 받아 주세요." });
    o.stage = "held";
    sendCafe(p);
    ack?.({ ok: true });
  });
  socket.on("cafe:sit", (m, ack) => {
    const p = players.get(socket.id);
    const i = m?.seat;
    const s = CAFE_SEATS[i];
    if (!p || !Number.isInteger(i) || !s || s.npc || p.ride || p.cafe.seat !== null) return ack?.({ ok: false });
    if (!near(p, s.x, s.z, SEAT_REACH)) return ack?.({ ok: false });
    // One guest per stool: the first request wins.
    for (const o of players.values()) if (o.cafe.seat === i) return ack?.({ ok: false, error: "다른 사람이 앉아 있는 자리예요." });
    p.cafe.seat = i;
    p.x = PARK.cx + s.x;
    p.z = s.z;
    p.ry = s.ry;
    const o = p.cafe.order;
    if (o && o.stage === "held") {
      o.stage = "placed"; // put it on the table in front of the stool
      o.seat = i;
    }
    dirty.add(p.id);
    sendCafe(p);
    ack?.({ ok: true, seat: i });
  });
  const standUp = (p) => {
    if (p.cafe.seat === null) return;
    const st = cafeStandSpot(p.cafe.seat);
    p.cafe.seat = null;
    p.x = PARK.cx + st.x;
    p.z = st.z;
    p.budget = MOVE_BURST;
    p.lastMoveAt = Date.now();
    dirty.add(p.id);
    sendCafe(p);
  };
  socket.on("cafe:stand", (_m, ack) => {
    const p = players.get(socket.id);
    if (!p || p.cafe.seat === null) return ack?.({ ok: false });
    const o = p.cafe.order;
    if (o && o.sipUntil > Date.now()) return ack?.({ ok: false }); // finish the sip first
    const st = cafeStandSpot(p.cafe.seat);
    standUp(p);
    ack?.({ ok: true, x: PARK.cx + st.x, z: st.z });
  });
  socket.on("cafe:sip", (_m, ack) => {
    const p = players.get(socket.id);
    const o = p?.cafe.order;
    const now = Date.now();
    if (!p || !o || o.stage !== "placed" || o.seat !== p.cafe.seat || o.left <= 0 || o.sipUntil > now) return ack?.({ ok: false });
    o.left -= 1;
    o.sipUntil = now + SIP_MS;
    sendCafe(p);
    ack?.({ ok: true });
  });

  socket.on("disconnect", () => {
    const p = players.get(socket.id);
    if (!p) return;
    clearTimeout(p.rideTimer);
    if (p.cafe.seat !== null || p.cafe.order) io.emit("cafe", { id: p.id, seat: null, order: null });
    players.delete(socket.id);
    dirty.delete(socket.id);
    io.emit("playerLeft", socket.id);
    io.emit("system", { text: `${p.name} 님이 퇴장했습니다.`, ts: Date.now() });
  });
});

setInterval(() => {
  if (dirty.size === 0) return;
  const updates = [];
  for (const id of dirty) {
    const p = players.get(id);
    if (p) updates.push([p.id, +p.x.toFixed(2), +p.z.toFixed(2), +p.ry.toFixed(2)]);
  }
  dirty.clear();
  io.volatile.emit("state", updates);
}, TICK_MS);

// --- Meeting groups: connected components of players standing close together. ---
let groupSeq = 0;
/** Shared ride vehicles: id -> { ride, dir, start (departure, server ms), seats: (playerId|null)[] } */
const vehicles = new Map();
let vehicleSeq = 0;
/** @type {Map<string, number>} "idA|idB" -> since when the pair has been within GROUP_JOIN_R */
let nearSince = new Map();
/** @type {Map<string, string>} group id -> signature of its member list last sent to clients */
const groupSig = new Map();

function updateGroups() {
  const list = [...players.values()];
  const keys = list.map((p) => locationKey(p.x, p.z));
  const adj = list.map(() => []);
  const now = Date.now();
  const since = new Map();
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      if (keys[i] !== keys[j]) continue;
      const a = list[i];
      const b = list[j];
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      let join = false;
      if (d <= GROUP_JOIN_R) {
        const k = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        const t = nearSince.get(k) ?? now;
        since.set(k, t);
        join = now - t >= GROUP_DWELL_MS;
      }
      const keep = a.group !== null && a.group === b.group && d <= GROUP_KEEP_R; // hysteresis
      if (join || keep) {
        adj[i].push(j);
        adj[j].push(i);
      }
    }
  nearSince = since;
  // Connected components with 2+ members become groups.
  const seen = new Array(list.length).fill(false);
  const comps = [];
  for (let i = 0; i < list.length; i++) {
    if (seen[i] || adj[i].length === 0) continue;
    const comp = [];
    const stack = [i];
    seen[i] = true;
    while (stack.length) {
      const k = stack.pop();
      comp.push(list[k]);
      for (const n of adj[k]) if (!seen[n]) (seen[n] = true), stack.push(n);
    }
    comps.push(comp);
  }
  // Keep a group's id when the component continues it: the old id held by most members wins,
  // and each old id goes to at most one component (the largest overlap).
  const claims = [];
  comps.forEach((comp, ci) => {
    const count = new Map();
    for (const p of comp) if (p.group) count.set(p.group, (count.get(p.group) ?? 0) + 1);
    for (const [gid, n] of count) claims.push({ ci, gid, n });
  });
  claims.sort((a, b) => b.n - a.n);
  const compId = new Array(comps.length).fill(null);
  const usedIds = new Set();
  for (const c of claims) {
    if (compId[c.ci] || usedIds.has(c.gid)) continue;
    compId[c.ci] = c.gid;
    usedIds.add(c.gid);
  }
  const next = new Map(); // player id -> group id
  comps.forEach((comp, ci) => {
    const gid = compId[ci] ?? `g${++groupSeq}`;
    compId[ci] = gid;
    for (const p of comp) next.set(p.id, gid);
  });
  // Apply and notify.
  for (const p of list) {
    const g = next.get(p.id) ?? null;
    if (g !== p.group) {
      if (g === null) io.to(p.id).emit("group:state", null);
      p.group = g;
    }
  }
  const live = new Set();
  comps.forEach((comp, ci) => {
    const gid = compId[ci];
    live.add(gid);
    const members = comp.map(({ id, name, color }) => ({ id, name, color })).sort((a, b) => a.name.localeCompare(b.name));
    const sig = members.map((m) => m.id).join(",");
    if (groupSig.get(gid) !== sig) {
      groupSig.set(gid, sig);
      for (const p of comp) io.to(p.id).emit("group:state", { id: gid, members });
    }
  });
  for (const gid of [...groupSig.keys()]) if (!live.has(gid)) groupSig.delete(gid);
}
setInterval(updateGroups, GROUP_TICK_MS);
// Drop finished vehicles (e.g. everyone disconnected mid-ride).
setInterval(() => {
  const now = Date.now();
  for (const [id, v] of vehicles) if (now > v.start + RIDES[v.ride].duration * 1.3 + 5000) vehicles.delete(id);
}, 10000);

httpServer.listen(PORT, () => {
  console.log(`metaverse server listening on :${PORT}`);
});
