// The park cafe's ordering state for this player (wallet, current order, nearby counter / stool),
// shared by the 3D scene (Cafe.tsx, World.tsx) and the on-screen panel (CafePanel.tsx).
// Orders are this player's own; who sits on which stool is shared through the server ("sit").
import { useSyncExternalStore } from "react";

export type MenuItem = { id: string; name: string; price: number; prep: number; kind: "cup" | "cookie"; color: string; bites: number };
export const MENU: MenuItem[] = [
  { id: "americano", name: "아메리카노", price: 4500, prep: 4, kind: "cup", color: "#3b2416", bites: 3 },
  { id: "latte", name: "카페라떼", price: 5000, prep: 5, kind: "cup", color: "#c8a27a", bites: 3 },
  { id: "vanilla", name: "바닐라라떼", price: 5500, prep: 6, kind: "cup", color: "#e6cfa3", bites: 3 },
  { id: "greentea", name: "녹차라떼", price: 5500, prep: 6, kind: "cup", color: "#8db86b", bites: 3 },
  { id: "cookie", name: "초코 쿠키", price: 3000, prep: 2, kind: "cookie", color: "#6b4226", bites: 2 },
];
export const WALLET_START = 20000;

export type Order = {
  item: MenuItem;
  /** preparing → ready (on the counter) → held (in hand) → placed (on the table while seated) */
  status: "preparing" | "ready" | "held" | "placed";
  readyAt: number;
  /** sips / bites left */
  left: number;
};
export type Near = "counter" | { seat: string } | null;

export const cafe = {
  wallet: WALLET_START,
  order: null as Order | null,
  /** what the player stands next to (counter, or a free stool) */
  near: null as Near,
  /** stool this player sits on */
  seat: null as string | null,
  /** a sip / bite in progress (performance.now() when it ends) */
  sipUntil: 0,
  menuOpen: false,
  msg: "",
  /** requests from the panel to the player in the 3D scene */
  req: { sit: null as string | null, stand: false },
};

let version = 0;
const listeners = new Set<() => void>();
export function changed() {
  version++;
  for (const f of listeners) f();
}
export function useCafe() {
  useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => version,
  );
  return cafe;
}

export const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
export const SIP_MS = 2200;

export function order(item: MenuItem) {
  if (cafe.order || cafe.wallet < item.price) return false;
  cafe.wallet -= item.price;
  cafe.order = { item, status: "preparing", readyAt: performance.now() + item.prep * 1000, left: item.bites };
  cafe.menuOpen = false;
  cafe.msg = `${item.name} 주문 완료! 바리스타가 만들고 있어요.`;
  changed();
  return true;
}
export function pickUp() {
  if (cafe.order?.status !== "ready") return;
  cafe.order.status = "held";
  cafe.msg = `${cafe.order.item.name}을(를) 받았어요. 빈 자리에 앉아 보세요.`;
  changed();
}
export function sip() {
  const o = cafe.order;
  const now = performance.now();
  if (o?.status !== "placed" || now < cafe.sipUntil) return;
  cafe.sipUntil = now + SIP_MS;
  o.left--;
  const done = o.left <= 0;
  cafe.msg = done ? (o.item.kind === "cookie" ? "쿠키를 다 먹었어요. 맛있다!" : "다 마셨어요. 잘 마셨습니다!") : o.item.kind === "cookie" ? "냠냠…" : "후루룩…";
  changed();
  if (done) setTimeout(() => {
    if (cafe.order === o) {
      cafe.order = null;
      changed();
    }
  }, SIP_MS);
}
