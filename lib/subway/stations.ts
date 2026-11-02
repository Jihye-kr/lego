import idNames from "./station-ids.json";

// 앱 역명 → API 역명 (API상 이름이 다른 역)
const API_STATION_NAMES: Record<string, string> = {
  서울역: "서울",
  천호: "천호(풍납토성)",
  응암: "응암순환(상선)",
};

export function toApiStationName(name: string): string {
  return API_STATION_NAMES[name] ?? name;
}

// 1~9호선 실시간 역 ID → 역명. 데이터: scripts/fetch-station-ids.mjs (서울시 지하철역 정보, 2026-11-02)
const NAMES_BY_ID: Record<string, string> = idNames;
const LINE2_LOOP = [201, 243]; // 2호선 본선 순환: 시청(201) ↔ 충정로(243)

// 이번 역 ID와 바로 전 역 ID(statnFid)로 열차가 지나오는 쪽 역 이름을 count개 (전역, 전전역, ...)
// 역 ID는 노선 순서대로 1씩 이어진다. 갈림길·지선처럼 이어지지 않는 곳부터는 undefined
export function previousStations(statnId: string, statnFid: string, count: number): (string | undefined)[] {
  const id = Number(statnId);
  const step = Number(statnFid) - id;
  const out: (string | undefined)[] = [];
  let code = id;
  let ok = step === 1 || step === -1;
  for (let i = 0; i < count; i++) {
    code += step;
    if (statnId.startsWith("1002")) {
      const local = code % 1_000_000;
      if (local === LINE2_LOOP[0] - 1) code += LINE2_LOOP[1] - LINE2_LOOP[0] + 1;
      if (local === LINE2_LOOP[1] + 1) code -= LINE2_LOOP[1] - LINE2_LOOP[0] + 1;
    }
    const name = ok ? NAMES_BY_ID[String(code)] : undefined;
    if (!name) ok = false;
    out.push(name);
  }
  return out;
}
