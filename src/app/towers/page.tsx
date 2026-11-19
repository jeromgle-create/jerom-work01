import type { Metadata } from "next";
import TowerExplorer from "./TowerExplorer";

export const metadata: Metadata = {
  title: "전국 탑 정보",
  description: "전국GIS건물통합정보표준데이터 기반 전국 탑 위치·속성 정보 (샘플 데이터)",
};

export default function TowersPage() {
  return (
    <div className="flex flex-1 flex-col bg-white dark:bg-zinc-950">
      <TowerExplorer />
    </div>
  );
}
