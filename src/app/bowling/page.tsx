import type { Metadata } from "next";
import BowlingGame from "./BowlingGame";

export const metadata: Metadata = {
  title: "볼링",
  description: "10프레임 정식 규칙을 적용한 미니 볼링 게임",
};

export default function BowlingPage() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 dark:bg-black">
      <BowlingGame />
    </div>
  );
}
