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

/**
 * Floating thumb joystick (phones): a touch that starts in the lower part of the screen becomes a
 * joystick centred where the thumb landed — left or right hand alike. The scene's pointer handler
 * drives it; Joystick.tsx draws it. Knob offset in px; `used` hides the first-time hint.
 */
export const joyUi = { active: false, x: 0, y: 0, kx: 0, ky: 0, used: false };
export const JOY_RADIUS = 48;
/** Lower share of the screen where a touch starts the joystick (above it, a drag still pans). */
export const JOY_ZONE = 0.4;
const joyListeners = new Set<() => void>();
export const onJoyUi = (f: () => void) => (joyListeners.add(f), () => void joyListeners.delete(f));
export const joyChanged = () => joyListeners.forEach((f) => f());

/** DOM name-tag elements keyed by player id; positioned each frame by the 3D scene. */
export const labelEls = new Map<string, HTMLDivElement>();

/** Local player's current position (read by proximity voice). */
export const selfPos = { x: 0, z: 0, y: 0, ry: 0 };

/** A pending jump consumed by the local player: the server's snap-back (`correct`) or the test build's teleport hook. */
export const debugTeleport: { pending: { x: number; z: number } | null; corrections: number } = { pending: null, corrections: 0 };

// ---------- rides ----------
export type RideState = { ride: number; dir: "ab" | "ba"; start: number; vehicle: string; seat: number }; // start: departure, server time (ms)
/** Active rides by player id (including this player), from the server. */
export const rides = new Map<string, RideState>();
/** Offset to convert local Date.now() into server time; set when joining. */
export const clock = { offset: 0 };
export const serverNow = () => Date.now() + clock.offset;

/** Camera zoom chosen by pinch / mouse wheel (1 = default distance). */
export const view = {
  zoom: 1,
  /** Camera pan from dragging the screen, as a ground offset from the player (world units). */
  pan: { x: 0, z: 0 },
  dragging: false,
  /** Ease the camera back onto the player ("내 위치로"). */
  recenter: false,
  /** Camera turned around the player (radians, 0 = looking north) and tilted (added elevation). */
  yaw: 0,
  pitch: 0,
};
/** Held buttons of the on-screen view pad: rates per second, applied by the scene every frame. */
export const viewPad = { yaw: 0, pitch: 0, zoom: 0, panX: 0, panY: 0 };
export const PITCH_MIN = 0.12; // lowest camera elevation (rad above the ground)
export const PITCH_MAX = 1.5; // almost straight down
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 8; // pinch out / wheel: up to 8x the default camera distance

/** Click / tap-to-move order from the pointer handler to the local player (seq bumps on each click). */
export const moveOrder: { seq: number; x: number; z: number; active: boolean } = { seq: 0, x: 0, z: 0, active: false };

// ---------- lawn cafe ----------
export type CafeOrder = { item: number; readyAt: number; stage: "making" | "ready" | "held" | "placed"; seat: number | null; left: number; sipUntil: number };
export type CafeState = { seat: number | null; order: CafeOrder | null };
/** Cafe seat and order of every player (this one included), from the server. readyAt / sipUntil are server time. */
export const cafe = new Map<string, CafeState>();
/** Speech bubbles raised by the scene (barista, cafe customers) for the HUD to show. */
export const bubbleBus = new EventTarget();
export const sayBubble = (id: string, text: string, ms = 4500) =>
  bubbleBus.dispatchEvent(new CustomEvent("say", { detail: { id, text, ms } }));
