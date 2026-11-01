import { NextResponse, type NextRequest } from "next/server";
import {
  infoStationName,
  inoutTag,
  parseTimetable,
  serviceDay,
  timetableLineNum,
  type RawStationInfoResponse,
  type RawTimetableResponse,
  type ScheduledTrain,
} from "@/lib/subway/timetable";

const BASE = "http://openapi.seoul.go.kr:8088";

// 시간표는 하루에 한 번만 받는다 (일일 호출 한도). 역코드는 바뀌지 않으니 계속 재사용
// ponytail: 서버 인스턴스별 메모리 캐시. 키는 (역코드, 요일, 방향) 조합 수만큼만 쌓이고 날짜가 바뀌면 덮어쓴다
const codeCache = new Map<string, string | null>();
const timetableCache = new Map<string, { date: string; trains: ScheduledTrain[] }>();

function error(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  return res.json();
}

// GET /api/timetable?station=강남&subwayId=1002&direction=내선
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const station = p.get("station")?.trim();
  const subwayId = p.get("subwayId") ?? "";
  const direction = p.get("direction") ?? "";
  if (!station || station.length > 30 || !direction) return error(400, "station, subwayId, direction 파라미터가 필요합니다");

  const lineNum = timetableLineNum(subwayId);
  if (!lineNum) return error(404, "시간표를 제공하지 않는 노선입니다");

  const key = process.env.SEOUL_SUBWAY_API_KEY;
  if (!key) {
    console.error("SEOUL_SUBWAY_API_KEY가 설정되지 않았습니다");
    return error(500, "서버 설정 오류");
  }
  const k = encodeURIComponent(key);

  try {
    const name = infoStationName(station);
    const codeKey = `${name}|${lineNum}`;
    if (!codeCache.has(codeKey)) {
      const info = await getJson<RawStationInfoResponse>(
        `${BASE}/${k}/json/SearchInfoBySubwayNameService/1/20/${encodeURIComponent(name)}`,
      );
      const row = info.SearchInfoBySubwayNameService?.row?.find((r) => r.LINE_NUM === lineNum && r.STATION_NM === name);
      codeCache.set(codeKey, row?.STATION_CD ?? null);
    }
    const code = codeCache.get(codeKey);
    if (!code) return error(404, "시간표에서 역을 찾지 못했습니다");

    const { date, week } = serviceDay(Date.now());
    const inout = inoutTag(direction);
    const ttKey = `${code}|${week}|${inout}`;
    let entry = timetableCache.get(ttKey);
    if (entry?.date !== date) {
      const raw = await getJson<RawTimetableResponse>(`${BASE}/${k}/json/SearchSTNTimeTableByIDService/1/500/${code}/${week}/${inout}/`);
      const rows = raw.SearchSTNTimeTableByIDService?.row;
      if (!rows?.length) {
        console.error("시간표 API 오류", raw.RESULT?.CODE, raw.RESULT?.MESSAGE);
        return error(404, "시간표가 없습니다");
      }
      entry = { date, trains: parseTimetable(rows, code, date) };
      timetableCache.set(ttKey, entry);
    }

    return NextResponse.json(
      { trains: entry.trains, date },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600" } },
    );
  } catch {
    return error(502, "시간표를 가져오지 못했습니다");
  }
}
