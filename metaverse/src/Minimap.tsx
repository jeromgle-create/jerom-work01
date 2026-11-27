// Corner minimap of the current zone (campus, a building floor, or the park) with this player's
// position and heading and other players as dots. Tap it to open the full map, which can show any
// zone. Everything is drawn from the same layout data the 3D scene uses.
import { useEffect, useRef, useState } from "react";
import { remoteTargets, selfPos } from "./net";
import { CAMPUS_DOORS, FLOOR_BY_ID, FLOORS, OUTDOOR, PARK, PARK_GATE_MAT, PORTALS, SCHOOL_NAME, zoneAt, type Floor } from "./zones";
import { CONNECTOR, FIELD, GATE, GYM, KINDER, MAIN, NORTH_WING, PODIUM, SOUTH_WING, STANDS_E, STANDS_N } from "./School";
import { FOUNTAIN, GREENHOUSE, LAKE, LOOP, PENS, TENTS } from "./Park";
import { LIFT_LINE } from "../shared/layout.js";
import type { Player } from "./types";

type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };
type Ctx = CanvasRenderingContext2D;
type Tx = { x: (v: number) => number; z: (v: number) => number; s: number };

const COLORS = {
  grass: "#9cc77e",
  building: "#e9dcc0",
  buildingLine: "#a8553f",
  field: "#d8b98c",
  paved: "#d7cfbf",
  water: "#4ea8de",
  room: "#f4ead3",
  corridor: "#d4d8ce",
  text: "#2b2d42",
  mat: "#3bb273",
  ride: "#e09f3e",
};

function zoneBounds(zone: string): Bounds {
  if (zone === "outdoor") return OUTDOOR;
  if (zone === "park") return PARK;
  const f = FLOOR_BY_ID[zone];
  return { minX: f.cx + f.minX, maxX: f.cx + f.maxX, minZ: f.cz + f.minZ, maxZ: f.cz + f.maxZ };
}

function makeTx(b: Bounds, w: number, h: number, pad: number): Tx {
  const s = Math.min((w - 2 * pad) / (b.maxX - b.minX), (h - 2 * pad) / (b.maxZ - b.minZ));
  const ox = (w - (b.maxX - b.minX) * s) / 2;
  const oz = (h - (b.maxZ - b.minZ) * s) / 2;
  return { x: (v) => ox + (v - b.minX) * s, z: (v) => oz + (v - b.minZ) * s, s };
}

function rect(c: Ctx, t: Tx, r: Bounds, fill: string, stroke?: string) {
  c.fillStyle = fill;
  c.fillRect(t.x(r.minX), t.z(r.minZ), (r.maxX - r.minX) * t.s, (r.maxZ - r.minZ) * t.s);
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = 1;
    c.strokeRect(t.x(r.minX), t.z(r.minZ), (r.maxX - r.minX) * t.s, (r.maxZ - r.minZ) * t.s);
  }
}
function label(c: Ctx, t: Tx, x: number, z: number, text: string, size: number, color = COLORS.text) {
  c.fillStyle = color;
  c.font = `600 ${size}px system-ui, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(text, t.x(x), t.z(z));
}
const rr = (minX: number, maxX: number, minZ: number, maxZ: number): Bounds => ({ minX, maxX, minZ, maxZ });

function drawCampus(c: Ctx, t: Tx, big: boolean) {
  rect(c, t, OUTDOOR, COLORS.grass);
  rect(c, t, FIELD, COLORS.field);
  rect(c, t, rr(-36, 4, -19, -9), COLORS.paved);
  for (const r of [...STANDS_N, STANDS_E, PODIUM]) rect(c, t, r, "#c7c1b5");
  for (const b of [NORTH_WING, SOUTH_WING, CONNECTOR, MAIN, KINDER, GYM]) rect(c, t, b, COLORS.building, COLORS.buildingLine);
  rect(c, t, rr(GYM.minX, GYM.maxX, GYM.minZ, GYM.maxZ), "#9fc3e6", COLORS.buildingLine);
  for (const d of CAMPUS_DOORS) rect(c, t, d.mat, COLORS.mat);
  rect(c, t, PARK_GATE_MAT, COLORS.ride);
  const f = big ? 13 : 8;
  label(c, t, (NORTH_WING.minX + NORTH_WING.maxX) / 2, (NORTH_WING.minZ + NORTH_WING.maxZ) / 2, "북관", f);
  label(c, t, (SOUTH_WING.minX + SOUTH_WING.maxX) / 2, (SOUTH_WING.minZ + SOUTH_WING.maxZ) / 2, "남관", f);
  label(c, t, (MAIN.minX + MAIN.maxX) / 2, (MAIN.minZ + MAIN.maxZ) / 2, "본관", f);
  label(c, t, (GYM.minX + GYM.maxX) / 2, (GYM.minZ + GYM.maxZ) / 2, "체육관", f);
  label(c, t, (FIELD.minX + FIELD.maxX) / 2, (FIELD.minZ + FIELD.maxZ) / 2, "운동장", f);
  if (big) {
    label(c, t, (KINDER.minX + KINDER.maxX) / 2, (KINDER.minZ + KINDER.maxZ) / 2, "유치원·현관", 11);
    label(c, t, -16, -14, "중정", 11);
    label(c, t, (GATE.minX + GATE.maxX) / 2, OUTDOOR.maxZ - 1.2, "정문 → 서울대공원", 11, "#7a4b00");
  }
}

function drawFloor(c: Ctx, t: Tx, f: Floor, big: boolean) {
  const ox = f.cx;
  const oz = f.cz;
  rect(c, t, rr(ox + f.minX, ox + f.maxX, oz + f.minZ, oz + f.maxZ), COLORS.corridor);
  for (const r of f.rooms) {
    const b = rr(ox + r.minX, ox + r.maxX, oz + r.minZ, oz + r.maxZ);
    if (r.kind === "void") {
      rect(c, t, b, "#bdb3a0");
      continue;
    }
    rect(c, t, b, r.kind === "stairs" ? "#e8e1d3" : r.kind === "hall" || r.kind === "entrance" ? "#ece6da" : COLORS.room, "#8fb39a");
    if (big || (r.maxX - r.minX) * t.s > 26) {
      const name = r.name.replace(/\(.+\)/, "");
      const size = Math.max(7, Math.min(big ? 12 : 9, ((r.maxX - r.minX) * t.s) / Math.max(2, name.length) * 1.1));
      label(c, t, ox + (r.minX + r.maxX) / 2, oz + (r.minZ + r.maxZ) / 2, name, size);
    }
  }
  for (const p of PORTALS.filter((q) => q.from === f.id)) rect(c, t, p, p.kind === "exit" ? COLORS.mat : p.kind === "up" ? "#4f86c6" : "#e09f3e");
}

function drawPark(c: Ctx, t: Tx, big: boolean) {
  const P = PARK.cx;
  rect(c, t, PARK, COLORS.grass);
  // train loop and lake
  c.strokeStyle = COLORS.paved;
  c.lineWidth = Math.max(2, 3 * t.s);
  c.beginPath();
  c.ellipse(t.x(P + LOOP.x), t.z(LOOP.z), LOOP.rx * t.s, LOOP.rz * t.s, 0, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = COLORS.water;
  c.beginPath();
  c.arc(t.x(P + LAKE.x), t.z(LAKE.z), LAKE.r * t.s, 0, Math.PI * 2);
  c.fill();
  rect(c, t, rr(P - 17, P + 17, 44, 60), COLORS.paved);
  for (const pen of PENS) rect(c, t, rr(P + pen.rect[0], P + pen.rect[1], pen.rect[2], pen.rect[3]), "#cdb88a", "#8d6e63");
  rect(c, t, rr(P - 60, P - 36, -20, 14), "#f2b5c9");
  rect(c, t, rr(P + GREENHOUSE.x - GREENHOUSE.w / 2, P + GREENHOUSE.x + GREENHOUSE.w / 2, GREENHOUSE.z - GREENHOUSE.d / 2, GREENHOUSE.z + GREENHOUSE.d / 2), "#bde0fe", "#457b9d");
  c.fillStyle = "#90e0ef";
  c.beginPath();
  c.arc(t.x(P + FOUNTAIN.x), t.z(FOUNTAIN.z), Math.max(2, FOUNTAIN.r * t.s), 0, Math.PI * 2);
  c.fill();
  for (const [x, z, col] of TENTS) {
    c.fillStyle = col;
    c.fillRect(t.x(P + x) - 1.6 * t.s, t.z(z) - 1.6 * t.s, 3.2 * t.s, 3.2 * t.s);
  }
  rect(c, t, rr(P + 29, P + 67, 24, 58), "#b5e48c");
  // sky lift
  c.strokeStyle = "#333";
  c.lineWidth = 1;
  c.setLineDash([4, 3]);
  c.beginPath();
  c.moveTo(t.x(P + LIFT_LINE.a[0]), t.z(LIFT_LINE.a[1]));
  c.lineTo(t.x(P + LIFT_LINE.b[0]), t.z(LIFT_LINE.b[1]));
  c.stroke();
  c.setLineDash([]);
  for (const p of PORTALS.filter((q) => q.from === "park")) rect(c, t, p, p.kind === "exit" ? COLORS.mat : COLORS.ride);
  const f = big ? 12 : 8;
  label(c, t, P + LAKE.x, LAKE.z, "호수", f, "#ffffff");
  label(c, t, P + 45, -36, "동물원", f);
  label(c, t, P - 48, -3, "장미원", f);
  label(c, t, P - 48, -40, "식물원", f);
  label(c, t, P - 50, 40, "캠핑장", f);
  label(c, t, P + 48, 41, "잔디광장", f);
  label(c, t, P, 52, "정문", f);
  if (big) for (const pen of PENS) label(c, t, P + (pen.rect[0] + pen.rect[1]) / 2, (pen.rect[2] + pen.rect[3]) / 2, pen.name, 10);
}

function drawPlayers(c: Ctx, t: Tx, zone: string, players: Record<string, Player>, selfId: string, big: boolean) {
  for (const [id, p] of remoteTargets) {
    if (id === selfId || zoneAt(p.x) !== zone) continue;
    c.fillStyle = players[id]?.color ?? "#4f86c6";
    c.strokeStyle = "#ffffff";
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(t.x(p.x), t.z(p.z), big ? 5 : 3.5, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    if (big && players[id]) label(c, t, p.x, p.z - 9 / t.s, players[id].name, 10);
  }
  if (zoneAt(selfPos.x) !== zone) return;
  // self: arrow pointing where the avatar faces (ry 0 = south = down on the map)
  const x = t.x(selfPos.x);
  const z = t.z(selfPos.z);
  const r = big ? 9 : 6.5;
  const a = selfPos.ry;
  c.save();
  c.translate(x, z);
  c.rotate(-a);
  c.fillStyle = "#e63946";
  c.strokeStyle = "#ffffff";
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(0, r);
  c.lineTo(r * 0.7, -r * 0.6);
  c.lineTo(0, -r * 0.25);
  c.lineTo(-r * 0.7, -r * 0.6);
  c.closePath();
  c.stroke();
  c.fill();
  c.restore();
}

function draw(canvas: HTMLCanvasElement, zone: string, players: Record<string, Player>, selfId: string, big: boolean) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  if (canvas.width !== Math.round(w * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const c = canvas.getContext("2d")!;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  const t = makeTx(zoneBounds(zone), w, h, big ? 12 : 4);
  if (zone === "outdoor") drawCampus(c, t, big);
  else if (zone === "park") drawPark(c, t, big);
  else drawFloor(c, t, FLOOR_BY_ID[zone], big);
  drawPlayers(c, t, zone, players, selfId, big);
}

const zoneName = (z: string) => (z === "outdoor" ? `${SCHOOL_NAME} 캠퍼스` : z === "park" ? PARK.name : FLOOR_BY_ID[z].label);
const shortName = (z: string) => (z === "outdoor" ? "학교" : z === "park" ? "대공원" : FLOOR_BY_ID[z].label);

export default function Minimap({ players, selfId }: { players: Record<string, Player>; selfId: string }) {
  const small = useRef<HTMLCanvasElement>(null);
  const large = useRef<HTMLCanvasElement>(null);
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<string | null>(null); // zone chosen in the full map (null = where I am)
  const [here, setHere] = useState("outdoor");
  const playersRef = useRef(players);
  playersRef.current = players;

  useEffect(() => {
    const tick = () => {
      const z = zoneAt(selfPos.x);
      setHere((prev) => (prev === z ? prev : z));
      if (small.current) draw(small.current, z, playersRef.current, selfId, false);
      if (large.current) draw(large.current, pick ?? z, playersRef.current, selfId, true);
    };
    tick();
    const id = setInterval(tick, 150);
    return () => clearInterval(id);
  }, [selfId, pick, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const shown = pick ?? here;
  const buildings = ["북관", "남관", "본관"];
  return (
    <>
      <button type="button" className="minimap" onClick={() => setOpen(true)} aria-label="전체 지도 열기">
        <canvas ref={small} />
        <span className="minimap-title">{shortName(here)} · 크게 보기</span>
      </button>
      {open && (
        <div className="map-overlay" role="dialog" aria-label="전체 지도" onClick={() => setOpen(false)}>
          <div className="map-card" onClick={(e) => e.stopPropagation()}>
            <div className="map-head">
              <b>🗺️ {zoneName(shown)}</b>
              {shown !== here && <span className="map-note">(나는 {zoneName(here)}에 있어요)</span>}
              <button type="button" className="map-close" onClick={() => setOpen(false)} aria-label="닫기">
                ✕
              </button>
            </div>
            <div className="map-tabs">
              <button type="button" className={shown === here && pick === null ? "on" : ""} onClick={() => setPick(null)}>
                📍 내 위치
              </button>
              <button type="button" className={shown === "outdoor" ? "on" : ""} onClick={() => setPick("outdoor")}>
                학교
              </button>
              <button type="button" className={shown === "park" ? "on" : ""} onClick={() => setPick("park")}>
                서울대공원
              </button>
              {buildings.map((b) => (
                <span key={b} className="map-floors">
                  {b}
                  {FLOORS.filter((f) => f.building === b).map((f) => (
                    <button key={f.id} type="button" className={shown === f.id ? "on" : ""} onClick={() => setPick(f.id)}>
                      {f.level}층
                    </button>
                  ))}
                </span>
              ))}
            </div>
            <canvas ref={large} className="map-canvas" />
            <p className="map-legend">
              <span className="lg self">▼ 나</span> <span className="lg other">● 다른 사람</span> <span className="lg mat">■ 출입구·계단</span>{" "}
              <span className="lg ride">■ 탈것·대공원 가는 길</span>
            </p>
          </div>
        </div>
      )}
    </>
  );
}
