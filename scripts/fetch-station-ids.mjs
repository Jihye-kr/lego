// 1~9호선 실시간 역 ID → 역명을 lib/subway/station-ids.json으로 저장 (노선도 앞 역 이름용): node --env-file=.env.local scripts/fetch-station-ids.mjs
// 출처: 서울시 지하철역 정보 검색 SearchSTNBySubwayLineInfo. 실시간 statnId = subwayId + FR_CODE 6자리 (예: 2호선 강남 222 → "1002000222")
// FR_CODE가 숫자가 아닌 역(지선 "211-1", 경부선 "P148" 등)은 실시간 ID와 대응이 안 돼서 뺀다
import { writeFile } from "node:fs/promises";

const key = process.env.SEOUL_SUBWAY_API_KEY;
if (!key) throw new Error("SEOUL_SUBWAY_API_KEY가 없습니다 (.env.local)");

const res = await fetch(`http://openapi.seoul.go.kr:8088/${key}/json/SearchSTNBySubwayLineInfo/1/1000/`);
const rows = (await res.json()).SearchSTNBySubwayLineInfo?.row;
if (!rows?.length) throw new Error("응답이 비었습니다");

const ids = {};
for (const r of rows) {
  const line = r.LINE_NUM.match(/^0(\d)호선$/)?.[1];
  if (!line || !/^\d+$/.test(r.FR_CODE)) continue;
  ids[`100${line}${r.FR_CODE.padStart(6, "0")}`] = r.STATION_NM;
}
const sorted = Object.fromEntries(Object.entries(ids).sort(([a], [b]) => a.localeCompare(b)));
await writeFile("lib/subway/station-ids.json", JSON.stringify(sorted, null, 1) + "\n");
console.log(rows.length, "rows →", Object.keys(sorted).length, "stations");
