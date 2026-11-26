import { useEffect, useRef, useState } from "react";
import type { ChatMsg } from "./types";

export default function Chat({ messages, onSend }: { messages: ChatMsg[]; onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(() => window.innerWidth > 640);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open]);

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

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (t) onSend(t);
    setText("");
    inputRef.current?.blur();
  };

  return (
    <div className={open ? "chat open" : "chat"}>
      <button type="button" className="chat-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        💬 채팅
      </button>
      {open && (
        <>
          <div className="chat-list" ref={listRef} aria-live="polite">
            {messages.length === 0 && <div className="sys">아직 메시지가 없습니다. Enter를 눌러 대화를 시작하세요.</div>}
            {messages.map((m, i) =>
              m.system ? (
                <div key={i} className="sys">
                  {m.text}
                </div>
              ) : (
                <div key={i} className="msg">
                  <b style={{ color: m.color }}>{m.name}</b> {m.text}
                </div>
              ),
            )}
          </div>
          <form onSubmit={submit} className="chat-form">
            <input
              ref={inputRef}
              value={text}
              maxLength={200}
              placeholder="메시지 입력 (Enter)"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && inputRef.current?.blur()}
            />
            <button type="submit">전송</button>
          </form>
        </>
      )}
    </div>
  );
}
