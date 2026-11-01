import { NextResponse, type NextRequest } from "next/server";
import { parseArrivals, parseRecptnDt } from "@/lib/subway/parse";
import { toApiStationName } from "@/lib/subway/stations";
import type { RawArrivalResponse } from "@/types/subway";

const CACHE_SECONDS = 20;

// Next fetch 캐시(revalidate)는 만료 후 첫 요청에 오래된 응답을 그대로 돌려줘서(stale-while-revalidate)
// 몇 분 전 도착 정보가 나갈 수 있다. 정확히 20초만 재사용하도록 직접 캐싱한다.
// ponytail: 서버 인스턴스별 메모리 캐시(역 수만큼만 쌓임). 인스턴스 간 공유는 CDN s-maxage가 담당
const cache = new Map<string, { at: number; raw: RawArrivalResponse }>();

function error(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

// GET /api/arrivals?station=강남
export async function GET(req: NextRequest) {
  const station = req.nextUrl.searchParams.get("station")?.trim();
  if (!station || station.length > 30) return error(400, "station 파라미터가 필요합니다");

  const key = process.env.SEOUL_SUBWAY_API_KEY;
  if (!key) {
    console.error("SEOUL_SUBWAY_API_KEY가 설정되지 않았습니다");
    return error(500, "서버 설정 오류");
  }

  const apiName = toApiStationName(station);
  const now = Date.now();
  const cached = cache.get(apiName);
  let raw: RawArrivalResponse;
  if (cached && now - cached.at < CACHE_SECONDS * 1000) {
    raw = cached.raw;
  } else {
    const url = `http://swopenapi.seoul.go.kr/api/subway/${encodeURIComponent(key)}/json/realtimeStationArrival/0/50/${encodeURIComponent(apiName)}`;
    try {
      const res = await fetch(url, { cache: "no-store" });
      raw = await res.json();
    } catch {
      return error(502, "도착 정보를 가져오지 못했습니다");
    }
  }

  const code = raw.errorMessage?.code ?? raw.code;
  if (code !== "INFO-000" && code !== "INFO-200") {
    console.error("서울시 API 오류", code, raw.message);
    return error(502, "도착 정보를 가져오지 못했습니다");
  }
  if (raw !== cached?.raw) cache.set(apiName, { at: now, raw });

  const rows = raw.realtimeArrivalList ?? [];
  // 데이터가 생성된 시각 (오프라인 표시용 "업데이트 시각"). 신분당선 등은 recptnDt가 미래로 오기도 해서 now로 자름
  const updatedAt = rows.length ? Math.min(now, Math.max(...rows.map((r) => parseRecptnDt(r.recptnDt)))) : now;
  return NextResponse.json(
    { arrivals: parseArrivals(raw, now), updatedAt },
    { headers: { "Cache-Control": `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=10` } },
  );
}
