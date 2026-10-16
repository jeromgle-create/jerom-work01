"use client";

import { useEffect, useRef, useState } from "react";
import type { Place, Region } from "@/lib/tour";

type Kind = "spot" | "festival";
type Mode = "area" | "location";
type Coords = { lat: number; lng: number };

const RADIUS_OPTIONS = [1000, 3000, 5000, 10000, 20000];

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "요청에 실패했습니다.");
  return data as T;
}

export default function TourExplorer() {
  const [mode, setMode] = useState<Mode>("area");
  const [kind, setKind] = useState<Kind>("spot");

  const [provinces, setProvinces] = useState<Region[]>([]);
  const [districts, setDistricts] = useState<Region[]>([]);
  const [regn, setRegn] = useState("");
  const [signgu, setSigngu] = useState("");

  const [coords, setCoords] = useState<Coords | null>(null);
  const [radius, setRadius] = useState(5000);
  const [locating, setLocating] = useState(false);

  const [places, setPlaces] = useState<Place[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingPage, setLoadingPage] = useState(0); // 불러오는 중인 페이지 (0 = 없음)
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  // "더 보기"는 화면의 현재 선택값이 아니라 마지막 검색 조건으로 이어서 불러온다.
  const [lastQuery, setLastQuery] = useState("");
  // 늦게 도착한 이전 응답이 최신 결과를 덮어쓰지 않도록 요청 번호를 센다.
  const districtReq = useRef(0);
  const searchReq = useRef(0);

  // 처음 열 때 시·도 목록을 불러온다.
  useEffect(() => {
    getJson<{ regions: Region[] }>("/api/tour/regions")
      .then((d) => setProvinces(d.regions))
      .catch((e: Error) => setError(e.message));
  }, []);

  function selectProvince(code: string) {
    setRegn(code);
    setSigngu("");
    setDistricts([]);
    const req = ++districtReq.current;
    if (!code) return;
    getJson<{ regions: Region[] }>(`/api/tour/regions?regn=${code}`)
      .then((d) => {
        if (req === districtReq.current) setDistricts(d.regions);
      })
      .catch((e: Error) => {
        if (req === districtReq.current) setError(e.message);
      });
  }

  function locate() {
    if (!navigator.geolocation) {
      setError("이 브라우저는 위치 정보를 지원하지 않습니다.");
      return;
    }
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setError("위치를 가져오지 못했습니다. 브라우저의 위치 권한을 허용해 주세요.");
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }

  // 화면의 현재 선택값으로 검색 조건을 만든다.
  function buildQuery(): string | null {
    const params = new URLSearchParams({ kind });
    if (mode === "area") {
      if (!regn) {
        setError("시·도를 먼저 선택해 주세요.");
        return null;
      }
      params.set("by", "area");
      params.set("regn", regn);
      if (signgu) params.set("signgu", signgu);
    } else {
      if (!coords) {
        setError("먼저 '내 위치 가져오기'를 눌러 주세요.");
        return null;
      }
      params.set("by", "location");
      params.set("lat", String(coords.lat));
      params.set("lng", String(coords.lng));
      params.set("radius", String(radius));
    }
    return params.toString();
  }

  async function fetchPage(query: string, nextPage: number) {
    const req = ++searchReq.current;
    setLoadingPage(nextPage);
    setError("");
    try {
      const data = await getJson<{ items: Place[]; totalCount: number }>(
        `/api/tour/places?${query}&page=${nextPage}`,
      );
      if (req !== searchReq.current) return;
      setPlaces((prev) => {
        if (nextPage === 1) return data.items;
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...data.items.filter((p) => !seen.has(p.id))];
      });
      setTotalCount(data.totalCount);
      setPage(nextPage);
      setLastQuery(query);
      setSearched(true);
    } catch (e) {
      if (req === searchReq.current) setError((e as Error).message);
    } finally {
      if (req === searchReq.current) setLoadingPage(0);
    }
  }

  function search() {
    const query = buildQuery();
    if (query) fetchPage(query, 1);
  }

  // 조건이 바뀌면 이전 결과를 지운다.
  function resetResults() {
    searchReq.current++; // 진행 중인 요청의 응답은 버린다.
    setLoadingPage(0);
    setLastQuery("");
    setPlaces([]);
    setTotalCount(0);
    setSearched(false);
    setError("");
  }

  const canSearch = mode === "area" ? Boolean(regn) : Boolean(coords);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-5 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap gap-6">
          <Toggle
            label="찾는 방식"
            value={mode}
            onChange={(v) => {
              setMode(v as Mode);
              resetResults();
            }}
            options={[
              { value: "area", label: "지역 선택" },
              { value: "location", label: "내 위치" },
            ]}
          />
          <Toggle
            label="종류"
            value={kind}
            onChange={(v) => {
              setKind(v as Kind);
              resetResults();
            }}
            options={[
              { value: "spot", label: "관광지" },
              { value: "festival", label: "축제·행사" },
            ]}
          />
        </div>

        {mode === "area" ? (
          <div className="flex flex-col gap-3 sm:flex-row">
            <Select
              label="시·도"
              value={regn}
              onChange={selectProvince}
              placeholder={provinces.length ? "선택하세요" : "불러오는 중…"}
              options={provinces}
            />
            <Select
              label="시·군·구"
              value={signgu}
              onChange={setSigngu}
              placeholder="전체"
              options={districts}
              disabled={!regn}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <button
              type="button"
              onClick={locate}
              disabled={locating}
              className="min-h-11 rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-800 hover:border-zinc-500 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200"
            >
              {locating ? "위치 확인 중…" : coords ? "📍 위치 다시 가져오기" : "📍 내 위치 가져오기"}
            </button>
            <Select
              label="반경"
              value={String(radius)}
              onChange={(v) => setRadius(Number(v))}
              options={RADIUS_OPTIONS.map((r) => ({ code: String(r), name: `${r / 1000}km` }))}
            />
            {coords && (
              <span className="text-xs text-zinc-500">
                현재 위치: {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
              </span>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={search}
          disabled={!canSearch || loadingPage > 0}
          className="min-h-11 rounded-lg bg-zinc-900 px-5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {loadingPage === 1 ? "검색 중…" : "검색"}
        </button>
      </section>

      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {searched && !error && (
        <p className="text-sm text-zinc-500">
          {places.length === 0 ? "검색 결과가 없습니다." : `총 ${totalCount.toLocaleString()}곳`}
        </p>
      )}

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {places.map((p) => (
          <PlaceCard key={p.id} place={p} />
        ))}
      </ul>

      {lastQuery && places.length > 0 && places.length < totalCount && (
        <button
          type="button"
          onClick={() => fetchPage(lastQuery, page + 1)}
          disabled={loadingPage > 0}
          className="mx-auto min-h-11 rounded-lg border border-zinc-300 px-6 text-sm font-medium text-zinc-800 hover:border-zinc-500 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200"
        >
          {loadingPage > 1 ? "불러오는 중…" : "더 보기"}
        </button>
      )}
    </div>
  );
}

function PlaceCard({ place }: { place: Place }) {
  const status = festivalStatus(place);
  const mapUrl =
    place.lat !== null && place.lng !== null
      ? `https://map.kakao.com/link/map/${encodeURIComponent(place.title)},${place.lat},${place.lng}`
      : `https://map.kakao.com/link/search/${encodeURIComponent(place.title)}`;

  return (
    <li className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      {place.image ? (
        // 관광공사 이미지 서버 주소가 다양해 next/image 대신 일반 img를 쓴다.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={place.image} alt={place.title} loading="lazy" className="aspect-[4/3] w-full object-cover" />
      ) : (
        <div className="flex aspect-[4/3] w-full items-center justify-center bg-zinc-100 text-sm text-zinc-400 dark:bg-zinc-900">
          이미지 없음
        </div>
      )}
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {status && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                status === "진행 중"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                  : "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
              }`}
            >
              {status}
            </span>
          )}
          {place.distanceM !== null && (
            <span className="text-xs text-zinc-500">{formatDistance(place.distanceM)}</span>
          )}
        </div>
        <h3 className="font-semibold text-zinc-950 dark:text-zinc-50">{place.title}</h3>
        {place.startDate && (
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            {formatDate(place.startDate)} ~ {place.endDate ? formatDate(place.endDate) : ""}
          </p>
        )}
        {place.address && <p className="text-sm text-zinc-600 dark:text-zinc-400">{place.address}</p>}
        {place.tel && <p className="text-xs text-zinc-500">{place.tel}</p>}
        <a
          href={mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto pt-2 text-sm font-medium text-zinc-950 hover:underline dark:text-zinc-50"
        >
          지도에서 보기 →
        </a>
      </div>
    </li>
  );
}

function Toggle({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-zinc-500">{label}</span>
      <div className="flex rounded-lg border border-zinc-300 p-1 dark:border-zinc-700">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={value === o.value}
            className={`min-h-9 rounded-md px-4 text-sm font-medium ${
              value === o.value
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-700 dark:text-zinc-300"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Region[];
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-1 flex-col gap-1.5">
      <span className="text-xs font-semibold text-zinc-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="min-h-11 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function festivalStatus(p: Place): "진행 중" | "예정" | null {
  if (!p.startDate) return null;
  const now = new Date(Date.now() + 9 * 3600_000);
  const today = now.toISOString().slice(0, 10).replaceAll("-", "");
  return p.startDate <= today ? "진행 중" : "예정";
}

function formatDate(yyyymmdd: string) {
  return `${yyyymmdd.slice(0, 4)}.${yyyymmdd.slice(4, 6)}.${yyyymmdd.slice(6, 8)}`;
}

function formatDistance(m: number) {
  return m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`;
}
