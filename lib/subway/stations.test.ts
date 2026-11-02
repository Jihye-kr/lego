import { describe, expect, it } from "vitest";
import { previousStations } from "./stations";

describe("previousStations", () => {
  it("바로 전 역 방향으로 이어서 역 이름을 찾는다", () => {
    // 2호선 강남(222) 외선: 교대(223) 쪽에서 온다
    expect(previousStations("1002000222", "1002000223", 3)).toEqual(["교대", "서초", "방배"]);
    expect(previousStations("1002000222", "1002000221", 3)).toEqual(["역삼", "선릉", "삼성"]);
  });

  it("2호선은 시청 ↔ 충정로에서 이어진다", () => {
    expect(previousStations("1002000202", "1002000201", 3)).toEqual(["시청", "충정로", "아현"]);
    expect(previousStations("1002000242", "1002000243", 2)).toEqual(["충정로", "시청"]);
  });

  it("목록에 없는 역(종점 너머·지선)부터는 비운다", () => {
    expect(previousStations("1003000351", "1003000352", 3)).toEqual(["오금", undefined, undefined]);
    expect(previousStations("1063080313", "1063080313", 2)).toEqual([undefined, undefined]);
  });
});
