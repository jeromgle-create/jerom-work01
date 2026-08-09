"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

const WIDTH = 320;
const HEIGHT = 560;
const LANE_LEFT = 40;
const LANE_RIGHT = WIDTH - 40;
const BALL_RADIUS = 11;
const PIN_RADIUS = 9;
const AIM_SPEED = 3.2;
const STEER_ACCEL = 0.18;
const MAX_STEER_SPEED = 3;
const BALL_SPEED = 7.5;
const PIN_TOP_Y = 90;
const ROW_GAP = 26;
const PIN_GAP_X = 24;
const CHAIN_RADIUS = 30;
const FINISH_Y = PIN_TOP_Y - 50;
const SETTLE_FRAMES = 35;
const FOUL_LINE_Y = HEIGHT - 50;
const BALL_START_Y = HEIGHT - 40;

interface Pin {
  id: number;
  x: number;
  y: number;
  standing: boolean;
}

interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface FrameState {
  rolls: number[];
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function createPins(): Pin[] {
  const rows = [
    { count: 4, y: PIN_TOP_Y },
    { count: 3, y: PIN_TOP_Y + ROW_GAP },
    { count: 2, y: PIN_TOP_Y + ROW_GAP * 2 },
    { count: 1, y: PIN_TOP_Y + ROW_GAP * 3 },
  ];
  const pins: Pin[] = [];
  let id = 0;
  for (const row of rows) {
    for (let i = 0; i < row.count; i++) {
      const x = WIDTH / 2 + (i - (row.count - 1) / 2) * PIN_GAP_X;
      pins.push({ id: id++, x, y: row.y, standing: true });
    }
  }
  return pins;
}

function standingCount(pins: Pin[]) {
  return pins.filter((p) => p.standing).length;
}

function computeScore(frames: FrameState[]): number {
  const rolls = frames.flatMap((f) => f.rolls);
  let score = 0;
  let i = 0;
  for (let frame = 0; frame < 10; frame++) {
    if (rolls[i] === undefined) break;
    if (rolls[i] === 10) {
      score += 10 + (rolls[i + 1] ?? 0) + (rolls[i + 2] ?? 0);
      i += 1;
    } else if (rolls[i + 1] !== undefined && rolls[i] + rolls[i + 1] === 10) {
      score += 10 + (rolls[i + 2] ?? 0);
      i += 2;
    } else if (rolls[i + 1] !== undefined) {
      score += rolls[i] + rolls[i + 1];
      i += 2;
    } else {
      score += rolls[i];
      i += 1;
    }
  }
  return score;
}

function frameLabels(rolls: number[], isTenth: boolean): string[] {
  const label = (n: number) => (n === 10 ? "X" : n === 0 ? "-" : String(n));

  if (!isTenth) {
    const [r1, r2] = rolls;
    if (r1 === undefined) return ["", ""];
    if (r1 === 10) return ["X", ""];
    if (r2 === undefined) return [label(r1), ""];
    if (r1 + r2 === 10) return [label(r1), "/"];
    return [label(r1), label(r2)];
  }

  const [r1, r2, r3] = rolls;
  const out = ["", "", ""];
  if (r1 === undefined) return out;
  out[0] = label(r1);
  if (r2 === undefined) return out;
  if (r1 === 10) {
    out[1] = label(r2);
  } else if (r1 + r2 === 10) {
    out[1] = "/";
  } else {
    out[1] = label(r2);
  }
  if (r3 === undefined) return out;
  if (r1 === 10 && r2 === 10) {
    out[2] = label(r3);
  } else if (r1 === 10 && r2 + r3 === 10) {
    out[2] = "/";
  } else if (r1 !== 10 && r1 + r2 === 10) {
    out[2] = label(r3);
  } else {
    out[2] = label(r3);
  }
  return out;
}

export default function BowlingGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  const pinsRef = useRef<Pin[]>(createPins());
  const ballRef = useRef<BallState>({ x: WIDTH / 2, y: BALL_START_Y, vx: 0, vy: 0 });
  const aimXRef = useRef(WIDTH / 2);
  const phaseRef = useRef<"aiming" | "rolling" | "settling">("aiming");
  const settleTimerRef = useRef(0);
  const standingBeforeRollRef = useRef(10);
  const frameIndexRef = useRef(0);
  const framesRef = useRef<number[][]>(Array.from({ length: 10 }, () => []));
  const keysRef = useRef<Set<string>>(new Set());
  const touchDirRef = useRef<-1 | 0 | 1>(0);
  const pausedRef = useRef(false);
  const gameOverRef = useRef(false);

  const [frames, setFrames] = useState<FrameState[]>(() =>
    Array.from({ length: 10 }, () => ({ rolls: [] })),
  );
  const [frameIndexState, setFrameIndexState] = useState(0);
  const [paused, setPaused] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    gameOverRef.current = gameOver;
  }, [gameOver]);

  const syncFramesState = useCallback(() => {
    setFrames(framesRef.current.map((rolls) => ({ rolls: [...rolls] })));
  }, []);

  const resetGame = useCallback(() => {
    pinsRef.current = createPins();
    framesRef.current = Array.from({ length: 10 }, () => []);
    frameIndexRef.current = 0;
    phaseRef.current = "aiming";
    aimXRef.current = WIDTH / 2;
    ballRef.current = { x: WIDTH / 2, y: BALL_START_Y, vx: 0, vy: 0 };
    settleTimerRef.current = 0;
    setFrames(Array.from({ length: 10 }, () => ({ rolls: [] })));
    setFrameIndexState(0);
    setGameOver(false);
    setPaused(false);
    setMessage("");
  }, []);

  const prepareNextRoll = useCallback((resetPins: boolean) => {
    if (resetPins) pinsRef.current = createPins();
    aimXRef.current = WIDTH / 2;
    ballRef.current = { x: WIDTH / 2, y: BALL_START_Y, vx: 0, vy: 0 };
    phaseRef.current = "aiming";
  }, []);

  const endGame = useCallback(() => {
    gameOverRef.current = true;
    setGameOver(true);
  }, []);

  const goToNextFrame = useCallback(
    (resetPins: boolean) => {
      frameIndexRef.current += 1;
      setFrameIndexState(frameIndexRef.current);
      if (frameIndexRef.current >= 10) {
        endGame();
        return;
      }
      prepareNextRoll(resetPins);
    },
    [endGame, prepareNextRoll],
  );

  const finishRoll = useCallback(() => {
    const standingAfter = standingCount(pinsRef.current);
    const knocked = standingBeforeRollRef.current - standingAfter;
    const frameIdx = frameIndexRef.current;
    framesRef.current[frameIdx] = [...framesRef.current[frameIdx], knocked];
    syncFramesState();

    if (frameIdx < 9) {
      if (framesRef.current[frameIdx].length === 1) {
        if (knocked === 10) {
          setMessage("스트라이크!");
          goToNextFrame(true);
        } else {
          setMessage(knocked === 0 ? "거터!" : `${knocked}개 쓰러뜨림`);
          prepareNextRoll(false);
        }
      } else {
        const [r1, r2] = framesRef.current[frameIdx];
        setMessage(r1 + r2 === 10 ? "스페어!" : `${r1 + r2}개로 프레임 종료`);
        goToNextFrame(true);
      }
    } else {
      const rolls = framesRef.current[9];
      if (rolls.length === 1) {
        if (knocked === 10) {
          setMessage("스트라이크! 보너스 굴리기");
          prepareNextRoll(true);
        } else {
          setMessage(knocked === 0 ? "거터!" : `${knocked}개 쓰러뜨림`);
          prepareNextRoll(false);
        }
      } else if (rolls.length === 2) {
        const [r1, r2] = rolls;
        if (r1 === 10) {
          if (r2 === 10) {
            setMessage("더블 스트라이크! 보너스 굴리기");
            prepareNextRoll(true);
          } else {
            setMessage(`${r2}개! 보너스 굴리기`);
            prepareNextRoll(false);
          }
        } else if (r1 + r2 === 10) {
          setMessage("스페어! 보너스 굴리기");
          prepareNextRoll(true);
        } else {
          setMessage("게임 종료!");
          endGame();
        }
      } else {
        setMessage("게임 종료!");
        endGame();
      }
    }
  }, [endGame, goToNextFrame, prepareNextRoll, syncFramesState]);

  const startRoll = useCallback(() => {
    if (phaseRef.current !== "aiming" || pausedRef.current || gameOverRef.current) return;
    standingBeforeRollRef.current = standingCount(pinsRef.current);
    ballRef.current = { x: aimXRef.current, y: BALL_START_Y, vx: 0, vy: -BALL_SPEED };
    phaseRef.current = "rolling";
    setMessage("");
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasCtx = canvas.getContext("2d");
    if (!canvasCtx) return;
    const ctx = canvasCtx;

    function knockChain(startPin: Pin) {
      const visited = new Set<number>([startPin.id]);
      startPin.standing = false;
      const stack: Pin[] = [startPin];
      while (stack.length) {
        const cur = stack.pop()!;
        for (const p of pinsRef.current) {
          if (p.standing && !visited.has(p.id)) {
            const d = Math.hypot(p.x - cur.x, p.y - cur.y);
            if (d <= CHAIN_RADIUS) {
              p.standing = false;
              visited.add(p.id);
              stack.push(p);
            }
          }
        }
      }
    }

    function update() {
      const keys = keysRef.current;
      const left = keys.has("ArrowLeft") || keys.has("a") || keys.has("A") || touchDirRef.current === -1;
      const right = keys.has("ArrowRight") || keys.has("d") || keys.has("D") || touchDirRef.current === 1;

      if (phaseRef.current === "aiming") {
        if (left) {
          aimXRef.current = clamp(aimXRef.current - AIM_SPEED, LANE_LEFT + BALL_RADIUS, LANE_RIGHT - BALL_RADIUS);
        }
        if (right) {
          aimXRef.current = clamp(aimXRef.current + AIM_SPEED, LANE_LEFT + BALL_RADIUS, LANE_RIGHT - BALL_RADIUS);
        }
        ballRef.current.x = aimXRef.current;
        ballRef.current.y = BALL_START_Y;
      } else if (phaseRef.current === "rolling") {
        const ball = ballRef.current;
        if (left) ball.vx = Math.max(-MAX_STEER_SPEED, ball.vx - STEER_ACCEL);
        if (right) ball.vx = Math.min(MAX_STEER_SPEED, ball.vx + STEER_ACCEL);

        ball.x += ball.vx;
        ball.y += ball.vy;

        if (ball.x < LANE_LEFT + BALL_RADIUS) {
          ball.x = LANE_LEFT + BALL_RADIUS;
          ball.vx = 0;
        } else if (ball.x > LANE_RIGHT - BALL_RADIUS) {
          ball.x = LANE_RIGHT - BALL_RADIUS;
          ball.vx = 0;
        }

        for (const pin of pinsRef.current) {
          if (!pin.standing) continue;
          const dx = ball.x - pin.x;
          const dy = ball.y - pin.y;
          const dist = Math.hypot(dx, dy);
          if (dist <= BALL_RADIUS + PIN_RADIUS) {
            knockChain(pin);
            ball.vx = clamp(ball.vx + (dx / (dist || 1)) * 0.6, -6, 6);
            ball.vy = Math.min(ball.vy * 0.92, -3);
          }
        }

        if (ball.y <= FINISH_Y) {
          phaseRef.current = "settling";
          settleTimerRef.current = SETTLE_FRAMES;
        }
      } else if (phaseRef.current === "settling") {
        settleTimerRef.current -= 1;
        if (settleTimerRef.current <= 0) {
          finishRoll();
        }
      }
    }

    function draw() {
      ctx.fillStyle = "#1c1917";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, LANE_LEFT, HEIGHT);
      ctx.fillRect(LANE_RIGHT, 0, WIDTH - LANE_RIGHT, HEIGHT);

      ctx.fillStyle = "#d6b98c";
      ctx.fillRect(LANE_LEFT, 0, LANE_RIGHT - LANE_LEFT, HEIGHT);

      ctx.strokeStyle = "rgba(0,0,0,0.08)";
      ctx.lineWidth = 1;
      for (let gx = LANE_LEFT + 20; gx < LANE_RIGHT; gx += 20) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, HEIGHT);
        ctx.stroke();
      }

      ctx.strokeStyle = "#7f1d1d";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(LANE_LEFT, FOUL_LINE_Y);
      ctx.lineTo(LANE_RIGHT, FOUL_LINE_Y);
      ctx.stroke();

      if (phaseRef.current === "aiming") {
        ctx.strokeStyle = "rgba(0,0,0,0.15)";
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(aimXRef.current, FOUL_LINE_Y);
        ctx.lineTo(aimXRef.current, PIN_TOP_Y + ROW_GAP * 3 + 10);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      for (const pin of pinsRef.current) {
        if (!pin.standing) continue;
        ctx.beginPath();
        ctx.ellipse(pin.x, pin.y, PIN_RADIUS * 0.7, PIN_RADIUS, 0, 0, Math.PI * 2);
        ctx.fillStyle = "#f8fafc";
        ctx.fill();
        ctx.strokeStyle = "#dc2626";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      const ball = ballRef.current;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = "#1d4ed8";
      ctx.fill();
    }

    function frame() {
      if (!pausedRef.current && !gameOverRef.current) update();
      draw();
      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [finishRoll]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const preventKeys = ["ArrowLeft", "ArrowRight", " ", "Spacebar"];
      if (preventKeys.includes(e.key)) e.preventDefault();
      keysRef.current.add(e.key);
      if (e.key === " " && !e.repeat) startRoll();
      if ((e.key === "p" || e.key === "P") && !e.repeat && !gameOverRef.current) {
        setPaused((p) => !p);
      }
      if ((e.key === "r" || e.key === "R") && !e.repeat) {
        resetGame();
      }
    },
    [resetGame, startRoll],
  );

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    keysRef.current.delete(e.key);
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  const totalScore = computeScore(frames);
  const isTenth = frameIndexState === 9;

  return (
    <div className="flex flex-col items-center gap-6 py-10 px-4 font-mono">
      <div className="flex w-full max-w-xl items-center justify-between">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
          ← 홈으로
        </Link>
        <h1 className="text-xl font-bold tracking-tight">볼링</h1>
        <div className="w-12" />
      </div>

      <div className="flex w-full max-w-xl items-center justify-between px-2 text-lg font-semibold">
        <span>총점 {totalScore}</span>
        <span className="text-sm font-normal text-zinc-500">
          {message || `${Math.min(frameIndexState + 1, 10)} / 10 프레임`}
        </span>
      </div>

      <div className="grid w-full max-w-xl grid-cols-10 gap-1 overflow-x-auto text-[10px] sm:text-xs">
        {frames.map((f, idx) => {
          const labels = frameLabels(f.rolls, idx === 9);
          return (
            <div
              key={idx}
              className={`flex flex-col items-center rounded border px-0.5 py-1 ${
                idx === frameIndexState && !gameOver
                  ? "border-zinc-500 bg-zinc-100 dark:bg-zinc-900"
                  : "border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <span className="text-zinc-400">{idx + 1}</span>
              <div className="flex gap-0.5">
                {labels.map((l, i) => (
                  <span key={i} className="min-w-[10px] text-center font-semibold">
                    {l}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="relative w-full max-w-xl">
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          className="mx-auto block h-auto max-h-[70vh] w-auto rounded-lg border border-zinc-300 dark:border-zinc-700"
        />

        {(paused || gameOver) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-black/60 text-white">
            <p className="text-lg font-bold">
              {gameOver ? `게임 종료! 최종 점수 ${totalScore}` : "일시정지"}
            </p>
            <button
              onClick={() => (gameOver ? resetGame() : setPaused(false))}
              className="rounded-full bg-white/90 px-4 py-1 text-sm font-medium text-black hover:bg-white"
            >
              {gameOver ? "다시 시작" : "계속하기"}
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={startRoll}
          disabled={gameOver || paused}
          className="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          던지기 (Space)
        </button>
        <button
          onClick={() => setPaused((p) => !p)}
          disabled={gameOver}
          className="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          일시정지 (P)
        </button>
        <button
          onClick={resetGame}
          className="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          재시작 (R)
        </button>
      </div>

      <div className="grid w-40 grid-cols-2 gap-2 sm:hidden">
        <button
          onPointerDown={() => (touchDirRef.current = -1)}
          onPointerUp={() => (touchDirRef.current = 0)}
          onPointerLeave={() => (touchDirRef.current = 0)}
          className="rounded-lg bg-zinc-200 py-4 text-lg dark:bg-zinc-800"
        >
          ←
        </button>
        <button
          onPointerDown={() => (touchDirRef.current = 1)}
          onPointerUp={() => (touchDirRef.current = 0)}
          onPointerLeave={() => (touchDirRef.current = 0)}
          className="rounded-lg bg-zinc-200 py-4 text-lg dark:bg-zinc-800"
        >
          →
        </button>
      </div>

      <p className="max-w-xl text-center text-xs text-zinc-500">
        ←→ 또는 A/D 로 조준 · Space 로 굴리기 · 굴리는 중에도 ←→ 로 커브 조절 · P 일시정지 · R 재시작
        {isTenth && " · 10프레임 스트라이크/스페어 시 보너스 굴리기"}
      </p>
    </div>
  );
}
