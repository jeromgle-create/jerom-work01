// Real-time server: serves the built client and relays avatar/chat state via Socket.IO.
import express from "express";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";
import { Server } from "socket.io";

const PORT = Number(process.env.PORT) || 3001;
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS) || 50;
const WORLD_HALF = 24; // must match client WORLD_HALF
const TICK_MS = 66; // ~15 state broadcasts per second
const CHAT_MAX = 200;
const NAME_MAX = 16;
const CHAT_COOLDOWN_MS = 700;
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

/** @type {Map<string, {id:string,name:string,color:string,x:number,z:number,ry:number,lastChat:number,voice:boolean,muted:boolean}>} */
const players = new Map();
const dirty = new Set();

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
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
    // Spawn on a ring around the central fountain (radius 1.4) so avatars never overlap it.
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
    };
    players.set(socket.id, player);
    ack?.({ ok: true, selfId: socket.id, players: [...players.values()].map(publicPlayer) });
    socket.broadcast.emit("playerJoined", publicPlayer(player));
    io.emit("system", { text: `${name} 님이 입장했습니다.`, ts: Date.now() });
  });

  socket.on("move", (m) => {
    const p = players.get(socket.id);
    if (!p) return;
    p.x = clamp(num(m?.x, p.x), -WORLD_HALF, WORLD_HALF);
    p.z = clamp(num(m?.z, p.z), -WORLD_HALF, WORLD_HALF);
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
    p.lastChat = now;
    io.emit("chat", { id: p.id, name: p.name, color: p.color, text, ts: now });
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

httpServer.listen(PORT, () => {
  console.log(`metaverse server listening on :${PORT}`);
});
