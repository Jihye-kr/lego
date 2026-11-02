import { describe, expect, it } from "vitest";
import type { Arrival } from "../../types/subway";
import {
  APPROACH_SECONDS,
  DWELL_SECONDS,
  EXIT_SECONDS,
  FAR_SECONDS,
  HIDDEN_PROGRESS,
  type SceneTrain,
  doorOpenness,
  pickSceneTrain,
  stepScene,
  trainMotion,
} from "./motion";

describe("trainMotion", () => {
  it("아주 멀리 있으면 숨김, 진입 전 FAR 구간은 터널 안에서 등속으로 다가온다", () => {
    expect(trainMotion(APPROACH_SECONDS + FAR_SECONDS + 1).phase).toBe("hidden");
    expect(trainMotion(APPROACH_SECONDS + FAR_SECONDS).phase).toBe("far");
    expect(trainMotion(APPROACH_SECONDS + 1).progress).toBeLessThan(0);
    const step = (t: number) => trainMotion(t - 1).progress - trainMotion(t).progress;
    expect(step(APPROACH_SECONDS + 10)).toBeCloseTo(step(APPROACH_SECONDS + 3)); // 등속
    // 진입 구간 시작 속도와 같다 (경계에서 덜컹이지 않게)
    expect(step(APPROACH_SECONDS + 1)).toBeCloseTo(trainMotion(APPROACH_SECONDS - 0.01).progress - trainMotion(APPROACH_SECONDS).progress, 1);
  });

  it("진입: 0 → 0.5로 다가오고, 도착 순간 정차 위치", () => {
    expect(trainMotion(APPROACH_SECONDS)).toEqual({ phase: "approaching", progress: 0 });
    expect(trainMotion(0.0001).progress).toBeCloseTo(0.5);
    expect(trainMotion(0)).toEqual({ phase: "stopped", progress: 0.5 });
  });

  it("진입은 감속: 같은 1초 동안 움직이는 거리가 도착에 가까울수록 줄어든다", () => {
    const step = (t: number) => trainMotion(t - 1).progress - trainMotion(t).progress;
    expect(step(15)).toBeGreaterThan(step(10));
    expect(step(10)).toBeGreaterThan(step(2));
  });

  it("정차 후 가속하며 떠나고, 끝나면 숨김", () => {
    expect(trainMotion(-DWELL_SECONDS)).toEqual({ phase: "stopped", progress: 0.5 });
    const step = (tau: number) => trainMotion(-DWELL_SECONDS - tau - 1).progress - trainMotion(-DWELL_SECONDS - tau).progress;
    expect(trainMotion(-DWELL_SECONDS - 1).phase).toBe("departing");
    expect(step(5)).toBeGreaterThan(step(1)); // 가속
    expect(trainMotion(-DWELL_SECONDS - EXIT_SECONDS - 0.01)).toEqual({ phase: "hidden", progress: 1 });
  });

  it("구간 경계에서 위치가 끊기지 않는다", () => {
    for (const t of [APPROACH_SECONDS + FAR_SECONDS, APPROACH_SECONDS, 0, -DWELL_SECONDS, -DWELL_SECONDS - EXIT_SECONDS]) {
      expect(Math.abs(trainMotion(t + 0.001).progress - trainMotion(t - 0.001).progress)).toBeLessThan(0.01);
    }
  });

  it("정차+출발 시간은 파서가 도착 열차를 유지하는 30초 안에 끝난다", () => {
    expect(DWELL_SECONDS + EXIT_SECONDS).toBeLessThanOrEqual(30);
  });
});

describe("pickSceneTrain", () => {
  const NOW = 1_000_000;
  const at = (s: number, trainNo = String(s)) => ({ trainNo, arrivalAt: NOW + s * 1000 }) as Arrival;

  it("아직 떠나지 않은 열차 중 물리적으로 가장 가까운 것", () => {
    expect(pickSceneTrain([at(300), at(90), at(500)], NOW)?.trainNo).toBe("90");
  });

  it("정차·출발 중인 열차는 완전히 떠날 때까지 유지", () => {
    expect(pickSceneTrain([at(-10), at(200)], NOW)?.trainNo).toBe("-10");
    expect(pickSceneTrain([at(-(DWELL_SECONDS + EXIT_SECONDS) - 1), at(200)], NOW)?.trainNo).toBe("200");
  });

  it("열차가 없으면 undefined", () => {
    expect(pickSceneTrain([], NOW)).toBeUndefined();
  });
});

describe("doorOpenness", () => {
  it("달리는 중엔 닫힘, 정차 1초 뒤부터 열리고 떠나기 전에 닫힌다", () => {
    expect(doorOpenness(5)).toBe(0);
    expect(doorOpenness(0)).toBe(0);
    expect(doorOpenness(-1)).toBe(0);
    expect(doorOpenness(-1.75)).toBeCloseTo(0.5);
    expect(doorOpenness(-10)).toBe(1);
    expect(doorOpenness(-(DWELL_SECONDS - 1.5))).toBe(0);
    expect(doorOpenness(-DWELL_SECONDS - 1)).toBe(0);
  });
});

describe("stepScene", () => {
  const DT = 1 / 30;
  const GAP = 0.3;
  // live(시각) 를 주며 seconds초 동안 프레임을 돌린다. 매 프레임 이전 위치를 기록
  function run(scene: SceneTrain[], start: number, seconds: number, live: (now: number) => { key: string; arrivalAt: number }[]) {
    const ps: number[][] = [];
    let now = start;
    for (let i = 0; i < seconds / DT; i++) {
      now += DT * 1000;
      scene = stepScene(scene, live(now), now, DT, GAP, false);
      ps.push(scene.map((s) => s.p));
    }
    return { scene, now, ps };
  }

  it("처음 그릴 때는 데이터 위치에 놓는다", () => {
    const [s] = stepScene([], [{ key: "a", arrivalAt: 10_000 }], 0, DT, GAP, true);
    expect(s.p).toBeCloseTo(trainMotion(10).progress);
  });

  it("도착이 늦춰져도 뒤로 가지 않고, 천천히 다가가 새 도착 시각에 정차한다", () => {
    let scene = stepScene([], [{ key: "a", arrivalAt: 10_000 }], 0, DT, GAP, true);
    const before = scene[0].p;
    // 폴링 결과 도착이 30초 뒤로 밀림
    const r = run(scene, 0, 31, () => [{ key: "a", arrivalAt: 30_000 }]);
    scene = r.scene;
    let last = before;
    for (const [p] of r.ps) {
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
    expect(scene[0].p).toBeGreaterThan(before);
    expect(scene[0].stoppedAt).toBeGreaterThan(28_000); // 새 도착 시각(30초) 즈음에 선다
  });

  it("정차한 뒤 목록에서 빠져도 정차·출발을 마치고 사라진다", () => {
    let scene = stepScene([], [{ key: "a", arrivalAt: 0 }], 0, DT, GAP, true);
    expect(scene[0].stoppedAt).toBe(0);
    scene = run(scene, 0, DWELL_SECONDS + 1, () => []).scene;
    expect(scene[0].p).toBeGreaterThan(0.5); // 떠나는 중
    expect(run(scene, (DWELL_SECONDS + 1) * 1000, EXIT_SECONDS, () => []).scene).toEqual([]);
  });

  it("보는 중에 새로 잡힌 열차는 터널에서 나오고, 앞 열차를 추월하지 않는다", () => {
    const scene = stepScene([], [{ key: "a", arrivalAt: -5_000 }], 0, DT, GAP, true); // 정차 중
    const r = run(scene, 0, 10, () => [
      { key: "a", arrivalAt: -5_000 },
      { key: "b", arrivalAt: 3_000 }, // 데이터상 곧 도착
    ]);
    expect(r.ps[0][1]).toBeCloseTo(HIDDEN_PROGRESS, 1);
    for (const [a, b] of r.ps) if (b !== undefined) expect(b).toBeLessThanOrEqual(a - GAP + 1e-9);
  });
});
