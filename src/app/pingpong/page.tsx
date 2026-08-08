import type { Metadata } from "next";
import PingPongGame from "./PingPongGame";

export const metadata: Metadata = {
  title: "핑퐁",
  description: "AI를 상대로 즐기는 간단한 핑퐁(퐁) 게임",
};

export default function PingPongPage() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 dark:bg-black">
      <PingPongGame />
    </div>
  );
}
