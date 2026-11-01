import type { Train } from "../departure";
import { SECONDS_PER_STATION } from "../subway/parse";
import type { Arrival } from "../../types/subway";
import { DWELL_SECONDS } from "./motion";

// 위에서 본 노선도: 이번 역(0) ← 전역(1) ← 전전역(2) ← 3역 전(3)
export const MAP_STOPS = 4;

// 각 칸의 역명. 실시간 메시지로 "몇 역 전에 어느 역"인지 알 수 있을 때만 채운다
export function stopNames(arrivals: Arrival[], station: string): (string | undefined)[] {
  const names: (string | undefined)[] = [station, ...Array(MAP_STOPS - 1).fill(undefined)];
  for (const a of arrivals) {
    if (a.stopsAway !== undefined && a.stopsAway > 0 && a.stopsAway < MAP_STOPS && a.location) names[a.stopsAway] = a.location;
  }
  return names;
}

export type MapTrain = { train: Train; stops: number }; // stops = 이번 역까지 남은 역 수 (실수, 0 = 정차 중)

// ponytail: 남은 시간 ÷ 역간 평균 2분으로 위치를 추정. 노선별 역간 시간이 생기면 교체
export function mapTrains(trains: Train[], now: number): MapTrain[] {
  const out: MapTrain[] = [];
  for (const train of trains) {
    const t = (train.arrivalAt - now) / 1000;
    if (t < -DWELL_SECONDS) continue; // 떠남
    const stops = Math.max(0, t / SECONDS_PER_STATION);
    if (stops <= MAP_STOPS - 0.5) out.push({ train, stops });
  }
  return out;
}
