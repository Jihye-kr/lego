// 서울시 "역코드로 지하철역별 열차 시간표" (SearchSTNTimeTableByIDService)
// 실시간 도착정보는 방면마다 다음 2대(약 4~8분 앞)까지만 와서, 승강장까지 그보다 오래 걸리면 탈 열차를 못 고른다.
// 그래서 탈 열차는 시간표에서 고르고, 실시간은 지연 보정에만 쓴다. (참고: haeun2525/nu40-commute)

export type RawTimetableRow = {
  TRAIN_NO: string; // "2324" | "K479" | "C9137" (실시간 btrainNo는 "0479"처럼 숫자만)
  ARRIVETIME: string; // "18:10:30". 이 역이 출발역이면 "00:00:00"
  LEFTTIME: string;
  DESTSTATION: string; // 종착역 역코드
  SUBWAYENAME: string; // 종착역 이름
  EXPRESS_YN: string; // "D" = 급행
};

export type RawTimetableResponse = {
  SearchSTNTimeTableByIDService?: { row?: RawTimetableRow[] };
  RESULT?: { CODE: string; MESSAGE: string };
};

export type RawStationInfoResponse = {
  SearchInfoBySubwayNameService?: { row?: { STATION_CD: string; STATION_NM: string; LINE_NUM: string }[] };
  RESULT?: { CODE: string; MESSAGE: string };
};

export type ScheduledTrain = {
  trainNo: string; // normalizeTrainNo 적용
  arrivalAt: number; // 시간표상 도착 epoch ms
  destination: string; // "성수행"
  isExpress: boolean;
};

// 2026-10-31 확인: 시간표는 1~9호선만 제공 (신분당·공항철도·경의중앙·수인분당·신림·우이신설·경춘·GTX-A는 INFO-200)
export function timetableLineNum(subwayId: string): string | undefined {
  const n = Number(subwayId) - 1000;
  return n >= 1 && n <= 9 ? `0${n}호선` : undefined;
}

// 앱 역명(실시간 API 기준) → 역코드 검색용 역명
const INFO_STATION_NAMES: Record<string, string> = { 서울: "서울역", "응암순환(상선)": "응암" };

export function infoStationName(name: string): string {
  return INFO_STATION_NAMES[name] ?? name.replace(/\(.*\)$/, "");
}

// 시간표 방향: 1 = 상행·내선, 2 = 하행·외선
export function inoutTag(direction: string): 1 | 2 {
  return direction === "하행" || direction === "외선" ? 2 : 1;
}

// "K0479" → "479", 실시간 "0479" → "479"
export function normalizeTrainNo(no: string): string {
  return no.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

// 휴일 시간표(3)를 쓰는 공휴일. 주말과 겹쳐도 무방
// ponytail: 연도별 하드코딩. 2027년은 정부 발표(대체·임시공휴일)로 재확인 필요
const HOLIDAYS = new Set([
  "2026-01-01", "2026-02-16", "2026-02-17", "2026-02-18", "2026-03-01", "2026-03-02", "2026-05-05",
  "2026-05-24", "2026-05-25", "2026-06-03", "2026-06-06", "2026-08-15", "2026-08-17", "2026-09-24",
  "2026-09-25", "2026-09-26", "2026-10-03", "2026-10-05", "2026-10-09", "2026-12-25",
  "2027-01-01", "2027-02-06", "2027-02-07", "2027-02-08", "2027-02-09", "2027-03-01", "2027-05-05",
  "2027-05-13", "2027-06-06", "2027-08-15", "2027-08-16", "2027-09-14", "2027-09-15", "2027-09-16",
  "2027-10-03", "2027-10-04", "2027-10-09", "2027-10-11", "2027-12-25", "2027-12-27",
]);

const KST_MS = 9 * 3600_000;
const SERVICE_DAY_START_HOUR = 3; // 새벽 3시 전은 전날 시간표(24시 넘어 다니는 막차)

// 지금 시각이 속한 운행일(KST)과 요일 구분 1 = 평일, 2 = 토요일, 3 = 일요일·공휴일
export function serviceDay(now: number): { date: string; week: 1 | 2 | 3 } {
  const d = new Date(now + KST_MS - SERVICE_DAY_START_HOUR * 3600_000);
  const date = d.toISOString().slice(0, 10);
  const dow = d.getUTCDay();
  return { date, week: dow === 0 || HOLIDAYS.has(date) ? 3 : dow === 6 ? 2 : 1 };
}

function clockToMs(date: string, clock: string): number | null {
  const m = clock.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  let h = Number(m[1]);
  if (h < SERVICE_DAY_START_HOUR) h += 24; // "00:12:00"도 "24:12:00"과 같은 뜻
  return Date.parse(`${date}T00:00:00+09:00`) + ((h * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000;
}

export function parseTimetable(rows: RawTimetableRow[], stationCode: string, date: string): ScheduledTrain[] {
  const trains: ScheduledTrain[] = [];
  for (const r of rows) {
    if (r.DESTSTATION === stationCode) continue; // 이 역이 종착인 열차는 못 탄다
    const clock = r.ARRIVETIME && r.ARRIVETIME !== "00:00:00" ? r.ARRIVETIME : r.LEFTTIME; // 출발역이면 도착시각이 비어 있다
    const arrivalAt = clockToMs(date, clock);
    if (arrivalAt === null) continue;
    trains.push({
      trainNo: normalizeTrainNo(r.TRAIN_NO),
      arrivalAt,
      destination: `${r.SUBWAYENAME}행`,
      isExpress: r.EXPRESS_YN === "D",
    });
  }
  return trains.sort((a, b) => a.arrivalAt - b.arrivalAt);
}
