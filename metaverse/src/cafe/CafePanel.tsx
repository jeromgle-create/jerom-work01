// On-screen cafe controls: menu and wallet at the counter, picking up the order, sitting on a stool,
// sipping. Shown only in or by the cafe, and only when there is something to do.
import { useEffect, useState } from "react";
import { MENU, cafe, changed, order, pickUp, sip, useCafe, won } from "./state";
import { CAFE } from "../../shared/layout.js";

export default function CafePanel() {
  const c = useCafe();
  const [, tick] = useState(0);
  // countdown while the barista works
  useEffect(() => {
    if (c.order?.status !== "preparing") return;
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [c.order?.status]);
  const o = c.order;
  const atCounter = c.near === "counter";
  const freeSeat = c.near && c.near !== "counter" ? c.near.seat : null;
  if (!atCounter && !freeSeat && !c.seat && !c.msg && (!o || o.status === "held")) return null;
  const close = () => {
    cafe.menuOpen = false;
    changed();
  };

  return (
    <div className="cafe" role="region" aria-label={CAFE.name}>
      <div className="cafe-head">
        <strong>☕ {CAFE.name}</strong>
        <span className="cafe-wallet" data-testid="wallet">
          💰 {won(c.wallet)}
        </span>
      </div>
      {c.msg && <p className="cafe-msg" aria-live="polite">{c.msg}</p>}
      {o?.status === "preparing" && (
        <p className="cafe-msg">
          바리스타가 {o.item.name} 만드는 중… {Math.max(0, Math.ceil((o.readyAt - performance.now()) / 1000))}초
        </p>
      )}
      {c.menuOpen && atCounter && !o ? (
        <ul className="cafe-menu">
          {MENU.map((m) => (
            <li key={m.id}>
              <button type="button" disabled={c.wallet < m.price} onClick={() => order(m)}>
                <span>{m.name}</span>
                <span>{won(m.price)}</span>
              </button>
            </li>
          ))}
          <li>
            <button type="button" className="cafe-cancel" onClick={close}>
              닫기
            </button>
          </li>
        </ul>
      ) : (
        <div className="cafe-actions">
          {atCounter && !o && (
            <button
              type="button"
              onClick={() => {
                cafe.menuOpen = true;
                cafe.msg = "어서 오세요! 무엇을 드릴까요?";
                changed();
              }}
            >
              📋 메뉴 보고 주문하기
            </button>
          )}
          {atCounter && o?.status === "ready" && (
            <button type="button" onClick={pickUp}>
              🙌 {o.item.name} 받기
            </button>
          )}
          {freeSeat && !c.seat && (
            <button
              type="button"
              onClick={() => {
                cafe.req.sit = freeSeat;
                changed();
              }}
            >
              🪑 여기 앉기
            </button>
          )}
          {c.seat && o?.status === "placed" && o.left > 0 && (
            <button type="button" onClick={sip}>
              {o.item.kind === "cookie" ? "🍪 한 입 먹기" : "☕ 한 모금 마시기"} ({o.left})
            </button>
          )}
          {c.seat && (
            <button
              type="button"
              onClick={() => {
                cafe.req.stand = true;
                changed();
              }}
            >
              🚶 일어나기
            </button>
          )}
          {c.wallet < 3000 && !o && atCounter && (
            <button
              type="button"
              onClick={() => {
                cafe.wallet = 20000;
                cafe.msg = "용돈 20,000원을 받았어요.";
                changed();
              }}
            >
              💵 용돈 받기
            </button>
          )}
        </div>
      )}
    </div>
  );
}
