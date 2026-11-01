// 서울시 realtimeStationArrival 원본 응답 (값은 모두 문자열로 옴)
export type RawArrival = {
  subwayId: string;
  updnLine: string;
  trainLineNm: string;
  statnId: string;
  statnNm: string;
  subwayList: string; // 환승 노선 subwayId, 쉼표 구분 예: "1001,1004,1063,1065"
  btrainNo: string;
  btrainSttus: string; // "일반" | "급행" | ...
  bstatnNm: string; // 종착역
  barvlDt: string; // 도착까지 초. 일부 노선은 거의 항상 "0"
  recptnDt: string; // "YYYY-MM-DD HH:mm:ss" (KST)
  arvlMsg2: string;
  arvlMsg3: string;
  arvlCd: string;
  lstcarAt: string; // "1"이면 막차
};

type ApiResult = { status: number; code: string; message: string };

// 정상: errorMessage에 결과 코드 / 오류: 최상위에 결과 코드
export type RawArrivalResponse = {
  errorMessage?: ApiResult;
  realtimeArrivalList?: RawArrival[];
} & Partial<ApiResult>;

export type Arrival = {
  trainNo: string;
  subwayId: string; // 노선 색 조회용 (lib/lines)
  line: string; // 예: "2호선"
  direction: string; // 상행/하행/내선/외선
  destination: string; // 예: "성수행"
  towards: string; // 다음 역 방면 예: "교대방면"
  secondsLeft: number; // recptnDt 보정 후 남은 초
  arrivalAt: number; // 도착 예상 epoch ms
  isEstimated: boolean; // barvlDt 없이 "N번째 전역" 등 메시지로 추정한 값
  message: string; // 원본 도착 메시지
  location: string; // 열차가 지금 있는 역 (arvlMsg3)
  stopsAway?: number; // location이 이번 역에서 몇 역 전인지 (메시지로 알 수 있을 때만: 0 = 이번 역)
  isExpress: boolean;
  isLastTrain: boolean;
};
