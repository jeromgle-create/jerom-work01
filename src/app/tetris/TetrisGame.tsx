"use client";

import { useCallback, useEffect, useReducer, type CSSProperties } from "react";
import Link from "next/link";

const ROWS = 20;
const COLS = 10;

type PieceType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";
type Cell = string | null;

const PIECE_TYPES: PieceType[] = ["I", "O", "T", "S", "Z", "J", "L"];

const SHAPES: Record<PieceType, number[][]> = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
};

const COLORS: Record<PieceType, string> = {
  I: "#22d3ee",
  O: "#facc15",
  T: "#a855f7",
  S: "#4ade80",
  Z: "#f87171",
  J: "#60a5fa",
  L: "#fb923c",
};

const LINE_SCORES = [0, 100, 300, 500, 800];
const HIGH_SCORE_KEY = "tetris-high-score";

interface Piece {
  type: PieceType;
  shape: number[][];
  x: number;
  y: number;
  color: string;
}

interface GameState {
  board: Cell[][];
  current: Piece;
  queue: PieceType[];
  hold: PieceType | null;
  canHold: boolean;
  score: number;
  lines: number;
  level: number;
  highScore: number;
  gameOver: boolean;
  paused: boolean;
}

type Action =
  | { type: "MOVE_LEFT" }
  | { type: "MOVE_RIGHT" }
  | { type: "SOFT_DROP" }
  | { type: "HARD_DROP" }
  | { type: "ROTATE" }
  | { type: "HOLD" }
  | { type: "TICK" }
  | { type: "TOGGLE_PAUSE" }
  | { type: "RESTART" }
  | { type: "START"; highScore: number };

// 7-bag: every run of 7 pieces contains each type exactly once.
function shuffledBag(): PieceType[] {
  const bag = [...PIECE_TYPES];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

// Takes the next piece off the queue, refilling with a new bag so the queue never empties.
function pullNext(queue: PieceType[]): [PieceType, PieceType[]] {
  const [type, ...rest] = queue;
  return [type, rest.length > 0 ? rest : shuffledBag()];
}

function createPiece(type: PieceType): Piece {
  const shape = SHAPES[type].map((row) => [...row]);
  const x = Math.floor((COLS - shape[0].length) / 2);
  return { type, shape, x, y: 0, color: COLORS[type] };
}

function createEmptyBoard(): Cell[][] {
  return Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(null));
}

function rotateMatrix(shape: number[][]): number[][] {
  const n = shape.length;
  const m = shape[0].length;
  const result: number[][] = Array.from({ length: m }, () => Array(n).fill(0));
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < m; c++) {
      result[c][n - 1 - r] = shape[r][c];
    }
  }
  return result;
}

function collides(board: Cell[][], shape: number[][], x: number, y: number): boolean {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = x + c;
      const ny = y + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function merge(board: Cell[][], piece: Piece): Cell[][] {
  const newBoard = board.map((row) => [...row]);
  piece.shape.forEach((row, r) => {
    row.forEach((v, c) => {
      if (!v) return;
      const nx = piece.x + c;
      const ny = piece.y + r;
      if (ny >= 0) newBoard[ny][nx] = piece.color;
    });
  });
  return newBoard;
}

function clearLines(board: Cell[][]): { board: Cell[][]; cleared: number } {
  const remaining = board.filter((row) => row.some((cell) => !cell));
  const cleared = ROWS - remaining.length;
  const newRows = Array.from({ length: cleared }, () => Array<Cell>(COLS).fill(null));
  return { board: [...newRows, ...remaining], cleared };
}

function dropInterval(level: number): number {
  return Math.max(100, 1000 - (level - 1) * 75);
}

function createInitialState(highScore = 0, bag: PieceType[] = shuffledBag()): GameState {
  const [first, queue] = pullNext(bag);
  return {
    board: createEmptyBoard(),
    current: createPiece(first),
    queue,
    hold: null,
    canHold: true,
    score: 0,
    lines: 0,
    level: 1,
    highScore,
    gameOver: false,
    paused: false,
  };
}

function lockPiece(state: GameState): GameState {
  const merged = merge(state.board, state.current);
  const { board: clearedBoard, cleared } = clearLines(merged);
  const points = LINE_SCORES[cleared] * state.level;
  const lines = state.lines + cleared;
  const level = Math.floor(lines / 10) + 1;
  const [nextType, queue] = pullNext(state.queue);
  const newCurrent = createPiece(nextType);
  const over = collides(clearedBoard, newCurrent.shape, newCurrent.x, newCurrent.y);
  return {
    ...state,
    board: clearedBoard,
    current: newCurrent,
    queue,
    canHold: true,
    score: state.score + points,
    lines,
    level,
    gameOver: over,
  };
}

function reducer(state: GameState, action: Action): GameState {
  const next = gameReducer(state, action);
  if (next.gameOver && !state.gameOver && next.score > next.highScore) {
    return { ...next, highScore: next.score };
  }
  return next;
}

function gameReducer(state: GameState, action: Action): GameState {
  if (action.type === "RESTART") return createInitialState(state.highScore);
  if (action.type === "START") {
    return createInitialState(Math.max(state.highScore, action.highScore));
  }
  if (action.type === "TOGGLE_PAUSE") {
    if (state.gameOver) return state;
    return { ...state, paused: !state.paused };
  }
  if (state.gameOver || state.paused) return state;

  switch (action.type) {
    case "MOVE_LEFT": {
      const { current } = state;
      if (!collides(state.board, current.shape, current.x - 1, current.y)) {
        return { ...state, current: { ...current, x: current.x - 1 } };
      }
      return state;
    }
    case "MOVE_RIGHT": {
      const { current } = state;
      if (!collides(state.board, current.shape, current.x + 1, current.y)) {
        return { ...state, current: { ...current, x: current.x + 1 } };
      }
      return state;
    }
    case "SOFT_DROP":
    case "TICK": {
      const { current } = state;
      if (!collides(state.board, current.shape, current.x, current.y + 1)) {
        const score = action.type === "SOFT_DROP" ? state.score + 1 : state.score;
        return { ...state, current: { ...current, y: current.y + 1 }, score };
      }
      return lockPiece(state);
    }
    case "HARD_DROP": {
      let current = state.current;
      let dropDistance = 0;
      while (!collides(state.board, current.shape, current.x, current.y + 1)) {
        current = { ...current, y: current.y + 1 };
        dropDistance++;
      }
      const locked = lockPiece({ ...state, current });
      return { ...locked, score: locked.score + dropDistance * 2 };
    }
    case "ROTATE": {
      const rotated = rotateMatrix(state.current.shape);
      const kicks = [0, -1, 1, -2, 2];
      for (const dx of kicks) {
        if (!collides(state.board, rotated, state.current.x + dx, state.current.y)) {
          return { ...state, current: { ...state.current, shape: rotated, x: state.current.x + dx } };
        }
      }
      return state;
    }
    case "HOLD": {
      if (!state.canHold) return state;
      let incoming: PieceType;
      let queue = state.queue;
      if (state.hold) {
        incoming = state.hold;
      } else {
        [incoming, queue] = pullNext(state.queue);
      }
      const current = createPiece(incoming);
      return {
        ...state,
        current,
        queue,
        hold: state.current.type,
        canHold: false,
        gameOver: collides(state.board, current.shape, current.x, current.y),
      };
    }
    default:
      return state;
  }
}

function getGhostY(board: Cell[][], current: Piece): number {
  let y = current.y;
  while (!collides(board, current.shape, current.x, y + 1)) y++;
  return y;
}

export default function TetrisGame() {
  // The first render uses a fixed piece order so the prerendered HTML matches hydration;
  // the random game and the saved high score are applied after mount.
  const [state, dispatch] = useReducer(reducer, undefined, () => createInitialState(0, [...PIECE_TYPES]));

  useEffect(() => {
    let saved = 0;
    try {
      saved = Number(window.localStorage.getItem(HIGH_SCORE_KEY)) || 0;
    } catch {
      // Storage unavailable (private mode, blocked); start without a saved high score.
    }
    dispatch({ type: "START", highScore: saved });
  }, []);

  useEffect(() => {
    if (!state.gameOver || state.highScore <= 0) return;
    try {
      window.localStorage.setItem(HIGH_SCORE_KEY, String(state.highScore));
    } catch {
      // Ignore write failures; the high score still shows for this session.
    }
  }, [state.gameOver, state.highScore]);

  useEffect(() => {
    if (state.gameOver || state.paused) return;
    const interval = setInterval(() => dispatch({ type: "TICK" }), dropInterval(state.level));
    return () => clearInterval(interval);
  }, [state.level, state.gameOver, state.paused]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const preventKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Spacebar"];
    if (preventKeys.includes(e.key)) e.preventDefault();
    switch (e.key) {
      case "ArrowLeft":
        dispatch({ type: "MOVE_LEFT" });
        break;
      case "ArrowRight":
        dispatch({ type: "MOVE_RIGHT" });
        break;
      case "ArrowDown":
        dispatch({ type: "SOFT_DROP" });
        break;
      case "ArrowUp":
        if (!e.repeat) dispatch({ type: "ROTATE" });
        break;
      case " ":
      case "Spacebar":
        if (!e.repeat) dispatch({ type: "HARD_DROP" });
        break;
      case "c":
      case "C":
      case "Shift":
        if (!e.repeat) dispatch({ type: "HOLD" });
        break;
      case "p":
      case "P":
        if (!e.repeat) dispatch({ type: "TOGGLE_PAUSE" });
        break;
      case "r":
      case "R":
        if (!e.repeat) dispatch({ type: "RESTART" });
        break;
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const display: (Cell | "ghost")[][] = state.board.map((row) => [...row]);
  const ghostY = getGhostY(state.board, state.current);
  state.current.shape.forEach((row, r) => {
    row.forEach((v, c) => {
      if (!v) return;
      const gy = ghostY + r;
      const gx = state.current.x + c;
      if (gy >= 0 && gy < ROWS && gx >= 0 && gx < COLS && !display[gy][gx]) {
        display[gy][gx] = "ghost";
      }
    });
  });
  state.current.shape.forEach((row, r) => {
    row.forEach((v, c) => {
      if (!v) return;
      const py = state.current.y + r;
      const px = state.current.x + c;
      if (py >= 0 && py < ROWS && px >= 0 && px < COLS) {
        display[py][px] = state.current.color;
      }
    });
  });

  // Cells shrink on narrow screens so board + side panel fit in 320px; 24px from the sm breakpoint up.
  const boardStyle = {
    "--cell": "clamp(16px, calc((100vw - 128px) / 10), 24px)",
    gridTemplateColumns: `repeat(${COLS}, var(--cell))`,
    gridTemplateRows: `repeat(${ROWS}, var(--cell))`,
  } as CSSProperties;

  const buttonClass =
    "rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900";
  const padClass = "rounded-lg bg-zinc-200 py-3 text-lg dark:bg-zinc-800";

  return (
    <div className="flex flex-col items-center gap-6 py-10 px-4 font-mono">
      <div className="flex w-full max-w-sm items-center justify-between">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
          ← 홈으로
        </Link>
        <h1 className="text-xl font-bold tracking-tight">테트리스</h1>
        <div className="w-12" />
      </div>

      <div className="flex gap-3 sm:gap-6">
        <div className="relative grid self-start border border-zinc-300 dark:border-zinc-700" style={boardStyle}>
          {display.map((row, r) =>
            row.map((cell, c) => (
              <div
                key={`${r}-${c}`}
                className="border border-zinc-100 dark:border-zinc-900"
                style={
                  cell === "ghost"
                    ? { boxShadow: "inset 0 0 0 2px rgba(120,120,120,0.5)" }
                    : cell
                      ? { backgroundColor: cell }
                      : undefined
                }
              />
            )),
          )}

          {(state.paused || state.gameOver) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-white">
              <p className="text-lg font-bold">{state.gameOver ? "게임 오버" : "일시정지"}</p>
              {state.gameOver && state.score > 0 && state.score >= state.highScore && (
                <p className="text-sm text-yellow-300">최고 기록!</p>
              )}
              <button
                onClick={() => dispatch({ type: state.gameOver ? "RESTART" : "TOGGLE_PAUSE" })}
                className="rounded-full bg-white/90 px-4 py-1 text-sm font-medium text-black hover:bg-white"
              >
                {state.gameOver ? "다시 시작" : "계속하기"}
              </button>
            </div>
          )}
        </div>

        <div className="flex w-20 flex-col gap-3 text-sm sm:w-28 sm:gap-4">
          <div>
            <p className="text-zinc-500">다음</p>
            <MiniPiece type={state.queue[0]} />
          </div>
          <div>
            <p className="text-zinc-500">홀드</p>
            <MiniPiece type={state.hold} dimmed={!state.canHold} />
          </div>
          <div>
            <p className="text-zinc-500">점수</p>
            <p className="text-lg font-semibold">{state.score}</p>
          </div>
          <div>
            <p className="text-zinc-500">최고</p>
            <p className="text-lg font-semibold">{Math.max(state.highScore, state.score)}</p>
          </div>
          <div>
            <p className="text-zinc-500">레벨</p>
            <p className="text-lg font-semibold">{state.level}</p>
          </div>
          <div>
            <p className="text-zinc-500">줄</p>
            <p className="text-lg font-semibold">{state.lines}</p>
          </div>
          <div className="flex flex-col gap-1">
            <button onClick={() => dispatch({ type: "TOGGLE_PAUSE" })} className={buttonClass}>
              일시정지<span className="hidden sm:inline"> (P)</span>
            </button>
            <button onClick={() => dispatch({ type: "RESTART" })} className={buttonClass}>
              재시작<span className="hidden sm:inline"> (R)</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid w-full max-w-xs grid-cols-3 gap-2 sm:hidden">
        <button onClick={() => dispatch({ type: "MOVE_LEFT" })} className={padClass}>
          ←
        </button>
        <button onClick={() => dispatch({ type: "ROTATE" })} className={padClass}>
          ↻
        </button>
        <button onClick={() => dispatch({ type: "MOVE_RIGHT" })} className={padClass}>
          →
        </button>
        <button onClick={() => dispatch({ type: "SOFT_DROP" })} className={padClass}>
          ↓
        </button>
        <button onClick={() => dispatch({ type: "HOLD" })} className={`${padClass} text-sm`}>
          홀드
        </button>
        <button onClick={() => dispatch({ type: "HARD_DROP" })} className={`${padClass} text-sm`}>
          드롭
        </button>
      </div>

      <p className="max-w-sm text-center text-xs text-zinc-500">
        ←→ 이동 · ↑ 회전 · ↓ 소프트 드롭 · Space 하드 드롭 · C/Shift 홀드 · P 일시정지 · R 재시작
      </p>
    </div>
  );
}

function MiniPiece({ type, dimmed = false }: { type: PieceType | null; dimmed?: boolean }) {
  // Fixed 4x4 frame keeps the side panel from shifting as pieces change.
  const shape = type ? SHAPES[type] : [];
  return (
    <div
      className={`mt-1 grid ${dimmed ? "opacity-40" : ""}`}
      style={{ gridTemplateColumns: "repeat(4, 14px)", gridTemplateRows: "repeat(4, 14px)" }}
    >
      {Array.from({ length: 16 }, (_, i) => {
        const filled = type && shape[Math.floor(i / 4)]?.[i % 4];
        return (
          <div
            key={i}
            className="border border-zinc-100 dark:border-zinc-900"
            style={filled ? { backgroundColor: COLORS[type] } : undefined}
          />
        );
      })}
    </div>
  );
}
