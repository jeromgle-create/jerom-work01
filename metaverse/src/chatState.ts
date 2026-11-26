// Chat channels: nearby (3m), meeting groups (one log per encounter), and everyone.
import type { ChatMsg, Member } from "./types";

/** One encounter. `ids` are the server group ids it has had: meeting the same people again resumes it. */
export type Meeting = { id: string; ids: string[]; members: Member[]; active: boolean; startedAt: number; messages: ChatMsg[] };
export type ChatState = { near: ChatMsg[]; all: ChatMsg[]; meetings: Meeting[]; current: string | null };
export type ChatAction =
  | { type: "chat"; msg: ChatMsg }
  | { type: "system"; msg: ChatMsg }
  | { type: "group"; group: { id: string; members: Member[] } | null; selfId: string }
  | { type: "reset" };

const MAX_MSGS = 100;
const MAX_MEETINGS = 10;
export const initialChat: ChatState = { near: [], all: [], meetings: [], current: null };

const push = (list: ChatMsg[], m: ChatMsg) => [...list.slice(-(MAX_MSGS - 1)), m];
const sys = (text: string): ChatMsg => ({ text, ts: Date.now(), system: true });
const names = (ms: Member[]) => ms.map((m) => m.name).join(", ");

function endMeeting(state: ChatState): ChatState {
  if (!state.current) return state;
  const id = state.current;
  return {
    ...state,
    current: null,
    meetings: state.meetings.map((m) => (m.id === id ? { ...m, active: false, messages: push(m.messages, sys("만남이 끝났어요. 대화 기록은 남아 있어요.")) } : m)),
  };
}

export function chatReducer(state: ChatState, a: ChatAction): ChatState {
  switch (a.type) {
    case "reset":
      return initialChat;
    case "system":
      return { ...state, all: push(state.all, { ...a.msg, system: true }) };
    case "chat": {
      const m = a.msg;
      if (m.scope === "near") return { ...state, near: push(state.near, m) };
      if (m.scope === "group" && m.groupId)
        return { ...state, meetings: state.meetings.map((g) => (g.ids.includes(m.groupId!) ? { ...g, messages: push(g.messages, m) } : g)) };
      return { ...state, all: push(state.all, m) };
    }
    case "group": {
      const g = a.group;
      let s = state;
      if (!g) return endMeeting(s);
      const others = g.members.filter((m) => m.id !== a.selfId);
      const otherKey = others.map((m) => m.id).sort().join(",");
      const sameOthers = (m: Meeting) =>
        m.members.filter((x) => x.id !== a.selfId).map((x) => x.id).sort().join(",") === otherKey;
      // Same server group, or an ended meeting with exactly the same people (they met again).
      let existing = s.meetings.find((m) => m.ids.includes(g.id)) ?? s.meetings.find((m) => !m.active && sameOthers(m));
      if (s.current && s.current !== existing?.id) {
        s = endMeeting(s);
        existing = existing && s.meetings.find((m) => m.id === existing!.id);
      }
      if (!existing) {
        const meeting: Meeting = {
          id: g.id,
          ids: [g.id],
          members: g.members,
          active: true,
          startedAt: Date.now(),
          messages: [sys(`${names(others)} 님과 만났어요. 이 대화는 만남 멤버에게만 보여요.`)],
        };
        return { ...s, current: g.id, meetings: [meeting, ...s.meetings].slice(0, MAX_MEETINGS) };
      }
      const before = new Set(existing.members.map((m) => m.id));
      const after = new Set(g.members.map((m) => m.id));
      let msgs = existing.messages;
      if (!existing.active) msgs = push(msgs, sys("다시 만났어요!"));
      const joined = g.members.filter((m) => !before.has(m.id) && m.id !== a.selfId);
      const left = existing.members.filter((m) => !after.has(m.id) && m.id !== a.selfId);
      if (joined.length) msgs = push(msgs, sys(`${names(joined)} 님이 만남에 들어왔어요.`));
      if (left.length) msgs = push(msgs, sys(`${names(left)} 님이 떠났어요.`));
      const ids = existing.ids.includes(g.id) ? existing.ids : [...existing.ids, g.id];
      const updated = { ...existing, ids, members: g.members, active: true, messages: msgs };
      return { ...s, current: existing.id, meetings: [updated, ...s.meetings.filter((m) => m.id !== existing!.id)] };
    }
  }
}
