import { describe, expect, it } from "vitest";
import { englishStationName } from "./english";
import stations from "./stations.json";

describe("englishStationName", () => {
  it("API 역명이 다른 역도 영문명을 찾는다", () => {
    expect(englishStationName("시청")).toBe("City Hall");
    expect(englishStationName("서울")).toBe("Seoul Station");
    expect(englishStationName("천호(풍납토성)")).toBe("Cheonho");
    expect(englishStationName("응암순환(상선)")).toBe("Eungam");
    expect(englishStationName("4.19 민주묘지")).toBe("April 19th National Cemetery");
  });

  it("앱의 모든 역에 영문명이 있다", () => {
    expect(stations.filter((s) => !englishStationName(s.name)).map((s) => s.name)).toEqual([]);
  });
});
