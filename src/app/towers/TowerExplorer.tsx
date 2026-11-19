"use client";

import dynamic from "next/dynamic";
import { useDeferredValue, useMemo, useState } from "react";
import { classifyAll, TOWER_TYPES, TYPE_COLORS } from "./lib/classify";
import { FIELD_LABELS, type Tower, type TowerType } from "./lib/types";
import { sampleBuildings } from "./data/sample-buildings";

const TowerMap = dynamic(() => import("./TowerMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500">지도 불러오는 중…</div>,
});

type SortKey = "height" | "name" | "year";

const { towers: ALL, excluded: EXCLUDED } = classifyAll(sampleBuildings);
const SIDO_LIST = [...new Set(ALL.map((t) => t.sido))].sort((a, b) => a.localeCompare(b, "ko"));
const MAX_HEIGHT = Math.ceil(Math.max(...ALL.map((t) => t.height)));

function fmt(v: unknown, unit?: string) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") return `${v.toLocaleString("ko-KR")}${unit ? ` ${unit}` : ""}`;
  return `${v}${unit ? ` ${unit}` : ""}`;
}

export default function TowerExplorer() {
  const [query, setQuery] = useState("");
  const [sido, setSido] = useState("전체");
  const [types, setTypes] = useState<Set<TowerType>>(new Set(TOWER_TYPES));
  const [minHeight, setMinHeight] = useState(0);
  const [sort, setSort] = useState<SortKey>("height");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const q = useDeferredValue(query.trim());

  const filtered = useMemo(() => {
    const list = ALL.filter(
      (t) =>
        (sido === "전체" || t.sido === sido) &&
        types.has(t.towerType) &&
        t.height >= minHeight &&
        (!q || t.bldName.includes(q) || t.bjdName.includes(q)),
    );
    list.sort((a, b) => {
      if (sort === "height") return b.height - a.height;
      if (sort === "name") return a.bldName.localeCompare(b.bldName, "ko");
      return (a.useAprDay ?? "9999").localeCompare(b.useAprDay ?? "9999");
    });
    return list;
  }, [q, sido, types, minHeight, sort]);

  const selected: Tower | undefined = ALL.find((t) => t.gisId === selectedId);

  const toggleType = (t: TowerType) =>
    setTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const resetFilters = () => {
    setQuery("");
    setSido("전체");
    setTypes(new Set(TOWER_TYPES));
    setMinHeight(0);
  };

  return (
    <div className="flex w-full flex-1 flex-col">
      <header className="border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">전국 탑 정보</h1>
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
            샘플 데이터 · 속성값은 가상
          </span>
          <p className="w-full text-xs text-zinc-500 sm:w-auto">
            출처 형식: 전국GIS건물통합정보표준데이터(국토교통부) · 건물 {sampleBuildings.length}건 중 탑 {ALL.length}건 분류
            (제외 {EXCLUDED}건)
          </p>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col lg:flex-row lg:overflow-hidden">
        {/* 좌측: 필터 + 목록 */}
        <aside className="order-2 flex flex-col border-zinc-200 lg:order-1 lg:h-[calc(100vh-57px)] lg:w-[380px] lg:border-r dark:border-zinc-800">
          <div className="space-y-3 border-b border-zinc-200 p-4 dark:border-zinc-800">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="탑 이름 또는 주소 검색"
              aria-label="탑 이름 또는 주소 검색"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <div className="flex gap-2">
              <select
                value={sido}
                onChange={(e) => setSido(e.target.value)}
                aria-label="시도"
                className="flex-1 rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option>전체</option>
                {SIDO_LIST.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                aria-label="정렬"
                className="flex-1 rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option value="height">높이 높은 순</option>
                <option value="name">이름 순</option>
                <option value="year">사용승인 오래된 순</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="탑 유형">
              {TOWER_TYPES.map((t) => {
                const on = types.has(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleType(t)}
                    aria-pressed={on}
                    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                      on
                        ? "border-zinc-400 bg-zinc-100 text-zinc-900 dark:border-zinc-500 dark:bg-zinc-800 dark:text-zinc-100"
                        : "border-zinc-200 text-zinc-400 dark:border-zinc-800 dark:text-zinc-600"
                    }`}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: on ? TYPE_COLORS[t] : "#a1a1aa" }} />
                    {t}
                  </button>
                );
              })}
            </div>
            <label className="block text-xs text-zinc-600 dark:text-zinc-400">
              최소 높이: <strong className="text-zinc-900 dark:text-zinc-100">{minHeight}m</strong>
              <input
                type="range"
                min={0}
                max={MAX_HEIGHT}
                step={5}
                value={minHeight}
                onChange={(e) => setMinHeight(Number(e.target.value))}
                className="mt-1 w-full accent-blue-600"
              />
            </label>
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>
                검색 결과 <strong className="text-zinc-900 dark:text-zinc-100">{filtered.length}</strong>건
              </span>
              <button type="button" onClick={resetFilters} className="underline hover:text-zinc-900 dark:hover:text-zinc-100">
                필터 초기화
              </button>
            </div>
          </div>

          <ul className="flex-1 divide-y divide-zinc-100 overflow-y-auto dark:divide-zinc-900">
            {filtered.length === 0 && <li className="p-6 text-center text-sm text-zinc-500">조건에 맞는 탑이 없습니다.</li>}
            {filtered.map((t) => (
              <li key={t.gisId}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(t.gisId);
                    if (window.innerWidth < 1024) document.getElementById("tower-map")?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-900 ${
                    t.gisId === selectedId ? "bg-blue-50 dark:bg-blue-950/40" : ""
                  }`}
                >
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: TYPE_COLORS[t.towerType] }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{t.bldName}</span>
                    <span className="block truncate text-xs text-zinc-500">{t.bjdName}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">{t.height}m</span>
                    <span className="block text-[11px] text-zinc-500">{t.towerType}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* 우측: 지도 + 상세 */}
        <section id="tower-map" className="relative order-1 h-[55vh] min-h-[320px] flex-none lg:flex-1 lg:order-2 lg:h-[calc(100vh-57px)]">
          <TowerMap towers={filtered} selectedId={selectedId} onSelect={setSelectedId} />

          {selected && (
            <div className="absolute inset-x-2 bottom-2 z-[1000] max-h-[70%] overflow-y-auto rounded-lg border border-zinc-200 bg-white/95 shadow-xl backdrop-blur sm:inset-x-auto sm:right-3 sm:bottom-auto sm:top-3 sm:w-[340px] dark:border-zinc-700 dark:bg-zinc-900/95">
              <div className="sticky top-0 flex items-start justify-between gap-2 border-b border-zinc-200 bg-inherit p-3 dark:border-zinc-700">
                <div>
                  <span
                    className="mb-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-medium text-white"
                    style={{ background: TYPE_COLORS[selected.towerType] }}
                  >
                    {selected.towerType}
                  </span>
                  <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">{selected.bldName}</h2>
                  <p className="text-xs text-zinc-500">
                    {selected.bjdName} {selected.jibun}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  aria-label="상세 닫기"
                  className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                >
                  ✕
                </button>
              </div>
              <dl className="grid grid-cols-3 gap-2 p-3 text-center">
                {[
                  ["높이", fmt(selected.height, "m")],
                  ["층수", `${selected.grndFloors}/${selected.ugrndFloors}`],
                  ["사용승인", selected.useAprDay?.slice(0, 4) ?? "—"],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-md bg-zinc-50 p-2 dark:bg-zinc-800">
                    <dt className="text-[11px] text-zinc-500">{k}</dt>
                    <dd className="text-sm font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">{v}</dd>
                  </div>
                ))}
              </dl>
              <table className="w-full text-xs">
                <tbody>
                  {FIELD_LABELS.map((f) => (
                    <tr key={f.key} className="border-t border-zinc-100 dark:border-zinc-800">
                      <th scope="row" className="w-[45%] px-3 py-1.5 text-left font-normal text-zinc-500">
                        <span className="mr-1 font-mono text-[10px] text-zinc-400">{f.code}</span>
                        {f.label}
                      </th>
                      <td className="px-3 py-1.5 text-zinc-900 tabular-nums break-all dark:text-zinc-100">{fmt(selected[f.key], f.unit)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-zinc-100 dark:border-zinc-800">
                    <th scope="row" className="px-3 py-1.5 text-left font-normal text-zinc-500">좌표(WGS84)</th>
                    <td className="px-3 py-1.5 text-zinc-900 tabular-nums dark:text-zinc-100">
                      {selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
