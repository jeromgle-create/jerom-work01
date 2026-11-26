import { io } from "socket.io-client";

// Same origin in production (server hosts the client); Vite proxies /socket.io in dev.
export const socket = io({ autoConnect: false, transports: ["websocket", "polling"] });

/** Latest authoritative transforms of remote players, mutated outside React for per-frame reads. */
export const remoteTargets = new Map<string, { x: number; z: number; ry: number }>();

/** Shared input state: keyboard keys and virtual joystick vector (-1..1). */
export const input = {
  keys: new Set<string>(),
  joy: { x: 0, y: 0 },
};

/** DOM name-tag elements keyed by player id; positioned each frame by the 3D scene. */
export const labelEls = new Map<string, HTMLDivElement>();

/** Local player's current position (read by proximity voice). */
export const selfPos = { x: 0, z: 0 };

/** Test hook: a pending teleport consumed by the local player (positions are still clamped by the server). */
export const debugTeleport: { pending: { x: number; z: number } | null } = { pending: null };
