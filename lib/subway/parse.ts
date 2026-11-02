import type { Arrival, RawArrival, RawArrivalResponse } from "../../types/subway";
import { getLine } from "../lines";
import { previousStations } from "./stations";

// ponytail: 역간 평균 2분 가정. 노선별 역간 시간표가 생기면 교체
export const SECONDS_PER_STATION = 120;
// ponytail: 예상 시각이 지나도 이 정도까지는 정차 중으로 보고 0초로 표시
const DWELL_GRACE_SECONDS = 30;

export function parseRecptnDt(recptnDt: string): number {
  return Date.parse(`${recptnDt.replace(" ", "T")}+09:00`);
}

// recptnDt 시점 기준 남은 초. null = 이미 떠났거나 알 수 없음
function baseSeconds(row: RawArrival): { seconds: number; isEstimated: boolean } | null {
  const msg = row.arvlMsg2;
  const atPrev = msg.includes("전역");
  if (!atPrev && /출발$/.test(msg)) return null; // "서울 출발"
  if (!atPrev && /(진입|도착)$/.test(msg)) return { seconds: 0, isEstimated: false };

  const barvl = Number(row.barvlDt);
  if (barvl > 0) return { seconds: barvl, isEstimated: false };

  const nth = msg.match(/^\[(\d+)\]번째 전역/);
  if (nth) return { seconds: Number(nth[1]) * SECONDS_PER_STATION, isEstimated: true };
  if (/전역\s*출발/.test(msg)) return { seconds: 60, isEstimated: true };
  if (/전역\s*도착/.test(msg)) return { seconds: 90, isEstimated: true };
  if (/전역\s*진입/.test(msg)) return { seconds: SECONDS_PER_STATION, isEstimated: true };
  return null;
}

// 메시지로 location이 몇 역 전인지 알 수 있을 때만. "4분 후"처럼 시간만 오면 모른다
function stopsAway(msg: string): number | undefined {
  const nth = msg.match(/^\[(\d+)\]번째 전역/);
  if (nth) return Number(nth[1]);
  if (/^전역\s*(출발|도착|진입)/.test(msg)) return 1;
  if (/(진입|도착)$/.test(msg)) return 0;
  return undefined;
}

export function parseArrivals(raw: RawArrivalResponse, now: number): Arrival[] {
  const arrivals: Arrival[] = [];
  for (const row of raw.realtimeArrivalList ?? []) {
    const base = baseSeconds(row);
    if (!base) continue;
    const elapsed = Math.max(0, (now - parseRecptnDt(row.recptnDt)) / 1000);
    const corrected = base.seconds - elapsed;
    if (corrected < -DWELL_GRACE_SECONDS) continue;
    const secondsLeft = Math.max(0, Math.round(corrected));

    arrivals.push({
      trainNo: row.btrainNo,
      subwayId: row.subwayId,
      line: getLine(row.subwayId).name,
      direction: row.updnLine,
      destination: `${row.bstatnNm}행`,
      towards: row.trainLineNm.split(" - ")[1]?.replace(/\s*\(급행\)$/, "") ?? "",
      secondsLeft,
      arrivalAt: now + secondsLeft * 1000,
      isEstimated: base.isEstimated,
      message: row.arvlMsg2,
      location: row.arvlMsg3,
      stopsAway: stopsAway(row.arvlMsg2),
      previousStations: previousStations(row.statnId, row.statnFid, 3),
      isExpress: /급행|특급|ITX/.test(row.btrainSttus + row.trainLineNm),
      isLastTrain: row.lstcarAt === "1",
    });
  }
  return arrivals.sort((a, b) => a.arrivalAt - b.arrivalAt);
}
