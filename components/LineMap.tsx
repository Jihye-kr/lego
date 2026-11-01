import type { Train } from "@/lib/departure";
import { MAP_STOPS, mapTrains, stopNames } from "@/lib/scene/lineMap";
import type { Arrival } from "@/types/subway";

const RELATION = ["이번 역", "전역", "전전역", "3역 전"];

// 남은 역 수 → 왼쪽에서의 % (왼쪽 끝 = 3역 전, 오른쪽 끝 = 이번 역. 열차는 오른쪽으로 다가온다)
const left = (stops: number) => `${(1 - stops / (MAP_STOPS - 1)) * 100}%`;

// 화면 최상단 한 줄 노선도: 카드 없이 가는 선 + 역 점 + 열차(노선 색). stale이면 열차를 회색으로
export function LineMap({ trains, arrivals, station, now, chosenTrainNo, stale }: {
  trains: Train[]; arrivals: Arrival[]; station: string; now: number; chosenTrainNo?: string; stale?: boolean;
}) {
  const names = stopNames(arrivals, station);
  const shown = mapTrains(trains, now);
  const summary = shown.length
    ? shown.map(({ train, stops }) => `${train.destination} ${stops < 0.5 ? "이번 역" : `약 ${Math.round(stops)}역 전`}`).join(", ")
    : "가까이 있는 열차가 없어요";

  return (
    <div role="img" aria-label={`노선도: ${summary}`} className="mx-6 pt-5">
      <div className="relative h-[34px]">
        <div className="absolute inset-x-0 top-[5px] h-0.5 rounded-full bg-neutral-300" />
        {names.map((name, i) => (
          <div key={i} className="absolute top-0 flex -translate-x-1/2 flex-col items-center gap-[5px]" style={{ left: left(i) }}>
            <span className={`size-3 rounded-full border-2 ${i === 0 ? "border-foreground bg-foreground" : "border-neutral-400 bg-background"}`} />
            <span className={`text-xs whitespace-nowrap ${i === 0 ? "font-bold text-foreground" : "text-muted-foreground"}`}>
              {i === 0 ? station : (name ?? RELATION[i])}
            </span>
          </div>
        ))}
        {shown.map(({ train, stops }) => {
          const secondsLeft = (train.arrivalAt - now) / 1000;
          return (
            <div
              key={train.trainNo}
              // useNow가 1초마다 갱신 → 1초 선형 보간으로 끊김 없이 이동
              className="absolute -top-5 flex -translate-x-1/2 flex-col items-center gap-0.5 transition-[left] duration-1000 ease-linear motion-reduce:transition-none"
              style={{ left: left(stops) }}
            >
              <span className="text-xs font-bold tabular-nums whitespace-nowrap">
                {secondsLeft <= 0 ? "도착" : `${Math.max(1, Math.round(secondsLeft / 60))}분`}
              </span>
              <span
                className={`h-3 w-[22px] rounded ring-2 ring-background ${stale ? "bg-neutral-400" : "bg-line"} ${
                  train.trainNo === chosenTrainNo ? "outline-2 outline-offset-2 outline-foreground" : ""
                }`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
