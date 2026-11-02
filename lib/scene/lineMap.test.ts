import { describe, expect, it } from "vitest";
import type { Train } from "../departure";
import type { Arrival } from "../../types/subway";
import { mapTrains, stopNames } from "./lineMap";

const train = (arrivalAt: number): Train => ({
  trainNo: String(arrivalAt), arrivalAt, destination: "성수행", isLive: true, isEstimated: false, isExpress: false, isLastTrain: false,
});

describe("mapTrains", () => {
  it("남은 시간 2분 = 1역 전, 정차 중이면 0, 떠났거나 너무 멀면 빠진다", () => {
    const now = 0;
    const got = mapTrains([train(-25_000), train(-10_000), train(120_000), train(300_000), train(360_000), train(390_000)], now);
    expect(got.map((m) => m.stops)).toEqual([0, 1, 2.5, 3]);
  });

  it("다음 폴링에서 도착 예상이 늘어나도 뒤로 가지 않는다", () => {
    const last = new Map<string, number>();
    const t = (arrivalAt: number) => ({ ...train(arrivalAt), trainNo: "0479" });
    expect(mapTrains([t(240_000)], 0, last)[0].stops).toBe(2);
    expect(mapTrains([t(300_000)], 0, last)[0].stops).toBe(2); // 추정이 늦어짐 → 제자리
    expect(mapTrains([t(180_000)], 0, last)[0].stops).toBe(1.5); // 다시 다가오면 이어서 이동
    mapTrains([], 0, last);
    expect(last.size).toBe(0); // 사라진 열차는 잊는다
  });
});

describe("stopNames", () => {
  it("메시지로 몇 역 전인지 알 때만 역명을 채운다", () => {
    const a = (location: string, stopsAway?: number) => ({ location, stopsAway }) as Arrival;
    expect(stopNames([a("교대", 1), a("방배"), a("서초", 2), a("판교", 9)], "강남")).toEqual(["강남", "교대", "서초", undefined]);
  });

  it("역 ID로 찾은 앞 역 이름이 기본이고, 메시지 역명이 있으면 그걸 쓴다", () => {
    const prev = { previousStations: ["교대", "서초", undefined] } as Arrival;
    const msg = { location: "방배역", stopsAway: 3, previousStations: [] as string[] } as Arrival;
    expect(stopNames([prev, msg], "강남")).toEqual(["강남", "교대", "서초", "방배역"]);
  });
});
