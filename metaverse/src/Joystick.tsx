// Floating thumb joystick for phones: it appears wherever a thumb touches the lower part of the
// screen (left or right hand) and follows it until the thumb lifts. The scene's pointer handler
// (World.tsx ClickToMove) drives it through `joyUi`; this only draws it. Before the first use a faint
// hint shows where to touch.
import { useEffect, useState } from "react";
import { JOY_ZONE, joyUi, onJoyUi } from "./net";

export default function Joystick() {
  const [, redraw] = useState(0);
  useEffect(() => onJoyUi(() => redraw((n) => n + 1)), []);
  if (!joyUi.active)
    return joyUi.used ? null : (
      <div className="joy-hint" style={{ height: `${JOY_ZONE * 100}%` }} aria-hidden>
        <span>👍 화면 아래쪽 아무 데나 엄지로 누르고 밀면 이동</span>
      </div>
    );
  return (
    <div className="joystick on" style={{ left: joyUi.x, top: joyUi.y }} aria-hidden>
      <div className="knob" style={{ transform: `translate(${joyUi.kx}px, ${joyUi.ky}px)` }} />
    </div>
  );
}
