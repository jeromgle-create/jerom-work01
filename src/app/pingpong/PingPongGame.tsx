"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

const WIDTH = 600;
const HEIGHT = 400;
const PADDLE_WIDTH = 10;
const PADDLE_HEIGHT = 80;
const PADDLE_MARGIN = 16;
const PADDLE_SPEED = 6.5;
const AI_SPEED = 5;
const BALL_SIZE = 10;
const BASE_BALL_SPEED = 4.5;
const MAX_BALL_SPEED = 11;
const WIN_SCORE = 5;
const SERVE_DELAY_FRAMES = 40;

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function randomServe(direction: 1 | -1): Ball {
  const angle = (Math.random() * 0.6 - 0.3) * Math.PI;
  return {
    x: WIDTH / 2,
    y: HEIGHT / 2,
    vx: Math.cos(angle) * BASE_BALL_SPEED * direction,
    vy: Math.sin(angle) * BASE_BALL_SPEED,
  };
}

export default function PingPongGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  const playerYRef = useRef(HEIGHT / 2 - PADDLE_HEIGHT / 2);
  const aiYRef = useRef(HEIGHT / 2 - PADDLE_HEIGHT / 2);
  const ballRef = useRef<Ball>(randomServe(1));
  const serveTimerRef = useRef(0);
  const keysRef = useRef<Set<string>>(new Set());

  const pausedRef = useRef(false);
  const gameOverRef = useRef(false);
  const playerScoreRef = useRef(0);
  const aiScoreRef = useRef(0);

  const [playerScore, setPlayerScore] = useState(0);
  const [aiScore, setAiScore] = useState(0);
  const [paused, setPaused] = useState(false);
  const [winner, setWinner] = useState<"player" | "ai" | null>(null);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    gameOverRef.current = winner !== null;
  }, [winner]);

  useEffect(() => {
    playerScoreRef.current = playerScore;
  }, [playerScore]);

  useEffect(() => {
    aiScoreRef.current = aiScore;
  }, [aiScore]);

  const resetMatch = useCallback(() => {
    playerYRef.current = HEIGHT / 2 - PADDLE_HEIGHT / 2;
    aiYRef.current = HEIGHT / 2 - PADDLE_HEIGHT / 2;
    ballRef.current = randomServe(Math.random() < 0.5 ? 1 : -1);
    serveTimerRef.current = SERVE_DELAY_FRAMES;
    setPlayerScore(0);
    setAiScore(0);
    setWinner(null);
    setPaused(false);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasCtx = canvas.getContext("2d");
    if (!canvasCtx) return;
    const ctx = canvasCtx;

    function clampPaddle(y: number) {
      return Math.max(0, Math.min(HEIGHT - PADDLE_HEIGHT, y));
    }

    function update() {
      const keys = keysRef.current;
      if (keys.has("ArrowUp") || keys.has("w") || keys.has("W")) {
        playerYRef.current = clampPaddle(playerYRef.current - PADDLE_SPEED);
      }
      if (keys.has("ArrowDown") || keys.has("s") || keys.has("S")) {
        playerYRef.current = clampPaddle(playerYRef.current + PADDLE_SPEED);
      }

      const ball = ballRef.current;

      if (serveTimerRef.current > 0) {
        serveTimerRef.current -= 1;
        return;
      }

      const aiCenter = aiYRef.current + PADDLE_HEIGHT / 2;
      const ballTarget = ball.y;
      if (Math.abs(aiCenter - ballTarget) > 4) {
        aiYRef.current = clampPaddle(
          aiYRef.current + (ballTarget > aiCenter ? AI_SPEED : -AI_SPEED),
        );
      }

      ball.x += ball.vx;
      ball.y += ball.vy;

      if (ball.y <= BALL_SIZE / 2) {
        ball.y = BALL_SIZE / 2;
        ball.vy *= -1;
      } else if (ball.y >= HEIGHT - BALL_SIZE / 2) {
        ball.y = HEIGHT - BALL_SIZE / 2;
        ball.vy *= -1;
      }

      const playerX = PADDLE_MARGIN;
      const aiX = WIDTH - PADDLE_MARGIN - PADDLE_WIDTH;

      if (
        ball.vx < 0 &&
        ball.x - BALL_SIZE / 2 <= playerX + PADDLE_WIDTH &&
        ball.x - BALL_SIZE / 2 >= playerX &&
        ball.y >= playerYRef.current &&
        ball.y <= playerYRef.current + PADDLE_HEIGHT
      ) {
        const hitPos = (ball.y - (playerYRef.current + PADDLE_HEIGHT / 2)) / (PADDLE_HEIGHT / 2);
        const speed = Math.min(MAX_BALL_SPEED, Math.hypot(ball.vx, ball.vy) * 1.06);
        const angle = hitPos * (Math.PI / 3);
        ball.vx = Math.cos(angle) * speed;
        ball.vy = Math.sin(angle) * speed;
        ball.x = playerX + PADDLE_WIDTH + BALL_SIZE / 2;
      }

      if (
        ball.vx > 0 &&
        ball.x + BALL_SIZE / 2 >= aiX &&
        ball.x + BALL_SIZE / 2 <= aiX + PADDLE_WIDTH &&
        ball.y >= aiYRef.current &&
        ball.y <= aiYRef.current + PADDLE_HEIGHT
      ) {
        const hitPos = (ball.y - (aiYRef.current + PADDLE_HEIGHT / 2)) / (PADDLE_HEIGHT / 2);
        const speed = Math.min(MAX_BALL_SPEED, Math.hypot(ball.vx, ball.vy) * 1.06);
        const angle = hitPos * (Math.PI / 3);
        ball.vx = -Math.cos(angle) * speed;
        ball.vy = Math.sin(angle) * speed;
        ball.x = aiX - BALL_SIZE / 2;
      }

      if (ball.x < 0) {
        const nextScore = aiScoreRef.current + 1;
        setAiScore(nextScore);
        if (nextScore >= WIN_SCORE) {
          setWinner("ai");
        } else {
          ballRef.current = randomServe(1);
          serveTimerRef.current = SERVE_DELAY_FRAMES;
        }
      } else if (ball.x > WIDTH) {
        const nextScore = playerScoreRef.current + 1;
        setPlayerScore(nextScore);
        if (nextScore >= WIN_SCORE) {
          setWinner("player");
        } else {
          ballRef.current = randomServe(-1);
          serveTimerRef.current = SERVE_DELAY_FRAMES;
        }
      }
    }

    function draw() {
      ctx.fillStyle = "#09090b";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.setLineDash([8, 10]);
      ctx.beginPath();
      ctx.moveTo(WIDTH / 2, 0);
      ctx.lineTo(WIDTH / 2, HEIGHT);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "#fafafa";
      ctx.fillRect(PADDLE_MARGIN, playerYRef.current, PADDLE_WIDTH, PADDLE_HEIGHT);
      ctx.fillRect(
        WIDTH - PADDLE_MARGIN - PADDLE_WIDTH,
        aiYRef.current,
        PADDLE_WIDTH,
        PADDLE_HEIGHT,
      );

      const ball = ballRef.current;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL_SIZE / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    function frame() {
      if (!pausedRef.current && !gameOverRef.current) {
        update();
      }
      draw();
      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const preventKeys = ["ArrowUp", "ArrowDown", " ", "Spacebar"];
      if (preventKeys.includes(e.key)) e.preventDefault();
      keysRef.current.add(e.key);
      if ((e.key === "p" || e.key === "P") && !e.repeat && winner === null) {
        setPaused((p) => !p);
      }
      if ((e.key === "r" || e.key === "R") && !e.repeat) {
        resetMatch();
      }
    },
    [resetMatch, winner],
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

  const movePlayer = useCallback((direction: -1 | 1) => {
    playerYRef.current = Math.max(
      0,
      Math.min(HEIGHT - PADDLE_HEIGHT, playerYRef.current + direction * PADDLE_SPEED * 4),
    );
  }, []);

  return (
    <div className="flex flex-col items-center gap-6 py-10 px-4 font-mono">
      <div className="flex w-full max-w-xl items-center justify-between">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
          ← 홈으로
        </Link>
        <h1 className="text-xl font-bold tracking-tight">핑퐁</h1>
        <div className="w-12" />
      </div>

      <div className="flex w-full max-w-xl items-center justify-between px-2 text-lg font-semibold">
        <span>나 {playerScore}</span>
        <span className="text-sm font-normal text-zinc-500">
          {WIN_SCORE}점 선취 시 승리
        </span>
        <span>{aiScore} AI</span>
      </div>

      <div className="relative w-full max-w-xl">
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700"
        />

        {(paused || winner !== null) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-black/60 text-white">
            <p className="text-lg font-bold">
              {winner === "player" ? "승리!" : winner === "ai" ? "패배..." : "일시정지"}
            </p>
            <button
              onClick={() => (winner !== null ? resetMatch() : setPaused(false))}
              className="rounded-full bg-white/90 px-4 py-1 text-sm font-medium text-black hover:bg-white"
            >
              {winner !== null ? "다시 시작" : "계속하기"}
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setPaused((p) => !p)}
          disabled={winner !== null}
          className="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          일시정지 (P)
        </button>
        <button
          onClick={resetMatch}
          className="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          재시작 (R)
        </button>
      </div>

      <div className="grid w-40 grid-cols-2 gap-2 sm:hidden">
        <button
          onPointerDown={() => movePlayer(-1)}
          className="rounded-lg bg-zinc-200 py-4 text-lg dark:bg-zinc-800"
        >
          ↑
        </button>
        <button
          onPointerDown={() => movePlayer(1)}
          className="rounded-lg bg-zinc-200 py-4 text-lg dark:bg-zinc-800"
        >
          ↓
        </button>
      </div>

      <p className="max-w-xl text-center text-xs text-zinc-500">
        ↑↓ 또는 W/S 로 이동 · P 일시정지 · R 재시작
      </p>
    </div>
  );
}
