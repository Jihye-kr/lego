"use client";

import { ChevronDown, Clock, Pencil } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
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
import { pickSceneTrain, trainMotion, type TrainPhase } from "@/lib/scene/motion";
import { useSettings } from "@/lib/store/settings";
import { timetableLineNum } from "@/lib/subway/timetable";

const SceneSlot = () => <div className="size-full bg-neutral-700" />;

// three.js는 메인 화면에서만, 클라이언트에서만 로드
const TrackScene = dynamic(() => import("@/components/scene/TrackScene").then((m) => m.TrackScene), {
  ssr: false,
  loading: SceneSlot,
});

const STALE_AFTER_MS = 60_000;
const LIST_SIZE = 6;
const BAR_WINDOW_SECONDS = 15 * 60; // 진행 막대: 출발 15분 전부터 차오른다

const PHASE_LABEL: Record<TrainPhase, string> = {
  hidden: "열차가 아직 멀리 있어요",
  far: "열차가 전 역을 출발했어요",
  approaching: "열차가 들어오고 있어요",
  stopped: "열차가 정차 중이에요",
  departing: "열차가 떠나고 있어요",
};

// 색은 급할 때(출발 블루·뛰기 오렌지)만. 나머지는 무채색
type Tone = "neutral" | "go" | "run" | "muted";
const TONE: Record<Tone, { tile: string; message: string; big: string; bar: string; tag: string }> = {
  neutral: { tile: "bg-muted text-neutral-800", message: "text-foreground", big: "text-foreground", bar: "bg-muted-foreground", tag: "bg-background text-neutral-800" },
  go: { tile: "bg-go-soft text-go", message: "text-go", big: "text-foreground", bar: "bg-go-bar", tag: "bg-go-soft text-go" },
  run: { tile: "bg-run-soft text-run", message: "text-run", big: "text-run", bar: "bg-run", tag: "bg-run-soft text-run" },
  muted: { tile: "bg-muted text-disabled", message: "text-muted-foreground", big: "text-disabled", bar: "bg-neutral-400", tag: "bg-background text-neutral-800" },
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

function signed(seconds: number) {
  return `${seconds >= 0 ? "+" : "−"}${formatDuration(Math.abs(seconds))}`;
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
  const [expanded, setExpanded] = useState(false);

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
  const barWidth = chosen
    ? chosen.status === "run"
      ? 1
      : Math.min(1, Math.max(0, 1 - chosen.secondsUntilDepart / BAR_WINDOW_SECONDS))
    : 0;
  const others = trains.filter((x) => x.arrivalAt + 30_000 >= now && x.trainNo !== chosen?.train.trainNo).slice(0, LIST_SIZE - 1);
  const source = hasTimetable
    ? delay.matched > 0
      ? `시간표 + 실시간 보정 (지연 ${signed(delay.seconds)}, 열차 ${delay.matched}대 대조)`
      : "시간표 기준 (실시간과 대조한 열차 없음)"
    : timetableLineNum(subwayId)
      ? "실시간 기준 (시간표를 불러오지 못했어요)"
      : "실시간 기준 (이 노선은 시간표를 제공하지 않아요)";

  return (
    <section className="flex flex-col gap-5">
      <LineMap
        trains={trains.filter((x) => x.isLive)}
        arrivals={arrivals}
        station={station}
        now={now}
        chosenTrainNo={chosen?.train.trainNo}
        stale={stale}
      />

      <header className="flex items-center gap-3 px-1">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.025em]">{station}</h1>
            <LineBadge subwayId={subwayId} />
          </div>
          <p className="text-sm text-muted-foreground">
            {towards ? `${directionLabel}, ${towards}` : directionLabel}, 승강장까지 걸어서 {leadMinutes}분
          </p>
        </div>
        <button
          type="button"
          aria-label="역과 방향 바꾸기"
          onClick={editSetup}
          className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-neutral-800 transition-colors hover:bg-neutral-200"
        >
          <Pencil aria-hidden className="size-5" />
        </button>
      </header>

      {stale && (
        <p role="status" className="-mt-2 flex items-center gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm font-semibold">
          <Clock aria-hidden className="size-[18px]" />
          실시간이 아니에요. {timeLabel(data.updatedAt)} 기준이에요
        </p>
      )}

      <section className="flex flex-col gap-4 rounded-xl bg-background p-5 shadow-raised">
        <div className="flex items-center gap-2.5">
          <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${t.tile}`}>
            {/* key: 상태가 바뀔 때마다 걷기 모션(4초)을 처음부터 다시 */}
            <StatePictogram key={kind} kind={kind} className="size-6" />
          </span>
          <p aria-live="polite" className={`text-xl font-bold tracking-[-0.02em] ${t.message}`}>
            {message}
          </p>
        </div>

        {showBig && chosen && ui && (
          <>
            <div className="flex items-baseline gap-2.5">
              <span className={`text-[76px] leading-[0.95] font-extrabold tracking-[-0.04em] tabular-nums ${t.big}`}>
                {formatClock(chosen.secondsUntilDepart)}
              </span>
              <span className="text-muted-foreground">{stale ? "후 출발 (추정)" : ui.sub}</span>
            </div>
            <div aria-hidden className="-mt-1.5 h-1.5 overflow-hidden rounded-full bg-track">
              <div className={`h-full rounded-full ${t.bar}`} style={{ width: `${barWidth * 100}%` }} />
            </div>
          </>
        )}

        {/* 가장 가까운 열차의 접근·정차·출발. 역명은 3D 노란 역명판에 표시 */}
        <figure className="relative -mx-1.5 aspect-[4/3] overflow-hidden rounded-lg">
          {reducedMotion ? (
            <TrainProgress progress={motion?.progress ?? 0} visible={!!motion && motion.phase !== "hidden" && motion.phase !== "far"} />
          ) : (
            <TrackScene
              color={tone.color}
              stationName={station}
              lineName={line.name}
              arrivalAt={sceneTrain?.arrivalAt}
              trainKey={sceneTrain?.trainNo}
              destination={sceneTrain?.destination}
              trainNo={sceneTrain?.trainNo}
            />
          )}
          <figcaption className="absolute right-2.5 bottom-2.5 rounded-sm bg-neutral-900/80 px-2 py-1 text-xs text-white">
            {sceneTrain && motion ? PHASE_LABEL[motion.phase] : "다가오는 열차가 없어요"}
          </figcaption>
        </figure>

        {chosen && (
          <div className="-mx-2 flex flex-col gap-0.5">
            <ul className="flex flex-col gap-0.5 tabular-nums">
              <li className="grid grid-cols-[50px_1fr_auto] items-center gap-2.5 rounded-lg bg-muted px-2 py-3">
                <span className="font-bold">{timeLabel(chosen.train.arrivalAt)}</span>
                <span className="flex flex-wrap items-center gap-2 text-neutral-800">
                  {chosen.train.destination}
                  <Tags train={chosen.train} extra={{ text: chosen.status === "missed" ? "놓친 열차" : "탈 열차", className: t.tag }} />
                </span>
                <span className="text-sm text-neutral-800">{arrivalText(chosen.train, now)}</span>
              </li>
              {expanded &&
                others.map((x) => {
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
            {others.length > 0 && (
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpanded(!expanded)}
                className="flex h-11 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold text-neutral-700 hover:bg-muted"
              >
                {expanded ? "접기" : "다음 열차 더보기"}
                <ChevronDown aria-hidden className={`size-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
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

        {!loading && <p className="text-xs leading-relaxed text-muted-foreground">{stale ? "연결되면 바로 새로 고쳐요" : source}</p>}
      </section>
    </section>
  );
}
