import { describe, expect, it } from "vitest";
import type { Arrival } from "../../types/subway";
import { APPROACH_SECONDS, DWELL_SECONDS, EXIT_SECONDS, FAR_SECONDS, doorOpenness, pickSceneTrain, trainMotion } from "./motion";

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
