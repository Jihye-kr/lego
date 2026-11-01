import stations from "./stations.json";

export type Station = { name: string; lines: string[] };

const STATIONS: Station[] = stations;

// 정확히 일치 → 앞부분 일치 → 포함 순. "서울역"처럼 끝의 "역"은 무시
export function searchStations(query: string, limit = 8): Station[] {
  const q = query.trim().replace(/(.)역$/, "$1");
  if (!q) return [];
  const rank = (name: string) => (name === q ? 0 : name.startsWith(q) ? 1 : name.includes(q) ? 2 : -1);
  return STATIONS.map((s) => ({ s, r: rank(s.name) }))
    .filter(({ r }) => r >= 0)
    .sort((a, b) => a.r - b.r || a.s.name.length - b.s.name.length)
    .slice(0, limit)
    .map(({ s }) => s);
}
