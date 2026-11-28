// Regular customers of the lawn cafe (민지·준호·서연). Each one follows a fixed 3-minute routine
// computed only from the server clock, so every visitor sees them in the same place doing the same
// thing without any network traffic: walk in from the lawn, order at the counter, carry the drink to
// the reserved table, sit and drink, walk away. Their table (CAFE.tables[2]) is reserved for them,
// so they never need a seat a player is using. Park-local coordinates.
import { CAFE_MENU, CAFE_SEATS } from "../shared/layout.js";

type P = { x: number; z: number };
export const NPCS = [
  { name: "민지", color: "#d9576b", lines: ["안녕하세요! 여기 딸기라떼가 정말 맛있어요.", "저는 주말마다 여기 와요.", "호수 둘레길에 강아지도 있어요!"] },
  { name: "준호", color: "#5e8c3a", lines: ["오늘 날씨 좋네요.", "코끼리열차 타 봤어요?", "쿠키가 금방 나와서 좋아요."] },
  { name: "서연", color: "#e3b23c", lines: ["반가워요!", "잔디광장에서 돗자리 펴고 놀았어요.", "레모네이드 추천해요."] },
];
export const NPC_CYCLE = 180_000; // ms; NPC i starts i·60 s later, so only one sits at a time
const SPEED = 1.4; // m/s
const ORDER_WAIT = 8_000; // ms at the counter (order + barista making it)
const SIT = 50_000;
const SIPS = [10_000, 25_000, 40_000]; // ms after sitting down
export const NPC_SIP_MS = 2_200;

const ENTRY: P[] = [
  { x: 30, z: 52 },
  { x: 48, z: 39.5 },
  { x: 61.4, z: 39.6 }, // counter, right of where players stand
];
/** NPC i sits on one of the two reserved stools (approached from the north side of the table). */
const npcSeat = (i: number) => CAFE_SEATS.findIndex((s) => s.npc) + (i % 2);
const toSeat = (i: number): P[] => {
  const s = CAFE_SEATS[npcSeat(i)];
  return [ENTRY[2], { x: 60, z: 40.8 }, { x: 60, z: 45.9 }, { x: s.x, z: s.z - 0.8 }];
};

type Leg = { pts: P[]; len: number[]; total: number };
const leg = (pts: P[]): Leg => {
  const len = pts.slice(1).map((p, k) => Math.hypot(p.x - pts[k].x, p.z - pts[k].z));
  return { pts, len, total: len.reduce((a, b) => a + b, 0) };
};
/** Position and heading after walking d metres along a leg. */
function along(l: Leg, d: number) {
  let k = 0;
  while (k < l.len.length - 1 && d > l.len[k]) d -= l.len[k++];
  const a = l.pts[k], b = l.pts[k + 1];
  const u = Math.min(1, Math.max(0, d / l.len[k]));
  return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, ry: Math.atan2(b.x - a.x, b.z - a.z) };
}

export type NpcPhase = "away" | "in" | "order" | "toSeat" | "sit" | "out";
export type NpcPose = {
  visible: boolean;
  phase: NpcPhase;
  /** server time this phase started (to fire one bubble per phase) */
  phaseStart: number;
  x: number;
  z: number;
  ry: number;
  seated: boolean;
  seat: number;
  item: number;
  /** where the drink is: in the hand, on the table, or gone */
  cup: "hand" | "table" | null;
  /** 0..1 while lifting the drink to the mouth, else 0 */
  sip: number;
  left: number;
};

/** What NPC i is doing at server time `now` (ms). Same answer on every client. */
export function npcAt(i: number, now: number): NpcPose {
  const t0 = now - i * 60_000;
  const cycle = Math.floor(t0 / NPC_CYCLE);
  const base = cycle * NPC_CYCLE + i * 60_000;
  let t = t0 - cycle * NPC_CYCLE;
  const item = (cycle + i * 2) % CAFE_MENU.length;
  const seat = npcSeat(i);
  const inL = leg(ENTRY), seatL = leg(toSeat(i)), outL = leg([...toSeat(i)].reverse().slice(0, -1).concat([...ENTRY].reverse().slice(1)));
  const dIn = (inL.total / SPEED) * 1000, dSeat = (seatL.total / SPEED) * 1000, dOut = (outL.total / SPEED) * 1000;
  const sips = CAFE_MENU[item].sips;
  const pose = (phase: NpcPhase, start: number, p: { x: number; z: number; ry: number }, extra: Partial<NpcPose> = {}): NpcPose => ({
    visible: true, phase, phaseStart: base + start, ...p, seated: false, seat, item, cup: null, sip: 0, left: sips, ...extra,
  });
  if (t < dIn) return pose("in", 0, along(inL, (t / 1000) * SPEED));
  t -= dIn;
  if (t < ORDER_WAIT) return pose("order", dIn, { ...ENTRY[2], ry: Math.PI }, { cup: t > ORDER_WAIT - 1500 ? "hand" : null });
  t -= ORDER_WAIT;
  if (t < dSeat) return pose("toSeat", dIn + ORDER_WAIT, along(seatL, (t / 1000) * SPEED), { cup: "hand" });
  t -= dSeat;
  const s = CAFE_SEATS[seat];
  if (t < SIT) {
    const done = SIPS.slice(0, sips).filter((at) => t >= at + NPC_SIP_MS).length;
    const now1 = SIPS.slice(0, sips).find((at) => t >= at && t < at + NPC_SIP_MS);
    const sip = now1 === undefined ? 0 : Math.sin(((t - now1) / NPC_SIP_MS) * Math.PI);
    return pose("sit", dIn + ORDER_WAIT + dSeat, { x: s.x, z: s.z, ry: s.ry }, { seated: true, cup: "table", sip, left: sips - done });
  }
  t -= SIT;
  if (t < dOut) return pose("out", dIn + ORDER_WAIT + dSeat + SIT, along(outL, (t / 1000) * SPEED), { cup: "hand", left: 0 });
  return { ...pose("away", dIn + ORDER_WAIT + dSeat + SIT + dOut, { ...ENTRY[0], ry: 0 }), visible: false };
}

/** Something to say when a player talks to NPC i (alternates a situation line and a personal line). */
export function npcLine(i: number, pose: NpcPose, count: number) {
  const item = CAFE_MENU[pose.item].name;
  const byPhase: Record<NpcPhase, string> = {
    away: "",
    in: "카페에 가는 길이에요.",
    order: `${item} 기다리는 중이에요.`,
    toSeat: "예약석에 앉으러 가요.",
    sit: pose.left > 0 ? `${item} 맛있네요!` : "다 마셨어요. 이제 가 봐야겠어요.",
    out: "다음에 또 봐요!",
  };
  return count % 2 === 0 ? byPhase[pose.phase] : NPCS[i].lines[Math.floor(count / 2) % NPCS[i].lines.length];
}
