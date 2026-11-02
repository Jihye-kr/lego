import { describe, expect, it } from "vitest";
import type { Arrival } from "../../types/subway";
import { parseRecptnDt } from "../subway/parse";
import type { ScheduledTrain } from "../subway/timetable";
import { estimateDelay, formatClock, formatDuration, mergeTrains, planDeparture, stateFor, type Train } from ".";

const NOW = parseRecptnDt("2026-10-31 12:00:00");
const LEAD = 7 * 60; // 승강장까지 7분 (여유 포함)

function sched(trainNo: string, minutes: number): ScheduledTrain {
  return { trainNo, arrivalAt: NOW + minutes * 60_000, destination: "성수행", isExpress: false };
}

function live(trainNo: string, secondsLeft: number, overrides: Partial<Arrival> = {}): Arrival {
  return {
    trainNo, subwayId: "1002", line: "2호선", direction: "내선", destination: "성수행", towards: "교대방면",
    secondsLeft, arrivalAt: NOW + secondsLeft * 1000, isEstimated: false, message: "", location: "",
    previousStations: [], isExpress: false, isLastTrain: false, ...overrides,
  };
}

function train(trainNo: string, secondsLeft: number, overrides: Partial<Train> = {}): Train {
  return {
    trainNo, arrivalAt: NOW + secondsLeft * 1000, destination: "성수행", isLive: false,
    isEstimated: false, isExpress: false, isLastTrain: false, ...overrides,
  };
}

describe("estimateDelay", () => {
  it("열차번호로 대조해 중앙값을 쓴다 (실시간 0 패딩·시간표 접두어 무시)", () => {
    const s = [sched("479", 5), sched("481", 10), sched("483", 15)];
    // 479: 30초 늦음, 481: 90초 늦음 → 중앙값 60
    expect(estimateDelay(s, [live("0479", 330), live("0481", 690)])).toEqual({ seconds: 60, matched: 2 });
  });

  it("번호가 하나도 안 맞으면 3분 안쪽의 가장 가까운 시간표 열차와 짝짓는다", () => {
    expect(estimateDelay([sched("1", 5), sched("2", 10)], [live("9999", 5 * 60 + 40)])).toEqual({ seconds: 40, matched: 1 });
    expect(estimateDelay([sched("1", 5)], [live("9999", 9 * 60)])).toEqual({ seconds: 0, matched: 0 });
  });

  it("말이 안 되는 지연(+10분 초과, -2분 미만)은 무시한다", () => {
    expect(estimateDelay([sched("1", 5)], [live("1", 16 * 60)]).seconds).toBe(0);
    expect(estimateDelay([sched("1", 5)], [live("1", 2 * 60)]).seconds).toBe(0);
  });
});

describe("mergeTrains", () => {
  it("실시간에 보이는 열차는 그 값, 아니면 시간표 + 지연. 시간표에 없는 열차도 넣는다", () => {
    const merged = mergeTrains([sched("2324", 5), sched("2326", 10)], [live("2324", 6 * 60), live("8322", 4 * 60)], 45);
    expect(merged.map((t) => [t.trainNo, (t.arrivalAt - NOW) / 1000, t.isLive])).toEqual([
      ["8322", 240, true],
      ["2324", 360, true],
      ["2326", 645, false],
    ]);
    expect(merged[1].scheduledAt).toBe(NOW + 5 * 60_000);
  });
});

describe("stateFor", () => {
  it("여유 > 3분 ≥ 짐 싸기 > 1분 ≥ 출발 ≥ 0 > 뛰면 가능 ≥ -2분 > 놓침", () => {
    expect(stateFor(181)).toBe("relax");
    expect(stateFor(180)).toBe("pack");
    expect(stateFor(61)).toBe("pack");
    expect(stateFor(60)).toBe("go");
    expect(stateFor(0)).toBe("go");
    expect(stateFor(-1)).toBe("run");
    expect(stateFor(-120)).toBe("run");
    expect(stateFor(-121)).toBe("missed");
  });
});

describe("planDeparture", () => {
  it("걸어가도 탈 수 있는 가장 빠른 열차를 고른다 (실시간에 안 보이는 먼 열차도)", () => {
    const trains = [train("a", 4 * 60), train("b", 12 * 60), train("c", 20 * 60)];
    const { departure, memory } = planDeparture(trains, NOW, LEAD);
    expect(departure).toMatchObject({ status: "relax", secondsUntilDepart: 5 * 60, departAt: NOW + 5 * 60_000 });
    expect(departure.status !== "waiting" && departure.train.trainNo).toBe("b");
    expect(memory).toEqual({ trainNo: "b" });
  });

  it("탈 수 있는 열차가 없으면 waiting", () => {
    expect(planDeparture([train("a", 60)], NOW, LEAD).departure).toEqual({ status: "waiting" });
    expect(planDeparture([], NOW, LEAD).departure).toEqual({ status: "waiting" });
  });

  it("보던 열차는 출발 시각이 지나도 run으로 계속 보여 준다", () => {
    const trains = [train("a", LEAD - 30), train("b", LEAD + 300)];
    const { departure } = planDeparture(trains, NOW, LEAD, { trainNo: "a" });
    expect(departure).toMatchObject({ status: "run", secondsUntilDepart: -30 });
    // 처음 여는 경우(기억 없음)엔 이미 지난 열차를 고르지 않는다
    expect(planDeparture(trains, NOW, LEAD).departure.status !== "waiting" && planDeparture(trains, NOW, LEAD).memory.trainNo).toBe("b");
  });

  it("놓침은 5초 보여 준 뒤 다음 열차로 넘어간다", () => {
    const trains = [train("a", LEAD - 150), train("b", LEAD + 300)];
    const first = planDeparture(trains, NOW, LEAD, { trainNo: "a" });
    expect(first.departure.status).toBe("missed");
    expect(first.memory).toEqual({ trainNo: "a", missedAt: NOW });

    expect(planDeparture(trains, NOW + 4999, LEAD, first.memory).departure.status).toBe("missed");
    const after = planDeparture(trains, NOW + 5000, LEAD, first.memory);
    expect(after.departure.status !== "waiting" && after.departure.train.trainNo).toBe("b");
    expect(after.memory).toEqual({ trainNo: "b" });
  });

  it("보던 열차보다 빠른 임시 열차가 나타나면 그쪽으로 바꾼다", () => {
    const { departure } = planDeparture([train("x", LEAD + 60), train("a", LEAD + 300)], NOW, LEAD, { trainNo: "a" });
    expect(departure.status !== "waiting" && departure.train.trainNo).toBe("x");
  });

  it("고른 열차가 막차면 isLastTrain이 true", () => {
    const { departure } = planDeparture([train("a", 600, { isLastTrain: true })], NOW, LEAD);
    expect(departure.status !== "waiting" && departure.train.isLastTrain).toBe(true);
  });
});

describe("formatDuration", () => {
  it("분/초 표기", () => {
    expect(formatDuration(200)).toBe("3분 20초");
    expect(formatDuration(120)).toBe("2분 0초");
    expect(formatDuration(45.9)).toBe("45초");
    expect(formatDuration(-3)).toBe("0초");
  });
});

describe("formatClock", () => {
  it("m:ss, 지난 시각은 −", () => {
    expect(formatClock(161)).toBe("2:41");
    expect(formatClock(750)).toBe("12:30");
    expect(formatClock(5)).toBe("0:05");
    expect(formatClock(-35)).toBe("−0:35");
    expect(formatClock(-0.4)).toBe("0:00");
  });
});
