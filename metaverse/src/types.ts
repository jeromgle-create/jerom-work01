
export type Player = {
  id: string;
  name: string;
  color: string;
  x: number;
  z: number;
  ry: number;
  voice?: boolean;
  muted?: boolean;
  ride?: { ride: number; dir: "ab" | "ba"; start: number } | null;
};
export type ChatScope = "near" | "group" | "all";
export type ChatMsg = {
  id?: string;
  name?: string;
  color?: string;
  text: string;
  ts: number;
  system?: boolean;
  scope?: ChatScope;
  groupId?: string;
  recipients?: number; // near chat: how many people (including the sender) received it
};
export type Member = { id: string; name: string; color: string };
