export const WORLD_HALF = 24; // must match server WORLD_HALF

export type Player = {
  id: string;
  name: string;
  color: string;
  x: number;
  z: number;
  ry: number;
  voice?: boolean;
  muted?: boolean;
};
export type ChatMsg = { id?: string; name?: string; color?: string; text: string; ts: number; system?: boolean };
