// 실제 도착 응답을 fixtures/로 저장: node --env-file=.env.local scripts/fetch-fixtures.mjs
import { writeFile } from "node:fs/promises";

const key = process.env.SEOUL_SUBWAY_API_KEY;
if (!key) throw new Error("SEOUL_SUBWAY_API_KEY가 없습니다 (.env.local)");

const stations = { 강남: "gangnam", 서울: "seoul", 왕십리: "wangsimni", 고속터미널: "express-bus-terminal", 잠실: "jamsil", 상봉: "sangbong", 신림: "sillim", "천호(풍납토성)": "cheonho" };

for (const [name, slug] of Object.entries(stations)) {
  const res = await fetch(`http://swopenapi.seoul.go.kr/api/subway/${key}/json/realtimeStationArrival/0/50/${encodeURIComponent(name)}`);
  const body = await res.json();
  await writeFile(`fixtures/arrivals-${slug}.json`, JSON.stringify(body, null, 2) + "\n");
  console.log(slug, body.errorMessage?.code ?? body.code, body.realtimeArrivalList?.length ?? 0);
}
