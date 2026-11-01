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
    const got = mapTrains([train(-25_000), train(-10_000), train(120_000), train(300_000), train(480_000)], now);
    expect(got.map((m) => m.stops)).toEqual([0, 1, 2.5]);
  });
});

describe("stopNames", () => {
  it("메시지로 몇 역 전인지 알 때만 역명을 채운다", () => {
    const a = (location: string, stopsAway?: number) => ({ location, stopsAway }) as Arrival;
    expect(stopNames([a("교대", 1), a("방배"), a("서초", 2), a("판교", 9)], "강남")).toEqual(["강남", "교대", "서초", undefined]);
  });
});
