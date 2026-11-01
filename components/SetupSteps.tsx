"use client";

import { ArrowDown, ArrowRight, ArrowUp, ChevronLeft, ChevronRight, RotateCcw, RotateCw, Search, TrainFront } from "lucide-react";
import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { LineBadge } from "@/components/LineBadge";
import { useArrivals } from "@/hooks/useArrivals";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { getLine, lineShortLabel, lineTone } from "@/lib/lines";
import { useSettings } from "@/lib/store/settings";
import { directionOptions } from "@/lib/subway/directions";
import { searchStations } from "@/lib/subway/search";
import { timetableLineNum } from "@/lib/subway/timetable";

const STEPS = 4;

// 진행 막대 + "4단계 중 n단계". 뒤로 가기가 없는 1단계도 같은 자리를 비워 막대 길이를 맞춘다
function SetupProgress({ step, onBack }: { step: number; onBack?: () => void }) {
  return (
    <nav aria-label="설정 단계" className="flex flex-col items-center gap-3 pb-2">
      <div className="flex w-full items-center gap-2">
        {onBack ? (
          <button
            type="button"
            aria-label="이전 단계"
            onClick={onBack}
            className="-ml-2.5 flex size-11 shrink-0 items-center justify-center rounded-lg text-neutral-800 hover:bg-muted"
          >
            <ChevronLeft aria-hidden className="size-[22px]" />
          </button>
        ) : (
          <span aria-hidden className="-ml-2.5 size-11 shrink-0" />
        )}
        <div
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={STEPS}
          aria-valuenow={step}
          aria-valuetext={`${STEPS}단계 중 ${step}단계`}
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-border"
        >
          <div className="h-full rounded-full bg-foreground" style={{ width: `${(step / STEPS) * 100}%` }} />
        </div>
        <span aria-hidden className="w-[34px] shrink-0" />
      </div>
      <p aria-hidden className="text-sm text-muted-foreground">
        {STEPS}단계 중 {step}단계
      </p>
    </nav>
  );
}

function StepHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.03em] text-balance">{title}</h1>
      {children}
    </div>
  );
}

// 선택 행: 왼쪽 원형 아이콘, 가운데 두 줄, 오른쪽 › (누르면 다음 단계로)
function SelectRow({ icon, title, titleColor, sub, onClick }: {
  icon: ReactNode; title: string; titleColor?: string; sub?: ReactNode; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[76px] w-full items-center gap-4 rounded-lg border border-border bg-background p-4 text-left transition-colors duration-150 ease-out hover:border-neutral-300 hover:bg-neutral-50 active:bg-muted"
    >
      <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-neutral-800">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="font-bold" style={titleColor ? { color: titleColor } : undefined}>
          {title}
        </span>
        {sub}
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
    </button>
  );
}

export function StationStep() {
  const setStation = useSettings((s) => s.setStation);
  const [query, setQuery] = useState("");
  const results = searchStations(query);

  return (
    <section className="flex flex-col gap-5">
      <SetupProgress step={1} />
      <StepHeading title="어느 역에서 타세요?">
        <p className="text-sm text-muted-foreground">서울시 구간 안에 있는 역만 찾을 수 있어요.</p>
      </StepHeading>
      <div className="flex flex-col gap-2">
        <label htmlFor="station" className="text-sm font-semibold text-neutral-700">
          역 이름
        </label>
        <div className="flex h-14 items-center gap-2.5 rounded-lg bg-background px-4 shadow-[0_0_0_1px_var(--border)] transition-shadow duration-150 focus-within:shadow-[0_0_0_4px_rgb(23_23_23/0.06),0_4px_16px_rgb(0_0_0/0.1)]">
          <Search aria-hidden className="size-5 shrink-0 text-muted-foreground" />
          <input
            id="station"
            autoFocus
            placeholder="예: 강남"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-xl font-semibold outline-none placeholder:font-normal placeholder:text-neutral-500 focus-visible:outline-none"
          />
        </div>
      </div>
      {results.length > 0 && (
        <ul className="flex flex-col gap-3">
          {results.map((s) => (
            <li key={s.name}>
              <SelectRow
                icon={<TrainFront className="size-[22px]" />}
                title={s.name}
                onClick={() => setStation(s.name, s.lines)}
                sub={
                  <span className="flex flex-wrap gap-1.5">
                    {s.lines.map((id) => (
                      <LineBadge key={id} subwayId={id} />
                    ))}
                  </span>
                }
              />
            </li>
          ))}
        </ul>
      )}
      {query.trim() && results.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">검색 결과가 없어요. 역 이름을 다시 확인해 주세요.</p>
      )}
    </section>
  );
}

export function LineStep({ station, lines }: { station: string; lines: string[] }) {
  const { setLine, editSetup } = useSettings();
  return (
    <section className="flex flex-col gap-5">
      <SetupProgress step={2} onBack={editSetup} />
      <StepHeading title={`${station}역, 몇 호선을 타세요?`}>
        <p className="text-sm text-muted-foreground">이 역을 지나는 노선이에요.</p>
      </StepHeading>
      <div className="flex flex-col gap-3">
        {lines.map((id) => {
          const { name, color } = getLine(id);
          const { text } = lineTone(color);
          return (
            <SelectRow
              key={id}
              icon={<span className="text-xl font-extrabold" style={{ color: text }}>{lineShortLabel(name)}</span>}
              title={name}
              titleColor={text}
              onClick={() => setLine(id)}
              sub={
                <span className="text-sm text-muted-foreground">
                  {timetableLineNum(id) ? "시간표와 실시간" : "실시간 정보만 있어요"}
                </span>
              }
            />
          );
        })}
      </div>
    </section>
  );
}

const DIRECTION_ICON: Record<string, ReactNode> = {
  외선: <RotateCw className="size-[22px]" />,
  내선: <RotateCcw className="size-[22px]" />,
  상행: <ArrowUp className="size-[22px]" />,
  하행: <ArrowDown className="size-[22px]" />,
};

export function DirectionStep({ station, subwayId, hasLineStep }: { station: string; subwayId: string; hasLineStep: boolean }) {
  const { setLine, setDirection, editSetup } = useSettings();
  const { data, isPending } = useArrivals(station);
  const options = directionOptions(data?.arrivals ?? [], subwayId);
  const circular = subwayId === "1002";

  return (
    <section className="flex flex-col gap-5">
      <SetupProgress step={3} onBack={hasLineStep ? () => setLine(undefined) : editSetup} />
      <StepHeading title="어느 방향으로 가세요?">
        <p className="flex items-center justify-center gap-2">
          {station}역 <LineBadge subwayId={subwayId} />
        </p>
      </StepHeading>
      {isPending ? (
        <p className="text-center text-sm text-muted-foreground">운행 정보를 불러오는 중…</p>
      ) : (
        <div className="flex flex-col gap-3">
          {options.map((o) => (
            <SelectRow
              key={o.direction}
              icon={DIRECTION_ICON[o.direction]}
              title={circular ? `${o.direction}순환` : o.direction}
              onClick={() => setDirection(o.direction)}
              sub={o.towards ? <span className="text-sm text-muted-foreground">{o.towards}</span> : undefined}
            />
          ))}
        </div>
      )}
      <p className="text-center text-sm text-muted-foreground">지금 이 역으로 오는 열차 정보로 방향을 보여 드려요.</p>
    </section>
  );
}

const ROW = 48; // 휠 한 칸 높이 (px)
const MAX_LEAD = 60;

// 분 휠: 스크롤 스냅 + 위아래 화살표 키. 가운데 칸이 선택값
function MinuteWheel({ value, onChange, labelledBy }: { value: number; onChange: (n: number) => void; labelledBy: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [initial] = useState(value);
  useLayoutEffect(() => {
    ref.current?.scrollTo({ top: initial * ROW });
  }, [initial]);

  const scrollTo = (n: number) =>
    ref.current?.scrollTo({ top: Math.min(MAX_LEAD, Math.max(0, n)) * ROW, behavior: reducedMotion ? "auto" : "smooth" });

  function onKeyDown(e: KeyboardEvent) {
    const step = ({ ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5 } as Record<string, number>)[e.key];
    if (step === undefined) return;
    e.preventDefault();
    scrollTo(value + step);
  }

  return (
    <div className="relative h-60 overflow-hidden rounded-lg border border-border bg-background">
      <div aria-hidden className="absolute inset-x-3 top-[95px] h-12 rounded-lg bg-muted" />
      <div aria-hidden className="pointer-events-none absolute top-[95px] left-1/2 ml-10 flex h-12 items-center text-xl font-semibold text-muted-foreground">
        분
      </div>
      <div
        ref={ref}
        role="listbox"
        tabIndex={0}
        aria-labelledby={labelledBy}
        aria-activedescendant={`lead-${value}`}
        onKeyDown={onKeyDown}
        onScroll={(e) => {
          const n = Math.min(MAX_LEAD, Math.max(0, Math.round(e.currentTarget.scrollTop / ROW)));
          if (n !== value) onChange(n);
        }}
        className="wheel relative h-[238px] snap-y snap-mandatory overflow-y-auto py-[95px] [mask-image:linear-gradient(transparent,#000_35%,#000_65%,transparent)]"
      >
        {Array.from({ length: MAX_LEAD + 1 }, (_, n) => (
          <div
            key={n}
            id={`lead-${n}`}
            role="option"
            aria-selected={n === value}
            onClick={() => scrollTo(n)}
            className={`flex h-12 cursor-pointer snap-center items-center justify-center pr-10 tabular-nums ${
              n === value ? "text-4xl font-extrabold text-foreground" : "text-[22px] text-disabled"
            }`}
          >
            {n}
          </div>
        ))}
      </div>
    </div>
  );
}

export function WalkStep({ subwayId }: { subwayId: string }) {
  const { leadMinutes, direction, station, setDirection, finishSetup } = useSettings();
  const [lead, setLead] = useState(Math.min(MAX_LEAD, leadMinutes));

  function submit(e: FormEvent) {
    e.preventDefault();
    finishSetup(lead);
  }

  return (
    <form onSubmit={submit} className="flex min-h-[calc(100dvh-3rem)] flex-col gap-5">
      <SetupProgress step={4} onBack={() => setDirection(undefined)} />
      <StepHeading title="승강장까지 몇 분 걸려요?">
        <p className="flex items-center justify-center gap-2 text-neutral-700">
          {station}역 <LineBadge subwayId={subwayId} /> {subwayId === "1002" ? `${direction}순환` : direction}
        </p>
      </StepHeading>
      <div className="flex flex-col gap-2.5">
        <p id="lead-label" className="text-center text-sm font-semibold text-neutral-700">
          지금 있는 곳에서 승강장까지
        </p>
        <MinuteWheel value={lead} onChange={setLead} labelledBy="lead-label" />
      </div>
      <button
        type="submit"
        className="mt-auto flex h-14 items-center justify-center gap-2 rounded-lg bg-primary font-semibold text-primary-foreground transition-colors hover:bg-neutral-700 active:bg-neutral-900"
      >
        걸어서 {lead}분, 출발 시간 보기
        <ArrowRight aria-hidden className="size-[18px]" />
      </button>
    </form>
  );
}
