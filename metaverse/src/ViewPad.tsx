// On-screen 3D view controls (top-right corner): turn the camera around yourself, tilt it up / down,
// slide the view up / down / left / right, zoom in / out, and put everything back. Buttons act while
// held (mouse or finger); the scene applies the rates every frame (World.tsx).
import { useEffect, useState, type ReactNode } from "react";
import { view, viewPad } from "./net";

type Key = keyof typeof viewPad;

function Hold({ k, v, label, children }: { k: Key; v: number; label: string; children: ReactNode }) {
  const stop = () => (viewPad[k] = 0);
  return (
    <button
      type="button"
      className="vp-btn"
      aria-label={label}
      title={label}
      data-vp={`${k}${v > 0 ? "+" : "-"}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        viewPad[k] = v;
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

export default function ViewPad() {
  // open on computers, folded on phones (it would cover much of a small screen)
  const [open, setOpen] = useState(() => !window.matchMedia?.("(pointer: coarse)").matches);
  const [yaw, setYaw] = useState(0);
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    const id = setInterval(() => {
      setYaw(view.yaw);
      setChanged(Math.abs(view.yaw) > 0.01 || Math.abs(view.pitch) > 0.01 || Math.abs(view.zoom - 1) > 0.01);
    }, 120);
    return () => clearInterval(id);
  }, []);
  // never leave a button "held" when the pad folds away or the page loses focus
  useEffect(() => {
    const release = () => Object.keys(viewPad).forEach((k) => (viewPad[k as Key] = 0));
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("blur", release);
      release();
    };
  }, [open]);
  const reset = () => {
    view.yaw = 0;
    view.pitch = 0;
    view.zoom = 1;
    view.recenter = true;
  };

  if (!open)
    return (
      <button type="button" className="vp-toggle" onClick={() => setOpen(true)} aria-expanded="false">
        🎥 화면 조절
      </button>
    );
  return (
    <div className="viewpad" role="group" aria-label="화면 조절">
      <div className="vp-head">
        <span>🎥 화면 조절</span>
        <button type="button" className="vp-fold" onClick={() => setOpen(false)} aria-label="화면 조절 접기" aria-expanded="true">
          ✕
        </button>
      </div>
      <div className="vp-row">
        <Hold k="yaw" v={-1} label="왼쪽으로 돌기">⟲</Hold>
        <div className="vp-compass" title="북쪽" aria-hidden>
          <span style={{ transform: `rotate(${yaw}rad)` }}>
            <b>N</b>▲
          </span>
        </div>
        <Hold k="yaw" v={1} label="오른쪽으로 돌기">⟳</Hold>
      </div>
      <div className="vp-label">회전 · 기울기</div>
      <div className="vp-row">
        <Hold k="pitch" v={1} label="위에서 내려다보기">⬆ 높게</Hold>
        <Hold k="pitch" v={-1} label="낮게 보기">⬇ 낮게</Hold>
      </div>
      <div className="vp-label">화면 이동</div>
      <div className="vp-dpad">
        <span />
        <Hold k="panY" v={-1} label="화면 위로">▲</Hold>
        <span />
        <Hold k="panX" v={-1} label="화면 왼쪽으로">◀</Hold>
        <button type="button" className={changed ? "vp-btn vp-reset on" : "vp-btn vp-reset"} onClick={reset} aria-label="원래대로" title="원래대로 (회전·기울기·확대·이동 모두)">
          ⌖
        </button>
        <Hold k="panX" v={1} label="화면 오른쪽으로">▶</Hold>
        <span />
        <Hold k="panY" v={1} label="화면 아래로">▼</Hold>
        <span />
      </div>
      <div className="vp-label">확대 · 축소</div>
      <div className="vp-row">
        <Hold k="zoom" v={-1} label="확대">＋</Hold>
        <Hold k="zoom" v={1} label="축소">－</Hold>
      </div>
    </div>
  );
}
