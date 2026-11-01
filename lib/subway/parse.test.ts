import { describe, expect, it } from "vitest";
import type { RawArrival, RawArrivalResponse } from "../../types/subway";
import gangnam from "../../fixtures/arrivals-gangnam.json";
import seoul from "../../fixtures/arrivals-seoul.json";
import jamsil from "../../fixtures/arrivals-jamsil.json";
import { LINES } from "../lines";
import { parseArrivals, parseRecptnDt } from "./parse";
import { toApiStationName } from "./stations";

const T0 = parseRecptnDt("2026-10-31 12:00:00");

function row(overrides: Partial<RawArrival>): RawArrivalResponse {
  return {
    realtimeArrivalList: [
      {
        subwayId: "1002", updnLine: "내선", trainLineNm: "성수행 - 교대방면", statnId: "", statnNm: "강남",
        subwayList: "1002", btrainNo: "2001", btrainSttus: "일반", bstatnNm: "성수", barvlDt: "240",
        recptnDt: "2026-10-31 12:00:00", arvlMsg2: "4분 후", arvlMsg3: "", arvlCd: "99", lstcarAt: "0",
        ...overrides,
      },
    ],
  };
}

describe("parseRecptnDt", () => {
  it("KST로 해석한다", () => {
    expect(parseRecptnDt("2026-10-31 12:00:00")).toBe(Date.UTC(2026, 9, 31, 3, 0, 0));
  });
});

describe("parseArrivals — 규칙", () => {
  it("recptnDt 이후 지난 시간만큼 보정", () => {
    const [a] = parseArrivals(row({}), T0 + 40_000);
    expect(a.secondsLeft).toBe(200);
    expect(a.arrivalAt).toBe(T0 + 240_000);
    expect(a.isEstimated).toBe(false);
  });

  it("필드 변환", () => {
    const [a] = parseArrivals(row({ lstcarAt: "1", btrainSttus: "급행" }), T0);
    expect(a).toMatchObject({ trainNo: "2001", line: "2호선", direction: "내선", destination: "성수행", isLastTrain: true, isExpress: true });
  });

  it("이 역을 이미 출발한 열차는 제외", () => {
    expect(parseArrivals(row({ arvlMsg2: "강남 출발", barvlDt: "60", arvlCd: "2" }), T0)).toEqual([]);
  });

  it("진입/도착 중이면 0초", () => {
    expect(parseArrivals(row({ arvlMsg2: "강남 진입", barvlDt: "60" }), T0)[0].secondsLeft).toBe(0);
  });

  it("barvlDt가 0이면 메시지로 추정", () => {
    const at = (msg: string) => parseArrivals(row({ barvlDt: "0", arvlMsg2: msg }), T0)[0];
    expect(at("[4]번째 전역 (석촌)")).toMatchObject({ secondsLeft: 480, isEstimated: true });
    expect(at("전역 출발").secondsLeft).toBe(60);
    expect(at("천호(풍납토성) 전역출발").secondsLeft).toBe(60);
    expect(at("전역 도착").secondsLeft).toBe(90);
    expect(at("전역 진입").secondsLeft).toBe(120);
  });

  it("해석할 수 없는 메시지 + barvlDt 0이면 제외", () => {
    expect(parseArrivals(row({ barvlDt: "0", arvlMsg2: "운행중" }), T0)).toEqual([]);
  });

  it("예상 시각이 30초 넘게 지났으면 제외, 그 안이면 0초", () => {
    expect(parseArrivals(row({ barvlDt: "60" }), T0 + 80_000)[0].secondsLeft).toBe(0);
    expect(parseArrivals(row({ barvlDt: "60" }), T0 + 91_000)).toEqual([]);
  });
});

describe("parseArrivals — 실제 응답 fixtures", () => {
  const fixtures = { gangnam, seoul, jamsil } as Record<string, RawArrivalResponse>;
  const latest = (r: RawArrivalResponse) => Math.max(...r.realtimeArrivalList!.map((x) => parseRecptnDt(x.recptnDt)));

  it.each(Object.keys(fixtures))("%s: 모든 결과가 유효하고 도착순 정렬", (name) => {
    const raw = fixtures[name];
    const arrivals = parseArrivals(raw, latest(raw));
    expect(arrivals.length).toBeGreaterThan(0);
    for (const a of arrivals) {
      expect(a.subwayId in LINES).toBe(true);
      expect(Number.isFinite(a.arrivalAt) && a.secondsLeft >= 0).toBe(true);
    }
    expect(arrivals.map((a) => a.arrivalAt)).toEqual([...arrivals.map((a) => a.arrivalAt)].sort((x, y) => x - y));
  });

  it("서울역: '서울 출발' 공항철도 열차는 빠지고, 4분 후 4호선은 남는다", () => {
    const arrivals = parseArrivals(seoul as RawArrivalResponse, parseRecptnDt("2026-10-31 12:09:50"));
    expect(arrivals.some((a) => a.message === "서울 출발")).toBe(false);
    expect(arrivals.find((a) => a.message === "4분 후 (삼각지)")?.secondsLeft).toBe(240);
  });

  it("강남: 2호선 내선/외선과 신분당선 추정값", () => {
    const arrivals = parseArrivals(gangnam as RawArrivalResponse, parseRecptnDt("2026-10-31 12:14:28"));
    expect(new Set(arrivals.filter((a) => a.line === "2호선").map((a) => a.direction))).toEqual(new Set(["내선", "외선"]));
    expect(arrivals.filter((a) => a.line === "신분당선").every((a) => a.isEstimated)).toBe(true);
  });
});

describe("toApiStationName", () => {
  it("API상 이름이 다른 역을 바꾼다", () => {
    expect(toApiStationName("서울역")).toBe("서울");
    expect(toApiStationName("천호")).toBe("천호(풍납토성)");
    expect(toApiStationName("강남")).toBe("강남");
  });
});

describe("parseArrivals — 열차 현재 위치", () => {
  it("메시지로 몇 역 전인지 알 때만 stopsAway", () => {
    const at = (arvlMsg2: string, arvlMsg3: string) => parseArrivals(row({ arvlMsg2, arvlMsg3, barvlDt: "0" }), T0)[0];
    expect(at("전역 도착", "교대")).toMatchObject({ location: "교대", stopsAway: 1 });
    expect(at("[2]번째 전역 (양재시민의숲)", "양재시민의숲").stopsAway).toBe(2);
    expect(at("강남 진입", "강남").stopsAway).toBe(0);
    expect(parseArrivals(row({ arvlMsg3: "방배" }), T0)[0]).toMatchObject({ location: "방배", stopsAway: undefined });
  });
});
