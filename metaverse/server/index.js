// Real-time server: serves the built client and relays avatar/chat state via Socket.IO.
import express from "express";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";
import { Server } from "socket.io";

const PORT = Number(process.env.PORT) || 3001;
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS) || 50;
// Walkable rectangles: campus + building floors 1-2 + auditorium. Must match ZONES in src/zones.ts.
const ZONES = [
  { cx: 0, cz: 0, hw: 24, hd: 24 },
  { cx: 100, cz: 0, hw: 21, hd: 12 },
  { cx: 200, cz: 0, hw: 21, hd: 12 },
  { cx: 300, cz: 0, hw: 15, hd: 10 },
];
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
/**
 * Coarse location key so walls separate conversations: campus, auditorium, and on each building
 * floor the corridor or one of six rooms. Must match the floor plan in src/zones.ts.
 */
function locationKey(x, z) {
  if (x < 60) return "outdoor";
  if (x >= 250) return "hall";
  const floor = x < 150 ? "f1" : "f2";
  const lx = x - (x < 150 ? 100 : 200);
  if (z > -2 && z < 2) return `${floor}:corridor`;
  const col = lx < -7 ? 0 : lx < 7 ? 1 : 2;
  return `${floor}:${z < 0 ? "n" : "s"}${col}`;
}

/** Clamp a position into the nearest walkable zone. */
function clampToZones(x, z) {
  let best = null;
  for (const zn of ZONES) {
    const cx = clamp(x, zn.cx - zn.hw, zn.cx + zn.hw);
    const cz = clamp(z, zn.cz - zn.hd, zn.cz + zn.hd);
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
const publicPlayer = ({ id, name, color, x, z, ry, voice, muted }) => ({ id, name, color, x, z, ry, voice, muted });
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
    // Spawn on a ring around the center of the school field (kept free of scenery).
    const angle = Math.random() * Math.PI * 2;
    const radius = 2.5 + Math.random() * 2.5;
    const player = {
      id: socket.id,
      name,
      color,
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      ry: 0,
      lastChat: 0,
      voice: false,
      muted: false,
      group: null,
    };
    players.set(socket.id, player);
    ack?.({ ok: true, selfId: socket.id, players: [...players.values()].map(publicPlayer) });
    socket.broadcast.emit("playerJoined", publicPlayer(player));
    io.emit("system", { text: `${name} 님이 입장했습니다.`, ts: Date.now() });
  });

  socket.on("move", (m) => {
    const p = players.get(socket.id);
    if (!p) return;
    const c = clampToZones(num(m?.x, p.x), num(m?.z, p.z));
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

  socket.on("disconnect", () => {
    const p = players.get(socket.id);
    if (!p) return;
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

httpServer.listen(PORT, () => {
  console.log(`metaverse server listening on :${PORT}`);
});
