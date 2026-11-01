// 역 영문명을 lib/subway/station-names-en.json으로 저장 (역명판용): node --env-file=.env.local scripts/fetch-station-names-en.mjs
// 출처: 서울시 지하철역 정보 검색 SearchSTNBySubwayLineInfo (STATION_NM → STATION_NM_ENG)
import { writeFile } from "node:fs/promises";

const key = process.env.SEOUL_SUBWAY_API_KEY;
if (!key) throw new Error("SEOUL_SUBWAY_API_KEY가 없습니다 (.env.local)");

const res = await fetch(`http://openapi.seoul.go.kr:8088/${key}/json/SearchSTNBySubwayLineInfo/1/1000/`);
const rows = (await res.json()).SearchSTNBySubwayLineInfo?.row;
if (!rows?.length) throw new Error("응답이 비었습니다");

const names = {};
for (const r of rows) {
  const en = r.STATION_NM_ENG?.trim();
  if (en && !names[r.STATION_NM]) names[r.STATION_NM] = en;
}
const sorted = Object.fromEntries(Object.entries(names).sort(([a], [b]) => a.localeCompare(b, "ko")));
await writeFile("lib/subway/station-names-en.json", JSON.stringify(sorted, null, 1) + "\n");
console.log(rows.length, "rows →", Object.keys(sorted).length, "stations");
