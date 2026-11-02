import type { Train } from "../departure";
import { SECONDS_PER_STATION } from "../subway/parse";
import type { Arrival } from "../../types/subway";
import { DWELL_SECONDS } from "./motion";

// 위에서 본 노선도: 이번 역(0) ← 전역(1) ← 전전역(2) ← 3역 전(3)
export const MAP_STOPS = 4;

// 각 칸의 역명. 역 ID로 찾은 앞 역 이름이 기본이고, 실시간 메시지로 "몇 역 전에 어느 역"인지 알면 그걸로 덮는다
export function stopNames(arrivals: Arrival[], station: string): (string | undefined)[] {
  const prev = arrivals[0]?.previousStations ?? [];
  const names: (string | undefined)[] = [station, ...Array.from({ length: MAP_STOPS - 1 }, (_, i) => prev[i])];
  for (const a of arrivals) {
    if (a.stopsAway !== undefined && a.stopsAway > 0 && a.stopsAway < MAP_STOPS && a.location) names[a.stopsAway] = a.location;
  }
  return names;
}

export type MapTrain = { train: Train; stops: number }; // stops = 이번 역까지 남은 역 수 (실수, 0 = 정차 중)

// ponytail: 남은 시간 ÷ 역간 평균 2분으로 위치를 추정. 노선별 역간 시간이 생기면 교체
// last: 열차별로 지금까지 보여 준 가장 가까운 위치. 폴링마다 추정이 늘어나도("[3]번째 전역"이 계속 360초로 리셋,
// barvlDt 지연 반영) 뒤로 가지 않고 그 자리에서 기다리게 한다. 호출마다 현재 열차만 남도록 갱신된다
export function mapTrains(trains: Train[], now: number, last: Map<string, number> = new Map()): MapTrain[] {
  const out: MapTrain[] = [];
  const seen = new Map<string, number>();
  for (const train of trains) {
    const t = (train.arrivalAt - now) / 1000;
    if (t < -DWELL_SECONDS) continue; // 떠남
    const stops = Math.min(Math.max(0, t / SECONDS_PER_STATION), last.get(train.trainNo) ?? Infinity);
    seen.set(train.trainNo, stops);
    if (stops <= MAP_STOPS - 1) out.push({ train, stops }); // 노선 왼쪽 끝(3역 전)부터만 보인다
  }
  last.clear();
  for (const [no, stops] of seen) last.set(no, stops);
  return out;
}
