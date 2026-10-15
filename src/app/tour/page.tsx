import type { Metadata } from "next";
import Link from "next/link";
import TourExplorer from "./TourExplorer";

export const metadata: Metadata = {
  title: "주변 관광지·축제 찾기",
  description: "한국관광공사 공공데이터로 지역별·내 주변 관광지와 축제를 찾아보는 페이지",
};

export default function TourPage() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 dark:bg-black">
      <main className="flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-12 sm:px-8 sm:py-16">
        <header className="flex flex-col gap-2">
          <Link href="/" className="text-sm text-zinc-500 hover:underline">
            ← 홈으로
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
            주변 관광지·축제 찾기
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            지역을 고르거나 내 위치를 기준으로 관광지와 다가오는 축제를 찾아보세요.
          </p>
        </header>
        <TourExplorer />
        <footer className="text-xs text-zinc-500">
          데이터 출처: 한국관광공사 국문 관광정보 서비스 (공공데이터포털)
        </footer>
      </main>
    </div>
  );
}
