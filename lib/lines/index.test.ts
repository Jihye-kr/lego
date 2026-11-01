import { describe, expect, it } from "vitest";
import type { RawArrivalResponse } from "../../types/subway";
import gangnam from "../../fixtures/arrivals-gangnam.json";
import seoul from "../../fixtures/arrivals-seoul.json";
import wangsimni from "../../fixtures/arrivals-wangsimni.json";
import expressBusTerminal from "../../fixtures/arrivals-express-bus-terminal.json";
import jamsil from "../../fixtures/arrivals-jamsil.json";
import sangbong from "../../fixtures/arrivals-sangbong.json";
import sillim from "../../fixtures/arrivals-sillim.json";
import cheonho from "../../fixtures/arrivals-cheonho.json";
import { LINES, SURFACE, UNKNOWN_LINE_COLOR, contrastRatio, getLine, lineShortLabel, lineTone, mixHex, mutedColor, readableOn, textColorOn, trainTones } from ".";

const rows = [gangnam, seoul, wangsimni, expressBusTerminal, jamsil, sangbong, sillim, cheonho].flatMap((r) => (r as RawArrivalResponse).realtimeArrivalList ?? []);

describe("subwayId ↔ fixtures 실제 응답", () => {
  it("fixtures가 비어 있지 않다", () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it("응답에 나온 모든 subwayId(subwayList 포함)가 LINES에 있다", () => {
    const ids = new Set(rows.flatMap((r) => [r.subwayId, ...r.subwayList.split(",")]));
    const missing = [...ids].filter((id) => !(id in LINES));
    expect(missing).toEqual([]);
  });

  // 실제 환승역 구성으로 ID→노선명 매핑을 검증
  it.each([
    ["강남", ["2호선", "신분당선"]],
    ["서울", ["1호선", "4호선", "경의중앙선", "공항철도"]],
    ["왕십리", ["2호선", "5호선", "경의중앙선", "수인분당선"]],
    ["고속터미널", ["3호선", "7호선", "9호선"]],
    ["잠실", ["2호선", "8호선"]],
    ["상봉", ["7호선", "경의중앙선", "경춘선"]],
    ["신림", ["2호선", "신림선"]],
    ["천호(풍납토성)", ["5호선", "8호선"]],
  ])("%s역 subwayList → %j", (station, names) => {
    const row = rows.find((r) => r.statnNm === station);
    expect(row).toBeDefined();
    expect(row!.subwayList.split(",").map((id) => getLine(id).name).sort()).toEqual([...names].sort());
  });
});

describe("getLine", () => {
  it("알 수 없는 ID는 회색 + 노선명 텍스트", () => {
    expect(getLine("9999")).toEqual({ id: "9999", name: "기타 노선", color: UNKNOWN_LINE_COLOR });
  });
});

describe("textColorOn", () => {
  it("모든 노선 색에서 WCAG 4.5:1 이상", () => {
    for (const { color } of [...Object.values(LINES), { color: UNKNOWN_LINE_COLOR }]) {
      expect(contrastRatio(color, textColorOn(color)), color).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("어두운 색엔 흰 글자, 밝은 색엔 검정 글자", () => {
    expect(textColorOn(LINES["1001"].color)).toBe("#FFFFFF");
    expect(textColorOn(LINES["1009"].color)).toBe("#000000");
  });

  it("대비 계산 기준값", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1);
  });
});

describe("trainTones", () => {
  it("띠는 노선 색 그대로, 차체·줄은 흰색 쪽으로 섞은 톤", () => {
    expect(mixHex("#000000", "#FFFFFF", 0.5)).toBe("#808080");
    expect(mixHex("#00A84D", "#FFFFFF", 0)).toBe("#00A84D");
    const t = trainTones("#00A84D");
    expect(t.band).toBe("#00A84D");
    expect(t.body).toBe(mixHex("#00A84D", "#FFFFFF", 0.3));
    expect(contrastRatio(t.stripe, "#FFFFFF")).toBeLessThan(contrastRatio(t.body, "#FFFFFF")); // 줄이 더 밝다
  });
});

describe("lineTone (톤 다운 노선 색)", () => {
  it("채도만 60%로 줄고 무채색은 그대로", () => {
    expect(mutedColor("#808080")).toBe("#808080");
    expect(mutedColor("#00A84D", 1)).toBe("#00A84D");
    expect(mutedColor("#00A84D")).toBe("#228650"); // 디자인 캔버스 '노선 색 톤 다운' 값
  });

  it("모든 노선 스티커 글자가 회색 바탕에서 4.5:1 이상", () => {
    for (const { color } of [...Object.values(LINES), { color: UNKNOWN_LINE_COLOR }]) {
      const { text } = lineTone(color);
      expect(contrastRatio(text, SURFACE), color).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("이미 충분히 어두우면 내리지 않는다", () => {
    expect(readableOn("#215283", SURFACE)).toBe("#215283");
  });
});

describe("lineShortLabel", () => {
  it("N호선은 숫자, 나머지는 첫 글자", () => {
    expect(lineShortLabel("2호선")).toBe("2");
    expect(lineShortLabel("경의중앙선")).toBe("경");
    expect(lineShortLabel("GTX-A")).toBe("G");
  });
});
