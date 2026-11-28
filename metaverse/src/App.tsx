import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { socket, remoteTargets, labelEls, selfPos, debugTeleport, rides, clock, serverNow, view, moveOrder, cafe, bubbleBus, type CafeState, type RideState } from "./net";
import { CAFE, CAFE_MENU, CAFE_MIN_PRICE, CAFE_SEATS, PARK, RIDES } from "../shared/layout.js";
import { NPCS, npcAt, npcLine } from "./cafeNpcs";
import { dogPose } from "./ParkDogs";
import { locationAt } from "./zones";
import type { ChatMsg, ChatScope, Member, Player } from "./types";
import { chatReducer, initialChat } from "./chatState";
import World from "./World";
import Chat from "./Chat";
import Joystick from "./Joystick";
import { VoiceChat } from "./voice";
import Minimap from "./Minimap";

type JoinAck = { ok: true; selfId: string; now: number; wallet?: number; players: Player[] } | { ok: false; error: string };
type Bubble = { text: string; until: number };
type VoiceMode = "off" | "joining" | "live" | "muted";
/** A cafe button shown when it applies (first one also runs with the E key). */
type CafeAction = { key: string; label: string; run: () => void };

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
  const [chat, dispatchChat] = useReducer(chatReducer, initialChat);
  const [nearCount, setNearCount] = useState(0);
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
  const [panned, setPanned] = useState(false);
  const [cafeActions, setCafeActions] = useState<CafeAction[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [wallet, setWallet] = useState(CAFE.wallet);
  const [cafeMsg, setCafeMsg] = useState("");
  const talkCount = useRef<number[]>(NPCS.map(() => 0));

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
      rides.clear();
      cafe.clear();
      clock.offset = ack.now - Date.now();
      if (typeof ack.wallet === "number") setWallet(ack.wallet);
      const map: Record<string, Player> = {};
      for (const p of ack.players) {
        map[p.id] = p;
        if (p.ride) rides.set(p.id, p.ride);
        if (p.cafe && (p.cafe.seat !== null || p.cafe.order)) cafe.set(p.id, p.cafe as CafeState);
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
      dispatchChat({ type: "group", group: null, selfId: "" }); // meetings are tied to the old connection
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
      rides.delete(id);
      cafe.delete(id);
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
    const onChat = (m: ChatMsg) => {
      dispatchChat({ type: "chat", msg: m });
      // Only recipients get the message, so only they see the speech bubble.
      if (m.id) setBubbles((prev) => ({ ...prev, [m.id!]: { text: m.text, until: Date.now() + BUBBLE_MS } }));
    };
    const onSystem = (m: ChatMsg) => dispatchChat({ type: "system", msg: m });
    const onGroup = (g: { id: string; members: Member[] } | null) =>
      dispatchChat({ type: "group", group: g, selfId: socket.id ?? "" });
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
    socket.on("group:state", onGroup);
    const onRide = (r: { id: string } & (RideState | { ride: null })) => {
      if (r.ride === null) rides.delete(r.id);
      else rides.set(r.id, r as RideState);
    };
    socket.on("ride", onRide);
    // Lawn cafe: who sits where and who ordered what (server-decided).
    const onCafe = (c: { id: string } & CafeState) => {
      if (c.seat === null && !c.order) cafe.delete(c.id);
      else cafe.set(c.id, { seat: c.seat, order: c.order });
    };
    socket.on("cafe", onCafe);
    const onWallet = (w: number) => setWallet(w);
    socket.on("cafe:wallet", onWallet);
    // Bubbles from the scene (barista, cafe customers).
    const onSay = (e: Event) => {
      const d = (e as CustomEvent<{ id: string; text: string; ms: number }>).detail;
      setBubbles((prev) => ({ ...prev, [d.id]: { text: d.text, until: Date.now() + d.ms } }));
    };
    bubbleBus.addEventListener("say", onSay);
    // The server refused a move that was too fast (not walking, not a door): go back to where it has us.
    const onCorrect = (c: { x: number; z: number }) => {
      debugTeleport.pending = { x: c.x, z: c.z };
      debugTeleport.corrections++;
      moveOrder.active = false;
    };
    socket.on("correct", onCorrect);
    return () => {
      socket.off("correct", onCorrect);
      socket.off("ride", onRide);
      socket.off("cafe", onCafe);
      socket.off("cafe:wallet", onWallet);
      bubbleBus.removeEventListener("say", onSay);
      socket.off("group:state", onGroup);
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

  const sendChat = (scope: ChatScope, text: string) => socket.emit("chat", { scope, text });

  // ---------- lawn cafe ----------
  const cafeError = (ack: { ok: boolean; error?: string } | undefined) => {
    if (ack && !ack.ok && ack.error) {
      setCafeMsg(ack.error);
      setTimeout(() => setCafeMsg(""), 3000);
    }
  };
  const order = (item: number) => {
    setMenuOpen(false);
    socket.emit("cafe:order", { item }, cafeError);
  };
  /** Buttons that apply where the player is now (cheap: runs 4 times a second). */
  const cafeActionsNow = (): CafeAction[] => {
    const id = socket.id ?? "";
    if (rides.has(id) || selfPos.x < PARK.minX) return [];
    const lx = selfPos.x - PARK.cx, lz = selfPos.z;
    const me = cafe.get(id);
    const ord = me?.order ?? null;
    const now = serverNow();
    const out: CafeAction[] = [];
    if (me && me.seat !== null) {
      if (ord && ord.stage === "placed" && ord.seat === me.seat && ord.left > 0 && ord.sipUntil <= now)
        out.push({ key: "sip", label: `${CAFE_MENU[ord.item].food ? "🍪 먹기" : "🥤 마시기"} (${ord.left}${CAFE_MENU[ord.item].food ? "입" : "모금"} 남음)`, run: () => socket.emit("cafe:sip", {}, cafeError) });
      out.push({ key: "stand", label: "🧍 일어나기", run: () => socket.emit("cafe:stand", {}, cafeError) });
      return out;
    }
    if (Math.hypot(lx - CAFE.order.x, lz - CAFE.order.z) <= CAFE.order.reach - 0.2) {
      if (!ord || ord.stage === "placed") out.push({ key: "order", label: "☕ 주문하기", run: () => setMenuOpen(true) });
      else if (ord.stage === "making" && now >= ord.readyAt) out.push({ key: "pickup", label: `🥤 ${CAFE_MENU[ord.item].name} 받기`, run: () => socket.emit("cafe:pickup", {}, cafeError) });
    }
    // nearest free guest stool within reach
    let seat = -1, sd = 1.6;
    CAFE_SEATS.forEach((st, i) => {
      if (st.npc) return;
      const d = Math.hypot(lx - st.x, lz - st.z);
      const taken = [...cafe.values()].some((c) => c.seat === i);
      if (!taken && d < sd) (sd = d), (seat = i);
    });
    if (seat >= 0) out.push({ key: "sit", label: ord?.stage === "held" ? "🪑 앉아서 내려놓기" : "🪑 앉기", run: () => socket.emit("cafe:sit", { seat }, cafeError) });
    // regular customers close by
    let npc = -1, nd = 2.5;
    NPCS.forEach((_, i) => {
      const p = npcAt(i, now);
      const d = Math.hypot(lx - p.x, lz - p.z);
      if (p.visible && d < nd) (nd = d), (npc = i);
    });
    if (npc >= 0)
      out.push({
        key: `talk${npc}`,
        label: `💬 ${NPCS[npc].name}에게 말 걸기`,
        run: () => {
          const i = npc;
          setBubbles((prev) => ({ ...prev, [id]: { text: "안녕하세요!", until: Date.now() + 2000 } }));
          const line = npcLine(i, npcAt(i, serverNow()), talkCount.current[i]++);
          setTimeout(() => setBubbles((prev) => ({ ...prev, [`npc:${i}`]: { text: line, until: Date.now() + 4000 } })), 600);
        },
      });
    return out;
  };
  const actionsRef = useRef(cafeActions);
  actionsRef.current = cafeActions;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.key.toLowerCase() === "e" && !e.repeat) actionsRef.current[0]?.run();
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => () => voiceRef.current?.teardown(), []);
  // Current location for the HUD (e.g. "1층 · 과학실").
  useEffect(() => {
    if (!joined) return;
    const t = setInterval(() => {
      const here = locationAt(selfPos.x, selfPos.z);
      const mine = rides.get(socket.id ?? "");
      if (mine) {
        const now = serverNow();
        const name = RIDES[mine.ride].name;
        const aboard = [...rides.values()].filter((r) => r.vehicle === mine.vehicle).length;
        if (now < mine.start) {
          const wait = Math.ceil((mine.start - now) / 1000);
          setPlace(`${name} 출발까지 ${wait}초 · ${aboard}명 탑승 (친구는 같은 매트를 밟으면 함께 타요)`);
        } else {
          const left = Math.max(0, Math.ceil((mine.start + RIDES[mine.ride].duration - now) / 1000));
          setPlace(`${name} 타는 중${aboard > 1 ? ` · ${aboard}명 함께` : ""} · ${left}초 남음`);
        }
      } else {
        const ord = cafe.get(socket.id ?? "")?.order;
        const now = serverNow();
        let extra = "";
        if (ord?.stage === "making") {
          const name = CAFE_MENU[ord.item].name;
          extra = now < ord.readyAt ? ` · ☕ ${name} 만드는 중 ${Math.ceil((ord.readyAt - now) / 1000)}초` : ` · ☕ ${name} 나왔어요 (카운터에서 받기)`;
        }
        setPlace(here.label + extra);
      }
      setCafeActions(cafeActionsNow());
      // Hint for the "근처" tab: others within 3m in the same room (the server decides delivery).
      let n = 0;
      for (const p of remoteTargets.values())
        if (Math.hypot(p.x - selfPos.x, p.z - selfPos.z) <= 3 && locationAt(p.x, p.z).key === here.key) n++;
      setNearCount(n);
      setPanned(Math.hypot(view.pan.x, view.pan.z) > 1.5 && !view.recenter);
    }, 250);
    return () => clearInterval(t);
  }, [joined]);
  useEffect(() => {
    // Hooks for automated tests.
    const w = window as unknown as { __mvVoice?: VoiceChat; __mvDebug?: object };
    w.__mvVoice = voice;
    w.__mvDebug = {
      // Teleport only exists in test builds (VITE_MV_DEBUG=1); the live site has no teleport hook.
      ...(import.meta.env.VITE_MV_DEBUG === "1" && {
        teleport: (x: number, z: number) => (debugTeleport.pending = { x, z }),
      }),
      pos: () => ({ ...selfPos }),
      rides: () => Object.fromEntries(rides),
      zoom: () => view.zoom,
      order: () => ({ ...moveOrder }),
      pan: () => ({ ...view.pan, dragging: view.dragging }),
      remote: (id: string) => remoteTargets.get(id) ?? null, // where another player is shown
      corrections: () => debugTeleport.corrections, // server snap-backs (should stay 0 for honest walking)
      cafe: () => Object.fromEntries(cafe), // seats and orders (server-decided)
      npc: (i: number) => npcAt(i, serverNow()),
      dog: (i: number) => dogPose(i, serverNow()), // park dogs on the lake trail (park-local)
      actions: () => actionsRef.current.map((a) => a.key),
      act: (key: string) => actionsRef.current.find((a) => a.key === key)?.run(),
      cafeOrder: (item: number) => socket.emit("cafe:order", { item }),
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
        {[["npc:barista", "바리스타"], ...NPCS.map((n, i) => [`npc:${i}`, n.name])].map(([id, nm]) => (
          <div
            key={id}
            className="tag"
            ref={(el) => {
              if (el) labelEls.set(id, el);
              else labelEls.delete(id);
            }}
          >
            {bubbles[id] && <div className="bubble">{bubbles[id].text}</div>}
            <div className="name npc">{nm}</div>
          </div>
        ))}
      </div>
      {(cafeActions.length > 0 || cafeMsg) && (
        <div className="cafe-actions" aria-live="polite">
          {cafeMsg && <p className="cafe-msg">{cafeMsg}</p>}
          {cafeActions.map((a, i) => (
            <button key={a.key} type="button" className={i === 0 ? "cafe-btn first" : "cafe-btn"} onClick={a.run} data-action={a.key}>
              {a.label}
              {i === 0 && <kbd>E</kbd>}
            </button>
          ))}
        </div>
      )}
      {menuOpen && (
        <div className="cafe-menu" role="dialog" aria-label={`${CAFE.name} 메뉴`}>
          <h2>{CAFE.name}</h2>
          <p className="cafe-wallet" data-testid="wallet">💰 내 지갑 {wallet.toLocaleString("ko-KR")}원</p>
          <ul>
            {CAFE_MENU.map((m, i) => (
              <li key={m.name}>
                <button type="button" onClick={() => order(i)} data-item={i} disabled={wallet < m.price}>
                  <span className="dot-c" style={{ background: m.color }} />
                  {m.name}
                  <small>
                    {m.price.toLocaleString("ko-KR")}원 · {m.prep / 1000}초
                  </small>
                </button>
              </li>
            ))}
          </ul>
          {wallet < CAFE_MIN_PRICE && (
            <button type="button" className="mini" data-action="allowance" onClick={() => socket.emit("cafe:allowance", {}, cafeError)}>
              💵 용돈 받기 ({CAFE.wallet.toLocaleString("ko-KR")}원)
            </button>
          )}
          <button type="button" className="mini" onClick={() => setMenuOpen(false)}>닫기</button>
        </div>
      )}
      <div className="hud-left">
        {place && (
          <div className="hud-place" aria-live="polite">
            📍 {place}
          </div>
        )}
        <Minimap players={players} selfId={selfId} />
        {panned && (
          <button type="button" className="recenter" onClick={() => (view.recenter = true)}>
            📍 내 위치로
          </button>
        )}
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
      <Chat chat={chat} selfId={selfId} nearCount={nearCount} onSend={sendChat} />
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
