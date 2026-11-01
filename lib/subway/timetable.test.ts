import { describe, expect, it } from "vitest";
import { parseRecptnDt } from "./parse";
import { infoStationName, inoutTag, normalizeTrainNo, parseTimetable, serviceDay, timetableLineNum, type RawTimetableRow } from "./timetable";

function row(TRAIN_NO: string, ARRIVETIME: string, overrides: Partial<RawTimetableRow> = {}): RawTimetableRow {
  return { TRAIN_NO, ARRIVETIME, LEFTTIME: "00:00:00", DESTSTATION: "0211", SUBWAYENAME: "성수", EXPRESS_YN: "G", ...overrides };
}

describe("parseTimetable", () => {
  const trains = parseTimetable(
    [
      row("2326", "18:16:00"),
      row("K479", "18:12:00", { EXPRESS_YN: "D", SUBWAYENAME: "서동탄" }),
      row("2003", "00:00:00", { LEFTTIME: "05:30:00" }), // 이 역이 출발역
      row("S214", "24:12:30", { DESTSTATION: "0222" }), // 이 역이 종착 → 제외
      row("2517", "00:12:00"), // 자정 넘은 막차 → 다음 날 00:12
      row("x", "bad"),
    ],
    "0222",
    "2026-10-31",
  );

  it("종착·잘못된 시각을 빼고 시각 순으로 정렬한다", () => {
    expect(trains.map((t) => t.trainNo)).toEqual(["2003", "479", "2326", "2517"]);
  });

  it("KST 시각을 epoch로, 출발역은 LEFTTIME, 3시 전은 다음 날로", () => {
    expect(trains[0].arrivalAt).toBe(parseRecptnDt("2026-10-31 05:30:00"));
    expect(trains[2].arrivalAt).toBe(parseRecptnDt("2026-10-31 18:16:00"));
    expect(trains[3].arrivalAt).toBe(parseRecptnDt("2026-11-01 00:12:00"));
  });

  it("급행·행선지", () => {
    expect(trains[1]).toMatchObject({ trainNo: "479", isExpress: true, destination: "서동탄행" });
  });
});

describe("serviceDay", () => {
  it("평일/토/일·공휴일 구분, 새벽 3시 전은 전날", () => {
    expect(serviceDay(parseRecptnDt("2026-10-30 18:00:00"))).toEqual({ date: "2026-10-30", week: 1 }); // 금
    expect(serviceDay(parseRecptnDt("2026-10-31 18:00:00"))).toEqual({ date: "2026-10-31", week: 2 }); // 토
    expect(serviceDay(parseRecptnDt("2026-11-01 02:59:00"))).toEqual({ date: "2026-10-31", week: 2 });
    expect(serviceDay(parseRecptnDt("2026-11-01 03:00:00"))).toEqual({ date: "2026-11-01", week: 3 }); // 일
    expect(serviceDay(parseRecptnDt("2026-10-09 12:00:00"))).toEqual({ date: "2026-10-09", week: 3 }); // 한글날(금)
  });
});

describe("변환 규칙", () => {
  it("시간표는 1~9호선만", () => {
    expect(timetableLineNum("1002")).toBe("02호선");
    expect(timetableLineNum("1009")).toBe("09호선");
    expect(timetableLineNum("1077")).toBeUndefined();
  });

  it("역명·방향·열차번호", () => {
    expect(infoStationName("서울")).toBe("서울역");
    expect(infoStationName("천호(풍납토성)")).toBe("천호");
    expect(infoStationName("응암순환(상선)")).toBe("응암");
    expect(infoStationName("강남")).toBe("강남");
    expect([inoutTag("상행"), inoutTag("내선"), inoutTag("하행"), inoutTag("외선")]).toEqual([1, 1, 2, 2]);
    expect([normalizeTrainNo("0479"), normalizeTrainNo("K479"), normalizeTrainNo("C9137"), normalizeTrainNo("0")]).toEqual(["479", "479", "9137", "0"]);
  });
});
