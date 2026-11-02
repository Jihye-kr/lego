import { useRef } from "react";
import type { Train } from "@/lib/departure";
import { MAP_STOPS, mapTrains, stopNames } from "@/lib/scene/lineMap";
import type { Arrival } from "@/types/subway";

const RELATION = ["이번 역", "전역", "전전역", "3역 전"];

// 남은 역 수 → 왼쪽에서의 위치 (왼쪽 끝 = 3역 전, 오른쪽 끝 = 이번 역. 열차는 오른쪽으로 다가온다)
// 양 끝 역 점(12px)이 콘텐츠 너비 끝에 딱 붙도록 점 반지름 6px만큼 안쪽에서 시작
const left = (stops: number) => `calc(6px + (100% - 12px) * ${1 - stops / (MAP_STOPS - 1)})`;

// 역 점 아래 이름 정렬: 양 끝은 바깥쪽 끝에 맞춰 너비 밖으로 넘치지 않게, 가운데는 점 중심에
const stopAlign = (i: number) =>
  i === 0 ? "items-end translate-x-[calc(-100%+6px)]" : i === MAP_STOPS - 1 ? "items-start -translate-x-1.5" : "items-center -translate-x-1/2";

// 화면 최상단 한 줄 노선도: 카드 없이 가는 선 + 역 점 + 열차(노선 색). stale이면 열차를 회색으로
// 걸어서 못 타는 열차는 흐리게 (탈 열차는 흐리게 하지 않는다)
export function LineMap({ trains, arrivals, station, now, leadSeconds, chosenTrainNo, stale }: {
  trains: Train[]; arrivals: Arrival[]; station: string; now: number; leadSeconds: number; chosenTrainNo?: string; stale?: boolean;
}) {
  const names = stopNames(arrivals, station);
  const last = useRef(new Map<string, number>());
  // eslint-disable-next-line react-hooks/refs -- 표시 위치만 기억하는 캐시라 렌더 중 갱신해도 안전
  const shown = mapTrains(trains, now, last.current);
  const summary = shown.length
    ? shown.map(({ train, stops }) => `${train.destination} ${stops < 0.5 ? "이번 역" : `약 ${Math.round(stops)}역 전`}`).join(", ")
    : "가까이 있는 열차가 없어요";

  return (
    <div role="img" aria-label={`노선도: ${summary}`} className="pt-5">
      <div className="relative h-[34px]">
        <div className="absolute inset-x-0 top-[5px] h-0.5 rounded-full bg-neutral-300" />
        {names.map((name, i) => (
          <div key={i} className={`absolute top-0 flex flex-col gap-[5px] ${stopAlign(i)}`} style={{ left: left(i) }}>
            <span className={`size-3 rounded-full border-2 ${i === 0 ? "border-foreground bg-foreground" : "border-neutral-400 bg-background"}`} />
            <span className={`text-xs whitespace-nowrap ${i === 0 ? "font-bold text-foreground" : "text-muted-foreground"}`}>
              {i === 0 ? station : (name ?? RELATION[i])}
            </span>
          </div>
        ))}
        {shown.map(({ train, stops }) => {
          const secondsLeft = (train.arrivalAt - now) / 1000;
          const chosen = train.trainNo === chosenTrainNo;
          return (
            <div
              key={train.trainNo}
              // useNow가 1초마다 갱신 → 1초 선형 보간으로 끊김 없이 이동. -top-2: 아이콘 13px의 바닥이 선(5px) 위에 얹힌다
              className={`absolute -top-2 -translate-x-1/2 transition-[left] duration-1000 ease-linear motion-reduce:transition-none ${
                chosen || secondsLeft >= leadSeconds ? "" : "opacity-40"
              }`}
              style={{ left: left(stops) }}
            >
              <TrainIcon className={stale ? "fill-neutral-400" : "fill-line"} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 오른쪽(이번 역 쪽)을 보는 꼬마 열차: 둥근 앞코 + 네모 창 + 헤드라이트. 몸통 색은 className(fill-*)으로
function TrainIcon({ className }: { className: string }) {
  return (
    <svg width="26" height="13" viewBox="0 0 26 13" aria-hidden className={`block ${className}`}>
      <path d="M4 1h12c5 0 9 4 9 9v1.5c0 .8-.7 1.5-1.5 1.5H2.5C1.7 13 1 12.3 1 11.5V4c0-1.7 1.3-3 3-3z" />
      <rect x="4.5" y="4" width="4" height="4" rx="0.5" fill="white" />
      <rect x="10" y="4" width="4" height="4" rx="0.5" fill="white" />
      <path d="M17 4h1.5c2 0 3.6 1.4 4 3.2l.1.8H17z" fill="white" />
      <circle cx="23" cy="10.5" r="1" fill="#FDE68A" />
    </svg>
  );
}
