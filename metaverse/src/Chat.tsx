import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMsg, ChatScope } from "./types";
import type { ChatState } from "./chatState";

type Props = {
  chat: ChatState;
  selfId: string;
  nearCount: number; // other people within 3m right now (client estimate, for the hint only)
  onSend: (scope: ChatScope, text: string) => void;
};

const TABS: { id: ChatScope; label: string }[] = [
  { id: "near", label: "근처" },
  { id: "group", label: "만남" },
  { id: "all", label: "전체" },
];

function MessageList({ messages, empty }: { messages: ChatMsg[]; empty: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [messages]);
  return (
    <div className="chat-list" ref={ref} aria-live="polite">
      {messages.length === 0 && <div className="sys">{empty}</div>}
      {messages.map((m, i) =>
        m.system ? (
          <div key={i} className="sys">
            {m.text}
          </div>
        ) : (
          <div key={i} className="msg">
            <b style={{ color: m.color }}>{m.name}</b> {m.text}
            {m.scope === "near" && m.recipients === 1 && <span className="sys"> (주변에 아무도 없었어요)</span>}
          </div>
        ),
      )}
    </div>
  );
}

export default function Chat({ chat, selfId, nearCount, onSend }: Props) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(() => window.innerWidth > 640);
  const [tab, setTab] = useState<ChatScope>("near");
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [seen, setSeen] = useState<Record<string, number>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  // Follow the live meeting: select it when it starts, and jump to the tab if the user is idle on "근처".
  const prevCurrent = useRef<string | null>(null);
  useEffect(() => {
    if (chat.current && chat.current !== prevCurrent.current) {
      setMeetingId(chat.current);
      if (tab === "near" && document.activeElement !== inputRef.current) setTab("group");
    }
    prevCurrent.current = chat.current;
  }, [chat.current, tab]);

  const meeting = chat.meetings.find((m) => m.id === (meetingId ?? chat.current)) ?? chat.meetings[0];
  const lists: Record<ChatScope, ChatMsg[]> = {
    near: chat.near,
    group: meeting?.messages ?? [],
    all: chat.all,
  };
  const counts = useMemo(
    () => ({
      near: chat.near.filter((m) => !m.system).length,
      group: chat.meetings.reduce((n, m) => n + m.messages.filter((x) => !x.system).length, 0),
      all: chat.all.filter((m) => !m.system).length,
    }),
    [chat],
  );
  // Mark the visible tab as read.
  useEffect(() => {
    if (open) setSeen((s) => (s[tab] === counts[tab] ? s : { ...s, [tab]: counts[tab] }));
  }, [open, tab, counts]);
  const unread = (t: ChatScope) => Math.max(0, counts[t] - (seen[t] ?? 0));
  const totalUnread = TABS.reduce((n, t) => n + (t.id === tab && open ? 0 : unread(t.id)), 0);

  // Enter focuses the chat box from anywhere; Esc returns focus to the world.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        setOpen(true);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const canSend = tab !== "group" || (!!meeting && meeting.active && meeting.id === chat.current);
  const placeholder =
    tab === "near"
      ? `근처 3m${nearCount ? ` (${nearCount}명)` : ""}에게 말하기`
      : tab === "group"
        ? canSend
          ? `만남 멤버 ${meeting!.members.length}명에게 말하기`
          : "끝난 만남이에요 (읽기 전용)"
        : "전체에게 말하기";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (t && canSend) onSend(tab, t);
    setText("");
    inputRef.current?.blur();
  };

  const others = (ids: { id: string; name: string }[]) =>
    ids
      .filter((m) => m.id !== selfId)
      .map((m) => m.name)
      .join(", ");

  return (
    <div className={open ? "chat open" : "chat"}>
      <button type="button" className="chat-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        💬 채팅{!open && totalUnread > 0 && <span className="badge">{totalUnread}</span>}
      </button>
      {open && (
        <>
          <div className="chat-tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={tab === t.id ? "tab on" : "tab"}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                {t.id === "near" && nearCount > 0 && <span className="count">{nearCount}</span>}
                {t.id === "group" && chat.current && <span className="live-dot" aria-label="진행 중인 만남" />}
                {t.id !== tab && unread(t.id) > 0 && <span className="badge">{unread(t.id)}</span>}
              </button>
            ))}
          </div>
          {tab === "group" && chat.meetings.length > 0 && (
            <div className="meetings">
              {chat.meetings.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`meeting${m.id === meeting?.id ? " on" : ""}${m.active ? " live" : ""}`}
                  onClick={() => setMeetingId(m.id)}
                  title={others(m.members)}
                >
                  {m.active ? "● 지금" : "지난"} · {others(m.members) || "나"}
                </button>
              ))}
            </div>
          )}
          <MessageList
            messages={lists[tab]}
            empty={
              tab === "near"
                ? "3m 안에 있는 사람에게만 전달돼요. 친구 가까이 가서 말을 걸어 보세요."
                : tab === "group"
                  ? "아직 만남이 없어요. 친구에게 3m 이내로 다가가 잠시 머무르면 만남 대화방이 생겨요."
                  : "접속한 모두에게 보이는 채팅이에요."
            }
          />
          <form onSubmit={submit} className="chat-form">
            <input
              ref={inputRef}
              value={text}
              maxLength={200}
              disabled={!canSend}
              placeholder={placeholder}
              aria-label={placeholder}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && inputRef.current?.blur()}
            />
            <button type="submit" disabled={!canSend}>
              전송
            </button>
          </form>
        </>
      )}
    </div>
  );
}
