import { useCallback, useEffect, useRef, useState } from "react";
import { socket, remoteTargets, labelEls, selfPos, debugTeleport } from "./net";
import { locationAt } from "./zones";
import type { ChatMsg, Player } from "./types";
import World from "./World";
import Chat from "./Chat";
import Joystick from "./Joystick";
import { VoiceChat } from "./voice";

type JoinAck = { ok: true; selfId: string; players: Player[] } | { ok: false; error: string };
type Bubble = { text: string; until: number };
type VoiceMode = "off" | "joining" | "live" | "muted";

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
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("off");
  const [voiceError, setVoiceError] = useState("");
  const [speaking, setSpeaking] = useState<Set<string>>(() => new Set());
  const [blocked, setBlocked] = useState<Set<string>>(() => new Set());
  const voiceRef = useRef<VoiceChat | null>(null);
  if (!voiceRef.current) voiceRef.current = new VoiceChat(setSpeaking);
  const voice = voiceRef.current;
  const [place, setPlace] = useState("");

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
      voiceRef.current!.selfId = ack.selfId;
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
    const onDisconnect = () => {
      setConnected(false);
      // Peer connections are tied to the old socket id; the user can rejoin voice after reconnecting.
      if (voiceRef.current?.active) {
        voiceRef.current.teardown();
        setVoiceMode("off");
      }
    };
    const onJoined = (p: Player) => {
      remoteTargets.set(p.id, { x: p.x, z: p.z, ry: p.ry });
      setPlayers((prev) => ({ ...prev, [p.id]: p }));
    };
    const onLeft = (id: string) => {
      remoteTargets.delete(id);
      voiceRef.current?.closePeer(id);
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
    const onVoiceState = (v: { id: string; voice: boolean; muted: boolean }) => {
      if (!v.voice) voiceRef.current?.closePeer(v.id);
      setPlayers((prev) => (prev[v.id] ? { ...prev, [v.id]: { ...prev[v.id], voice: v.voice, muted: v.muted } } : prev));
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("playerJoined", onJoined);
    socket.on("playerLeft", onLeft);
    socket.on("state", onState);
    socket.on("chat", onChat);
    socket.on("system", onSystem);
    socket.on("voice:state", onVoiceState);
    return () => {
      socket.off("voice:state", onVoiceState);
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

  useEffect(() => () => voiceRef.current?.teardown(), []);
  // Current location for the HUD (e.g. "1층 · 과학실").
  useEffect(() => {
    if (!joined) return;
    const t = setInterval(() => setPlace(locationAt(selfPos.x, selfPos.z).label), 250);
    return () => clearInterval(t);
  }, [joined]);
  useEffect(() => {
    // Hooks for automated tests.
    const w = window as unknown as { __mvVoice?: VoiceChat; __mvDebug?: object };
    w.__mvVoice = voice;
    w.__mvDebug = {
      teleport: (x: number, z: number) => (debugTeleport.pending = { x, z }),
      pos: () => ({ ...selfPos }),
    };
  }, [voice]);

  const toggleMic = async () => {
    setVoiceError("");
    if (voiceMode === "off") {
      setVoiceMode("joining");
      try {
        await voice.join();
        setVoiceMode("live");
      } catch (e) {
        setVoiceMode("off");
        setVoiceError((e as Error).message);
      }
    } else if (voiceMode === "live") {
      voice.setMic(false);
      setVoiceMode("muted");
    } else if (voiceMode === "muted") {
      voice.setMic(true);
      setVoiceMode("live");
    }
  };
  const leaveVoice = () => {
    voice.leave();
    setVoiceMode("off");
  };
  const toggleBlock = (id: string) => {
    if (voice.blocked.has(id)) voice.blocked.delete(id);
    else voice.blocked.add(id);
    setBlocked(new Set(voice.blocked));
  };

  if (!joined || !selfStart) {
    return (
      <div className="join">
        <form className="card" onSubmit={submitJoin}>
          <h1>Jerom World</h1>
          <p className="muted">🏫 한빛초등학교 운동장에서 친구들을 만나 보세요. 닉네임과 색상을 고르고 입장하면 실시간으로 대화할 수 있습니다.</p>
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
          <p className="muted small">이동: WASD / 방향키 · 채팅: Enter · 모바일: 오른쪽 아래 조이스틱 · 음성: 🎙️ 버튼 · 초록 매트를 밟으면 건물 안으로</p>
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
            <div className={`name${p.id === selfId ? " self" : ""}${speaking.has(p.id) ? " speaking" : ""}`}>
              {p.voice && (speaking.has(p.id) ? "🔊 " : p.muted ? "🔇 " : "🎤 ")}
              {p.name}
            </div>
          </div>
        ))}
      </div>
      {place && (
        <div className="hud-place" aria-live="polite">
          📍 {place}
        </div>
      )}
      <div className="hud-top">
        <span className={connected ? "dot ok" : "dot"} />
        {connected ? `접속자 ${list.length}명` : "재연결 중…"}
        <details className="roster">
          <summary>목록</summary>
          <ul>
            {list.map((p) => (
              <li key={p.id}>
                <span className="chip" style={{ background: p.color }} />
                <span className="who">
                  {p.name}
                  {p.id === selfId && " (나)"}
                </span>
                {p.voice && <span aria-label={p.muted ? "마이크 꺼짐" : "음성 참여 중"}>{p.muted ? "🔇" : "🎤"}</span>}
                {p.id !== selfId && p.voice && voiceMode !== "off" && (
                  <button type="button" className="mini" onClick={() => toggleBlock(p.id)}>
                    {blocked.has(p.id) ? "듣기" : "음소거"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      </div>
      <Chat messages={messages} onSend={sendChat} />
      <div className="voice">
        {voiceError && (
          <p className="voice-error" role="alert">
            {voiceError}
          </p>
        )}
        <div className="voice-row">
          {voiceMode !== "off" && voiceMode !== "joining" && (
            <button type="button" className="voice-leave" onClick={leaveVoice} aria-label="음성 채팅 나가기">
              나가기
            </button>
          )}
          <button
            type="button"
            className={`voice-btn ${voiceMode}`}
            onClick={toggleMic}
            disabled={voiceMode === "joining"}
            aria-pressed={voiceMode === "live"}
          >
            {voiceMode === "off" && "🎙️ 음성 참여"}
            {voiceMode === "joining" && "연결 중…"}
            {voiceMode === "live" && "🎤 마이크 켜짐"}
            {voiceMode === "muted" && "🔇 마이크 꺼짐"}
          </button>
        </div>
        {voiceMode !== "off" && voiceMode !== "joining" && <p className="voice-hint">가까이 있는 사람의 목소리가 더 크게 들립니다</p>}
      </div>
      <Joystick />
    </div>
  );
}
