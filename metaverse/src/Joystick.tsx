import { useRef, useState } from "react";
import { input } from "./net";

const RADIUS = 48;

/** Touch/pointer joystick; writes a -1..1 vector to input.joy (x: right, y: down/back). */
export default function Joystick() {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const active = useRef<number | null>(null);

  const update = (clientX: number, clientY: number) => {
    const r = base.current!.getBoundingClientRect();
    let dx = clientX - (r.left + r.width / 2);
    let dy = clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > RADIUS) {
      dx = (dx / d) * RADIUS;
      dy = (dy / d) * RADIUS;
    }
    setKnob({ x: dx, y: dy });
    input.joy.x = dx / RADIUS;
    input.joy.y = dy / RADIUS;
  };
  const end = () => {
    active.current = null;
    setKnob({ x: 0, y: 0 });
    input.joy.x = 0;
    input.joy.y = 0;
  };

  return (
    <div
      ref={base}
      className="joystick"
      onPointerDown={(e) => {
        active.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => active.current === e.pointerId && update(e.clientX, e.clientY)}
      onPointerUp={end}
      onPointerCancel={end}
      aria-hidden
    >
      <div className="knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}
