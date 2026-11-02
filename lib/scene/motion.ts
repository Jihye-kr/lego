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

// ── 씬 속 열차들: 승강장을 비추는 화면이라 열차는 절대 뒤로 가지 않고, 정차 후엔 데이터와 상관없이 떠난다 ──

export const HIDDEN_PROGRESS = -FAR_SECONDS / APPROACH_SECONDS; // 터널 깊숙이 (불빛도 안 보임)
const CATCH_UP = 6; // 도착이 당겨졌을 때 예정 위치를 따라잡는 속도 (1/s)
const MAX_CATCH_UP_SPEED = 0.1; // 따라잡을 때 최고 속도 (progress/s, 진입 시작 속도의 2배)
const STOP_EPSILON = 1e-4; // 약 1.6cm

// p = progress. stoppedAt = 정차 위치에 선 시각(ms). 그 뒤 정차·출발은 이 시각만으로 진행
export type SceneTrain = { key: string; arrivalAt: number; p: number; stoppedAt?: number };

const toStop = (t: number) => 0.5 - Math.min(trainMotion(t).progress, 0.5); // 데이터상 정차 위치까지 남은 거리

// fromTunnel: 화면을 보는 중에 새로 잡힌 열차는 터널에서 나오게 (갑자기 나타나지 않게)
function enter(key: string, arrivalAt: number, now: number, fromTunnel: boolean): SceneTrain | undefined {
  const t = (arrivalAt - now) / 1000;
  if (fromTunnel) return { key, arrivalAt, p: Math.min(trainMotion(t).progress, HIDDEN_PROGRESS) };
  if (t > 0) return { key, arrivalAt, p: trainMotion(t).progress };
  if (t < -(DWELL_SECONDS + EXIT_SECONDS)) return undefined;
  return { key, arrivalAt, p: trainMotion(t).progress, stoppedAt: arrivalAt };
}

// minDistance: 앞 열차 때문에 더 못 가는 정차 위치까지의 거리 (추월 금지)
function step(s: SceneTrain, now: number, dt: number, minDistance: number): SceneTrain {
  if (s.stoppedAt !== undefined) return { ...s, p: trainMotion((s.stoppedAt - now) / 1000).progress };
  const t = (s.arrivalAt - now) / 1000;
  const d = 0.5 - s.p;
  const target = toStop(t);
  let next = d;
  if (d < target) {
    // 예정보다 앞서 있다(도착이 늦춰짐) → 뒤로 가지 않고 감속하며 새 도착 시각에 정차 위치에 닿게
    next = t > 0 ? d * (t / (t + dt)) ** 2 : 0;
  } else {
    // 예정보다 뒤처졌다(도착이 당겨짐) → 부드럽게 따라잡되 최고 속도는 제한
    next = d - Math.min((d - target) * (1 - Math.exp(-dt * CATCH_UP)), MAX_CATCH_UP_SPEED * dt);
  }
  next = Math.min(d, Math.max(next, minDistance));
  return next <= STOP_EPSILON ? { ...s, p: 0.5, stoppedAt: now } : { ...s, p: 0.5 - next };
}

export function isGone(s: SceneTrain, now: number) {
  return s.stoppedAt !== undefined && trainMotion((s.stoppedAt - now) / 1000).phase === "hidden";
}

export function sceneDoors(s: SceneTrain, now: number) {
  return s.stoppedAt === undefined ? 0 : doorOpenness((s.stoppedAt - now) / 1000);
}

// 다음 프레임이 필요한가 (정차해 문이 다 열려 있거나 터널 깊숙이 기다리는 중엔 렌더 0)
export function isAnimating(s: SceneTrain, now: number) {
  if (s.stoppedAt === undefined) return s.p > HIDDEN_PROGRESS || (s.arrivalAt - now) / 1000 <= APPROACH_SECONDS + FAR_SECONDS;
  const t = (s.stoppedAt - now) / 1000;
  const doors = doorOpenness(t);
  return trainMotion(t).phase === "departing" || (doors > 0 && doors < 1);
}

// 실시간 목록 → 씬 열차 목록. 목록에서 빠진 열차도 이미 보이면 마지막 예정대로 들어와 떠난다
// gap: 열차 한 대 길이(progress 단위). first: 화면을 처음 그릴 때는 데이터 위치에 바로 놓는다
export function stepScene(
  prev: SceneTrain[],
  live: { key: string; arrivalAt: number }[],
  now: number,
  dt: number,
  gap: number,
  first: boolean,
): SceneTrain[] {
  const byKey = new Map(prev.map((s) => [s.key, s]));
  const merged: SceneTrain[] = [];
  for (const { key, arrivalAt } of live) {
    const old = byKey.get(key);
    byKey.delete(key);
    const s = old ? { ...old, arrivalAt } : enter(key, arrivalAt, now, !first);
    if (s) merged.push(s);
  }
  for (const s of byKey.values()) if (s.stoppedAt !== undefined || s.p > HIDDEN_PROGRESS) merged.push(s);

  merged.sort((a, b) => b.p - a.p); // 앞 열차부터
  const out: SceneTrain[] = [];
  let leader: SceneTrain | undefined;
  for (const s of merged) {
    const next = step(s, now, dt, leader ? 0.5 - (leader.p - gap) : -Infinity);
    if (isGone(next, now)) continue;
    out.push(next);
    leader = next;
  }
  return out;
}
