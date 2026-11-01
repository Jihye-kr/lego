import type { Arrival } from "../../types/subway";
import { normalizeTrainNo, type ScheduledTrain } from "../subway/timetable";

// spec.md 2. 출발 시각 계산 규칙
// 출발해야 할 시각 = 도착 예상 - 승강장까지 걸리는 시간(여유 포함)

// 시간표 열차와 실시간 열차를 합친 후보
export type Train = {
  trainNo: string; // normalizeTrainNo 적용
  arrivalAt: number; // 도착 예상 epoch ms (실시간에 보이면 그 값, 아니면 시간표 + 지연 추정)
  scheduledAt?: number; // 시간표 시각 (실시간에만 있는 임시 열차는 없음)
  destination: string;
  isLive: boolean; // 실시간에 보이는 열차
  isEstimated: boolean; // 실시간 값이 "N번째 전역" 메시지로 추정한 것
  isExpress: boolean;
  isLastTrain: boolean;
};

const DELAY_MATCH_SECONDS = 180; // 열차번호가 하나도 안 맞을 때, 이 안쪽의 시간표 열차와 짝지어 지연을 잰다
const DELAY_CLAMP: [number, number] = [-120, 600]; // 이 범위 밖의 지연 추정은 믿지 않는다

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// 실시간에 보이는 열차들이 시간표보다 몇 초 늦는지. 열차번호로 대조하고, 하나도 안 맞으면 가장 가까운 시각으로
export function estimateDelay(scheduled: ScheduledTrain[], live: Arrival[]): { seconds: number; matched: number } {
  const byNo = new Map(scheduled.map((t) => [t.trainNo, t]));
  let diffs = live.flatMap((a) => {
    const s = byNo.get(normalizeTrainNo(a.trainNo));
    return s ? [(a.arrivalAt - s.arrivalAt) / 1000] : [];
  });
  if (diffs.length === 0) {
    diffs = live.flatMap((a) => {
      let best: number | undefined;
      for (const s of scheduled) {
        const d = (a.arrivalAt - s.arrivalAt) / 1000;
        if (Math.abs(d) <= DELAY_MATCH_SECONDS && (best === undefined || Math.abs(d) < Math.abs(best))) best = d;
      }
      return best === undefined ? [] : [best];
    });
  }
  if (diffs.length === 0) return { seconds: 0, matched: 0 };
  const seconds = Math.round(median(diffs));
  if (seconds < DELAY_CLAMP[0] || seconds > DELAY_CLAMP[1]) return { seconds: 0, matched: 0 };
  return { seconds, matched: diffs.length };
}

// 시간표 + 실시간 → 도착 예상 순 후보 목록. 시간표에 없는 실시간 열차(임시 열차 등)도 후보에 넣는다
// ponytail: 번호가 다른 같은 열차는 중복될 수 있음. 실제로 보이면 시각 근접으로 합치기
export function mergeTrains(scheduled: ScheduledTrain[], live: Arrival[], delaySeconds: number): Train[] {
  const liveByNo = new Map(live.map((a) => [normalizeTrainNo(a.trainNo), a]));
  const used = new Set<string>();
  const trains: Train[] = scheduled.map((s) => {
    const a = liveByNo.get(s.trainNo);
    if (a) used.add(s.trainNo);
    return {
      trainNo: s.trainNo,
      arrivalAt: a ? a.arrivalAt : s.arrivalAt + delaySeconds * 1000,
      scheduledAt: s.arrivalAt,
      destination: a?.destination ?? s.destination,
      isLive: !!a,
      isEstimated: a?.isEstimated ?? false,
      isExpress: a?.isExpress ?? s.isExpress,
      isLastTrain: a?.isLastTrain ?? false,
    };
  });
  for (const [no, a] of liveByNo) {
    if (used.has(no)) continue;
    trains.push({
      trainNo: no, arrivalAt: a.arrivalAt, destination: a.destination, isLive: true,
      isEstimated: a.isEstimated, isExpress: a.isExpress, isLastTrain: a.isLastTrain,
    });
  }
  return trains.sort((a, b) => a.arrivalAt - b.arrivalAt);
}

// 상태 (참고: haeun2525/nu40-commute)
//   relax  출발까지 3분 넘게      "아직 여유 있어요"
//   pack   3분 이하              "슬슬 짐 싸야 해요"
//   go     1분 이하              "지금 출발해야 해요!"
//   run    출발 시각 지나 2분까지  "지금 뛰면 가능해요!"
//   missed 그 뒤                 "놓쳤어요… 다음 거!" → 5초 보여 주고 다음 열차
export type DepartureState = "relax" | "pack" | "go" | "run" | "missed";

export const PACK_SECONDS = 180;
export const GO_SECONDS = 60;
export const RUN_SECONDS = 120;
export const MISSED_HOLD_MS = 5000;

export function stateFor(secondsUntilDepart: number): DepartureState {
  if (secondsUntilDepart < -RUN_SECONDS) return "missed";
  if (secondsUntilDepart < 0) return "run";
  if (secondsUntilDepart <= GO_SECONDS) return "go";
  if (secondsUntilDepart <= PACK_SECONDS) return "pack";
  return "relax";
}

export type Departure =
  | { status: "waiting" } // 탈 수 있는 열차가 없음
  | {
      status: DepartureState;
      train: Train; // 막차 배지는 train.isLastTrain
      departAt: number; // 출발해야 할 시각 epoch ms
      secondsUntilDepart: number; // 음수면 출발 시각이 지남
    };

// 지난 틱에 보여 준 열차. 출발 시각이 지나도(run/missed) 바로 다음 열차로 넘어가지 않게 기억한다
export type PlanMemory = { trainNo?: string; missedAt?: number };

function departureFor(train: Train, now: number, leadMs: number) {
  const departAt = train.arrivalAt - leadMs;
  const secondsUntilDepart = Math.floor((departAt - now) / 1000);
  return { status: stateFor(secondsUntilDepart), train, departAt, secondsUntilDepart };
}

// trains는 arrivalAt 오름차순 (mergeTrains 결과)
export function planDeparture(
  trains: Train[],
  now: number,
  leadSeconds: number,
  memory: PlanMemory = {},
): { departure: Departure; memory: PlanMemory } {
  const leadMs = leadSeconds * 1000;

  // 보던 열차가 출발 시각을 지났으면 run → missed(5초)까지 그 열차를 계속 보여 준다
  const pinned = memory.trainNo === undefined ? undefined : trains.find((t) => t.trainNo === memory.trainNo);
  if (pinned) {
    const d = departureFor(pinned, now, leadMs);
    if (d.status === "run") return { departure: d, memory: { trainNo: pinned.trainNo } };
    if (d.status === "missed") {
      const missedAt = memory.missedAt ?? now;
      if (now - missedAt < MISSED_HOLD_MS) return { departure: d, memory: { trainNo: pinned.trainNo, missedAt } };
    }
  }

  // 아직 걸어가도 탈 수 있는 열차 중 가장 빠른 것 (더 빠른 임시 열차가 실시간에 나타나면 그쪽으로 바꾼다)
  const next = trains.find((t) => t.arrivalAt - leadMs >= now);
  if (!next) return { departure: { status: "waiting" }, memory: {} };
  return { departure: departureFor(next, now, leadMs), memory: { trainNo: next.trainNo } };
}

// "N분 M초" (1분 미만은 "M초")
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}분 ${s % 60}초` : `${s % 60}초`;
}

// 카운트다운 "m:ss". 음수(출발 시각 지남)는 앞에 "−"
export function formatClock(seconds: number): string {
  const s = Math.floor(Math.abs(seconds));
  return `${seconds < 0 && s > 0 ? "−" : ""}${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
