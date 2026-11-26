import { useCallback, useEffect, useRef, useState } from "react";
import { socket, remoteTargets, labelEls } from "./net";
import type { ChatMsg, Player } from "./types";
import World from "./World";
import Chat from "./Chat";
import Joystick from "./Joystick";

type JoinAck = { ok: true; selfId: string; players: Player[] } | { ok: false; error: string };
type Bubble = { text: string; until: number };

const COLORS = ["#4f8cff", "#ff6b6b", "#ffb84d", "#3ecf8e", "#b57cff", "#ff7ac6", "#2bc4d8", "#8a8f98"];
const BUBBLE_MS = 5000;

export default function App() {
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("mv:name") ?? "";
    } catch {
      return "";
    }
  });
  const [color, setColor] = useState(COLORS[0]);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [selfId, setSelfId] = useState("");
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [selfStart, setSelfStart] = useState<Player | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [bubbles, setBubbles] = useState<Record<string, Bubble>>({});
  const joinInfo = useRef<{ name: string; color: string } | null>(null);

  const doJoin = useCallback(() => {
    const info = joinInfo.current;
    if (!info) return;
    socket.emit("join", info, (ack: JoinAck) => {
      if (!ack.ok) {
        setError(ack.error);
        setJoined(false);
        joinInfo.current = null;
        socket.disconnect();
        return;
      }
      remoteTargets.clear();
      const map: Record<string, Player> = {};
      for (const p of ack.players) {
        map[p.id] = p;
        if (p.id !== ack.selfId) remoteTargets.set(p.id, { x: p.x, z: p.z, ry: p.ry });
      }
      setSelfId(ack.selfId);
      setSelfStart(map[ack.selfId]);
      setPlayers(map);
      setJoined(true);
    });
  }, []);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      doJoin(); // also re-joins after an automatic reconnect (socket id changes)
    };
    const onDisconnect = () => setConnected(false);
    const onJoined = (p: Player) => {
      remoteTargets.set(p.id, { x: p.x, z: p.z, ry: p.ry });
      setPlayers((prev) => ({ ...prev, [p.id]: p }));
    };
    const onLeft = (id: string) => {
      remoteTargets.delete(id);
      setPlayers((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    };
    const onState = (updates: [string, number, number, number][]) => {
      for (const [id, x, z, ry] of updates) {
        if (id === socket.id) continue;
        const t = remoteTargets.get(id);
        if (t) {
          t.x = x;
          t.z = z;
          t.ry = ry;
        }
      }
    };
    const pushMsg = (m: ChatMsg) => setMessages((prev) => [...prev.slice(-99), m]);
    const onChat = (m: ChatMsg) => {
      pushMsg(m);
      if (m.id) setBubbles((prev) => ({ ...prev, [m.id!]: { text: m.text, until: Date.now() + BUBBLE_MS } }));
    };
    const onSystem = (m: ChatMsg) => pushMsg({ ...m, system: true });

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("playerJoined", onJoined);
    socket.on("playerLeft", onLeft);
    socket.on("state", onState);
    socket.on("chat", onChat);
    socket.on("system", onSystem);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("playerJoined", onJoined);
      socket.off("playerLeft", onLeft);
      socket.off("state", onState);
      socket.off("chat", onChat);
      socket.off("system", onSystem);
    };
  }, [doJoin]);

  // Expire chat bubbles.
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setBubbles((prev) => {
        const entries = Object.entries(prev).filter(([, b]) => b.until > now);
        return entries.length === Object.keys(prev).length ? prev : Object.fromEntries(entries);
      });
    }, 500);
    return () => clearInterval(t);
  }, []);

  const submitJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim().slice(0, 16);
    if (!n) return;
    try {
      localStorage.setItem("mv:name", n);
    } catch {
      /* storage unavailable */
    }
    setError("");
    joinInfo.current = { name: n, color };
    if (socket.connected) doJoin();
    else socket.connect();
  };

  const sendChat = (text: string) => socket.emit("chat", { text });

  if (!joined || !selfStart) {
    return (
      <div className="join">
        <form className="card" onSubmit={submitJoin}>
          <h1>Jerom World</h1>
          <p className="muted">닉네임과 색상을 고르고 입장하세요. 다른 접속자와 실시간으로 만나고 대화할 수 있습니다.</p>
          <label htmlFor="nick">닉네임</label>
          <input
            id="nick"
            value={name}
            maxLength={16}
            autoFocus
            placeholder="최대 16자"
            onChange={(e) => setName(e.target.value)}
          />
          <span className="label">아바타 색상</span>
          <div className="swatches" role="radiogroup" aria-label="아바타 색상">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={c === color}
                aria-label={c}
                className={c === color ? "swatch on" : "swatch"}
                style={{ background: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
          {error && <p className="error">{error}</p>}
          <button className="primary" type="submit" disabled={!name.trim() || (joinInfo.current !== null && !joined)}>
            {joinInfo.current !== null && !joined ? "접속 중…" : "입장하기"}
          </button>
          <p className="muted small">이동: WASD / 방향키 · 채팅: Enter · 모바일: 왼쪽 아래 조이스틱</p>
        </form>
      </div>
    );
  }

  const list = Object.values(players);
  return (
    <div className="app">
      <World selfId={selfId} selfStart={selfStart} players={list} />
      <div className="labels" aria-hidden>
        {list.map((p) => (
          <div
            key={p.id}
            className="tag"
            ref={(el) => {
              if (el) labelEls.set(p.id, el);
              else labelEls.delete(p.id);
            }}
          >
            {bubbles[p.id] && <div className="bubble">{bubbles[p.id].text}</div>}
            <div className={p.id === selfId ? "name self" : "name"}>{p.name}</div>
          </div>
        ))}
      </div>
      <div className="hud-top">
        <span className={connected ? "dot ok" : "dot"} />
        {connected ? `접속자 ${list.length}명` : "재연결 중…"}
        <details className="roster">
          <summary>목록</summary>
          <ul>
            {list.map((p) => (
              <li key={p.id}>
                <span className="chip" style={{ background: p.color }} />
                {p.name}
                {p.id === selfId && " (나)"}
              </li>
            ))}
          </ul>
        </details>
      </div>
      <Chat messages={messages} onSend={sendChat} />
      <Joystick />
    </div>
  );
}
