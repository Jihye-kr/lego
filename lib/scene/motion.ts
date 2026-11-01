import type { Arrival } from "../../types/subway";

// 3D 씬/2D 진행 바 공용: 도착까지 남은 초(t) → 열차 위치
// progress 0 = 터널 입구, 0.5 = 승강장 정차 위치, 1 = 반대편 끝을 빠져나감, 음수 = 터널 안 깊숙이

export const FAR_SECONDS = 15; // 전 역을 떠나 터널 안을 달려오는 구간 (터널 깊숙이 불빛만 보인다)
export const APPROACH_SECONDS = 20; // 터널을 나와 정차까지
export const DWELL_SECONDS = 20; // 정차
export const EXIT_SECONDS = 10; // 가속하며 퇴장 (정차+퇴장 ≤ 파서의 30초 유지 시간)

export type TrainPhase = "hidden" | "far" | "approaching" | "stopped" | "departing";

export function trainMotion(t: number): { phase: TrainPhase; progress: number } {
  if (t > APPROACH_SECONDS + FAR_SECONDS) return { phase: "hidden", progress: -FAR_SECONDS / APPROACH_SECONDS };
  // 등속: 진입 구간이 시작될 때의 속도(1/APPROACH_SECONDS)로 터널 안을 달려온다 → 경계에서 속도가 이어진다
  if (t > APPROACH_SECONDS) return { phase: "far", progress: -(t - APPROACH_SECONDS) / APPROACH_SECONDS };
  // 등감속: 정차 위치까지 남은 거리 ∝ t²
  if (t > 0) return { phase: "approaching", progress: 0.5 * (1 - (t / APPROACH_SECONDS) ** 2) };
  if (t >= -DWELL_SECONDS) return { phase: "stopped", progress: 0.5 };
  // 등가속: 출발 후 이동 거리 ∝ τ²
  const tau = -t - DWELL_SECONDS;
  if (tau <= EXIT_SECONDS) return { phase: "departing", progress: 0.5 + 0.5 * (tau / EXIT_SECONDS) ** 2 };
  return { phase: "hidden", progress: 1 };
}

// 정차 중 출입문 열림 정도 0(닫힘) ~ 1(열림). 서고 1초 뒤 열기 시작, 떠나기 1.5초 전에 다 닫힌다
const DOOR_DELAY = 1;
const DOOR_MOVE = 1.5;

export function doorOpenness(t: number): number {
  if (t > 0 || t < -DWELL_SECONDS) return 0;
  const sinceStop = -t;
  const opening = (sinceStop - DOOR_DELAY) / DOOR_MOVE;
  const closing = (DWELL_SECONDS - DOOR_MOVE - sinceStop) / DOOR_MOVE;
  return Math.min(1, Math.max(0, Math.min(opening, closing)));
}

// 씬에 그릴 열차: 아직 완전히 떠나지 않은 열차 중 가장 먼저 도착하는(=물리적으로 가장 가까운) 것
export function pickSceneTrain(arrivals: Arrival[], now: number): Arrival | undefined {
  const goneBefore = now - (DWELL_SECONDS + EXIT_SECONDS) * 1000;
  let best: Arrival | undefined;
  for (const a of arrivals) {
    if (a.arrivalAt >= goneBefore && (!best || a.arrivalAt < best.arrivalAt)) best = a;
  }
  return best;
}
