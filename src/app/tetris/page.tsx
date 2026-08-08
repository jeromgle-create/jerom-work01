import type { Metadata } from "next";
import TetrisGame from "./TetrisGame";

export const metadata: Metadata = {
  title: "테트리스",
  description: "키보드로 즐기는 간단한 테트리스 게임",
};

export default function TetrisPage() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 dark:bg-black">
      <TetrisGame />
    </div>
  );
}
