"use client";

import { ChevronDown, Clock, Pencil } from "lucide-react";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { LineBadge } from "@/components/LineBadge";
import { LineMap } from "@/components/LineMap";
import { StatePictogram, type PictogramKind } from "@/components/StatePictogram";
import { TrainProgress } from "@/components/scene/TrainProgress";
import { useArrivals } from "@/hooks/useArrivals";
import { useNow } from "@/hooks/useNow";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useTimetable } from "@/hooks/useTimetable";
import {
  estimateDelay,
  formatClock,
  formatDuration,
  mergeTrains,
  planDeparture,
  type DepartureState,
  type PlanMemory,
  type Train,
} from "@/lib/departure";
import { getLine, lineTone } from "@/lib/lines";
import { pickSceneTrain, trainMotion } from "@/lib/scene/motion";
import { useSettings } from "@/lib/store/settings";

const SceneSlot = () => <div className="size-full bg-neutral-700" />;

// three.js는 메인 화면에서만, 클라이언트에서만 로드
const TrackScene = dynamic(() => import("@/components/scene/TrackScene").then((m) => m.TrackScene), {
  ssr: false,
  loading: SceneSlot,
});

const STALE_AFTER_MS = 60_000;
const LIST_SIZE = 6;

// 색은 급할 때(출발 블루·뛰기 오렌지)만. 나머지는 무채색
type Tone = "neutral" | "go" | "run" | "muted";
const TONE: Record<Tone, { tile: string; message: string; big: string }> = {
  neutral: { tile: "bg-muted text-neutral-800", message: "text-foreground", big: "text-foreground" },
  go: { tile: "bg-go-soft text-go", message: "text-go", big: "text-foreground" },
  run: { tile: "bg-run-soft text-run", message: "text-run", big: "text-run" },
  muted: { tile: "bg-muted text-disabled", message: "text-muted-foreground", big: "text-disabled" },
};

const STATE_UI: Record<DepartureState, { message: string; tone: Tone; sub: string }> = {
  relax: { message: "아직 여유 있어요", tone: "neutral", sub: "후 출발하세요" },
  pack: { message: "슬슬 준비하세요", tone: "neutral", sub: "후 출발하세요" },
  go: { message: "지금 출발하세요", tone: "go", sub: "안에 나서요" },
  run: { message: "뛰면 탈 수 있어요", tone: "run", sub: "출발 시각이 지났어요" },
  missed: { message: "놓쳤어요. 다음 열차를 볼게요", tone: "muted", sub: "" },
};

function timeLabel(ms: number) {
  return new Date(ms).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function arrivalText(train: Train, now: number) {
  const left = (train.arrivalAt - now) / 1000;
  if (left <= 0) return "도착";
  return train.isEstimated ? `약 ${Math.max(1, Math.round(left / 60))}분` : `${formatDuration(left)} 후 도착`;
}

function Tags({ train, extra }: { train: Train; extra?: { text: string; className: string } }) {
  return (
    <>
      {extra && <span className={`rounded-sm px-[7px] py-[3px] text-xs font-bold ${extra.className}`}>{extra.text}</span>}
      {train.isExpress && <span className="rounded-sm bg-background px-[7px] py-[3px] text-xs font-bold text-neutral-800">급행</span>}
      {train.isLastTrain && <span className="rounded-sm bg-run-soft px-[7px] py-[3px] text-xs font-bold text-run">막차</span>}
    </>
  );
}

export function MainScreen({ station, subwayId, direction }: { station: string; subwayId: string; direction: string }) {
  const { leadMinutes, editSetup } = useSettings();
  const now = useNow();
  const { data, isPending, isError, fetchStatus, dataUpdatedAt } = useArrivals(station);
  const timetable = useTimetable(station, subwayId, direction, now);
  const reducedMotion = usePrefersReducedMotion();
  const line = getLine(subwayId);
  const tone = lineTone(line.color); // 3D 머티리얼에도 CSS 변수(--line-color)와 같은 값
  // expanded = 펼친 레이아웃(화면 한 장 고정 해제), open = 목록이 열려 보이는 상태. 접을 땐 목록이 다 닫힌 뒤 레이아웃을 되돌린다
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState(false);
  // 3D 화면 높이는 화면 한 장에 맞춰 정해진 높이를 목록을 펼쳐도 그대로 유지한다 (펼칠 때 그 높이로 고정)
  const sceneRef = useRef<HTMLElement>(null);
  const [sceneHeight, setSceneHeight] = useState<number>();
  const toggleExpanded = () => {
    if (!open) {
      setSceneHeight(sceneRef.current?.offsetHeight);
      setExpanded(true);
    } else if (reducedMotion) setExpanded(false); // transition이 없으면 transitionend도 오지 않는다
    setOpen(!open);
  };

  const arrivals = (data?.arrivals ?? []).filter(
    (a) => a.subwayId === subwayId && a.direction === direction && a.arrivalAt + 30_000 >= now,
  );
  // 탈 열차는 시간표에서 고르고 실시간은 지연 보정에만 쓴다. 시간표가 없는 노선은 실시간만
  const scheduled = timetable.data ?? [];
  const delay = estimateDelay(scheduled, arrivals);
  const trains = mergeTrains(scheduled, arrivals, delay.seconds);
  const leadSeconds = leadMinutes * 60;

  // 보던 열차를 기억해 run/missed를 이어서 보여 준다 (렌더 중 상태 갱신 패턴: 바뀔 때만 다시 렌더)
  const [memory, setMemory] = useState<PlanMemory>({});
  const { departure, memory: nextMemory } = planDeparture(trains, now, leadSeconds, memory);
  if (nextMemory.trainNo !== memory.trainNo || nextMemory.missedAt !== memory.missedAt) setMemory(nextMemory);

  const sceneTrain = pickSceneTrain(arrivals, now);
  const motion = sceneTrain ? trainMotion((sceneTrain.arrivalAt - now) / 1000) : undefined;
  // 오프라인(paused)·오류·오래된 데이터 → 흐리게 + "실시간 아님"
  const stale = !!data && (isError || fetchStatus === "paused" || now - dataUpdatedAt > STALE_AFTER_MS);
  const hasTimetable = !!timetable.data;
  const loading = isPending || timetable.isLoading;
  const towards = arrivals[0]?.towards;
  const directionLabel = subwayId === "1002" ? `${direction}순환` : direction;

  const chosen = departure.status !== "waiting" ? departure : undefined;
  const ui = chosen ? STATE_UI[chosen.status] : undefined;
  const t = TONE[stale ? "muted" : (ui?.tone ?? "neutral")];
  const kind: PictogramKind = stale ? "offline" : loading ? "waiting" : (chosen?.status ?? "waiting");
  const message = loading
    ? "도착 정보를 불러오는 중…"
    : !data && !hasTimetable
      ? "도착 정보를 가져오지 못했어요"
      : stale && chosen
        ? "연결이 끊겼어요"
        : (ui?.message ?? (hasTimetable ? "오늘은 더 탈 수 있는 열차가 없어요" : "다음 정보를 기다리는 중이에요"));
  const showBig = !!chosen && chosen.status !== "missed" && !loading;
  // 더보기 목록은 추천(또는 놓친) 열차 다음에 오는 열차만, 시간순 (trains는 mergeTrains에서 이미 시간순)
  const after = chosen?.train.arrivalAt ?? now - 30_000;
  const others = trains.filter((x) => x.arrivalAt >= after && x.trainNo !== chosen?.train.trainNo).slice(0, LIST_SIZE - 1);

  return (
    // 다음 열차를 펼치기 전에는 화면 한 장(100dvh - main 위아래 여백)에 맞춘다: 3D 화면이 남는 높이를 채우고 줄어든다
    <section
      className={`flex flex-col gap-5 ${
        expanded ? "" : "h-[calc(100dvh-max(1.5rem,env(safe-area-inset-top))-max(1.5rem,env(safe-area-inset-bottom)))]"
      }`}
    >
      <LineMap
        trains={trains.filter((x) => x.isLive)}
        arrivals={arrivals}
        station={station}
        now={now}
        leadSeconds={leadSeconds}
        chosenTrainNo={chosen?.train.trainNo}
        stale={stale}
      />

      <header className="flex flex-col gap-1 px-1">
        <div className="flex items-center gap-2">
          <h1 className="text-xl leading-tight font-extrabold tracking-[-0.02em]">{station}</h1>
          <LineBadge subwayId={subwayId} />
          {/* 배경 없는 작은 아이콘. 누르는 영역은 패딩으로 40px 유지(-m으로 자리는 안 차지) */}
          <button
            type="button"
            aria-label="역과 방향 바꾸기"
            onClick={editSetup}
            className="-m-3 ml-auto shrink-0 rounded-lg p-3 text-disabled transition-colors hover:text-muted-foreground"
          >
            <Pencil aria-hidden className="size-4" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          {towards ? `${directionLabel}, ${towards}` : directionLabel}, 승강장까지 걸어서 {leadMinutes}분
        </p>
      </header>

      {stale && (
        <p role="status" className="-mt-2 flex items-center gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm font-semibold">
          <Clock aria-hidden className="size-[18px]" />
          실시간이 아니에요. {timeLabel(data.updatedAt)} 기준이에요
        </p>
      )}

      <section className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="flex items-center gap-2.5">
          <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors duration-300 ease-out ${t.tile}`}>
            {/* key: 상태가 바뀔 때마다 걷기 모션(4초)을 처음부터 다시 */}
            <StatePictogram key={kind} kind={kind} className="size-6" />
          </span>
          {/* 라이브 영역은 그대로 두고 안쪽 글자만 바뀔 때마다 새로 떠오르게 (key) */}
          <p aria-live="polite" className={`text-xl font-bold tracking-[-0.02em] transition-colors duration-300 ease-out ${t.message}`}>
            <span key={message} className="block animate-enter">
              {message}
            </span>
          </p>
        </div>

        {!(showBig && chosen && ui) && (
          // 시간을 못 보여줄 때(놓침·남은 열차 없음·불러오는 중)도 같은 높이를 차지해 3D 화면 크기가 바뀌지 않게.
          // 아래 큰 숫자와 같은 글자 크기를 em 기준으로 써서 화면 폭에 따라 함께 줄어든다
          <div aria-hidden className="flex h-[0.95em] animate-enter items-end gap-2.5 pb-[0.08em] text-[min(56px,calc((100vw-174px)*0.36))]">
            <span className="h-[0.79em] w-[2.08em] rounded-lg bg-[#ededed]" />
            <span className="h-[18px] w-[84px] rounded-md bg-[#ededed]" />
          </div>
        )}

        {showBig && chosen && ui && (
          // 한 줄 유지: 가장 긴 조합("−1:59" 56px ≈ 155px + "출발 시각이 지났어요" 132px)이 좁은 화면에 들어가도록
          // 숫자 크기를 (화면 너비 - 여백 32 - 간격 10 - 문구 132) ÷ 2.76(56px일 때 155px)로 줄인다. 330px 이상은 56px 그대로
          // key: 매초 바뀌는 숫자가 아니라 상태(지금 출발·뛰면 탈 수 있어요 등)가 바뀔 때만 다시 떠오른다
          <div key={chosen.status} className="flex animate-enter items-baseline gap-2.5 whitespace-nowrap">
            <span className={`text-[min(56px,calc((100vw-174px)*0.36))] leading-[0.95] font-extrabold tracking-[-0.04em] tabular-nums ${t.big}`}>
              {formatClock(chosen.secondsUntilDepart)}
            </span>
            <span className="text-muted-foreground">{stale ? "후 출발 (추정)" : ui.sub}</span>
          </div>
        )}

        {/* 가장 가까운 열차의 접근·정차·출발. 역명은 3D 노란 역명판에 표시 */}
        <figure
          ref={sceneRef}
          className={`relative shrink-0 overflow-hidden rounded-lg ${expanded ? "" : "min-h-24 flex-1"}`}
          style={expanded ? { height: sceneHeight } : undefined}
        >
          {reducedMotion ? (
            <TrainProgress progress={motion?.progress ?? 0} visible={!!motion && motion.phase !== "hidden" && motion.phase !== "far"} />
          ) : (
            <TrackScene
              color={tone.color}
              stationName={station}
              lineName={line.name}
              trains={arrivals.map((a) => ({ key: a.trainNo, arrivalAt: a.arrivalAt, destination: a.destination || line.name, trainNo: a.trainNo }))}
            />
          )}
        </figure>

        {chosen && (
          <div className="flex flex-col gap-0.5">
            <ul className="flex flex-col gap-0.5 tabular-nums">
              <li className="grid grid-cols-[50px_1fr_auto] items-center gap-2.5 rounded-lg bg-muted px-2 py-3">
                <span className="font-bold">{timeLabel(chosen.train.arrivalAt)}</span>
                <span className="flex flex-wrap items-center gap-2 text-neutral-800">
                  {chosen.train.destination}
                  <Tags train={chosen.train} extra={{ text: chosen.status === "missed" ? "놓친 열차" : "추천", className: "bg-go-soft text-go" }} />
                </span>
                <span className="text-sm text-neutral-800">{arrivalText(chosen.train, now)}</span>
              </li>
            </ul>
            {/* 높이 0fr ↔ 1fr로 열고 닫는다 */}
            <div
              inert={!open}
              onTransitionEnd={(e) => e.target === e.currentTarget && e.propertyName === "grid-template-rows" && !open && setExpanded(false)}
              className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
                open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <ul className="flex min-h-0 flex-col gap-0.5 overflow-hidden tabular-nums">
                {others.map((x) => {
                  const catchable = (x.arrivalAt - now) / 1000 >= leadSeconds;
                  return (
                    <li key={`${x.trainNo}-${x.scheduledAt ?? x.arrivalAt}`} className="grid grid-cols-[50px_1fr_auto] items-center gap-2.5 px-2 py-3">
                      <span className={`font-bold ${catchable ? "" : "text-disabled"}`}>{timeLabel(x.arrivalAt)}</span>
                      <span className={`flex flex-wrap items-center gap-2 ${catchable ? "text-neutral-800" : "text-disabled"}`}>
                        {x.destination}
                        <Tags train={x} />
                      </span>
                      <span className="text-sm text-neutral-800">{catchable ? arrivalText(x, now) : <span className="text-muted-foreground">걸어선 못 타요</span>}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
            {others.length > 0 && (
              <button
                type="button"
                aria-expanded={open}
                onClick={toggleExpanded}
                className="flex h-11 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold text-neutral-700 hover:bg-muted"
              >
                {open ? "접기" : "다음 열차 더보기"}
                <ChevronDown aria-hidden className={`size-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
              </button>
            )}
          </div>
        )}

        {!chosen && !loading && (
          <button
            type="button"
            onClick={editSetup}
            className="h-12 rounded-lg bg-muted font-semibold text-neutral-800 transition-colors hover:bg-neutral-200"
          >
            역·방향 바꾸기
          </button>
        )}

        {!loading && stale && <p className="text-xs leading-relaxed text-muted-foreground">연결되면 바로 새로 고쳐요</p>}
      </section>
    </section>
  );
}
