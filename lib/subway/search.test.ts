import { describe, expect, it } from "vitest";
import gangnam from "../../fixtures/arrivals-gangnam.json";
import type { RawArrivalResponse } from "../../types/subway";
import { LINES } from "../lines";
import { directionOptions } from "./directions";
import { parseArrivals, parseRecptnDt } from "./parse";
import { searchStations } from "./search";
import stations from "./stations.json";

describe("stations.json", () => {
  it("모든 노선 ID가 LINES에 있다", () => {
    const ids = new Set(stations.flatMap((s) => s.lines));
    expect([...ids].filter((id) => !(id in LINES))).toEqual([]);
  });
});

describe("searchStations", () => {
  it("정확히 일치하는 역이 먼저", () => {
    expect(searchStations("강남")[0]).toEqual({ name: "강남", lines: ["1002", "1077"] });
  });

  it("끝의 '역'은 무시", () => {
    expect(searchStations("서울역")[0].name).toBe("서울");
  });

  it("API 역명이 다른 역도 부분 검색으로 찾는다", () => {
    expect(searchStations("천호").map((s) => s.name)).toContain("천호(풍납토성)");
    expect(searchStations("응암").map((s) => s.name)).toContain("응암순환(상선)");
  });

  it("빈 검색어는 빈 결과", () => {
    expect(searchStations("  ")).toEqual([]);
  });
});

describe("directionOptions", () => {
  const arrivals = parseArrivals(gangnam as RawArrivalResponse, parseRecptnDt("2026-10-31 12:09:48"));

  it("실제 응답에서 방향과 방면을 뽑는다 (2호선 내선/외선)", () => {
    expect(directionOptions(arrivals, "1002")).toEqual([
      { direction: "내선", towards: "교대방면" },
      { direction: "외선", towards: "역삼방면" },
    ]);
  });

  it("운행 중인 열차가 없으면 기본 방향", () => {
    expect(directionOptions([], "1002").map((d) => d.direction)).toEqual(["내선", "외선"]);
    expect(directionOptions([], "1003").map((d) => d.direction)).toEqual(["상행", "하행"]);
  });
});
