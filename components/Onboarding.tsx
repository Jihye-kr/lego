"use client";

import { AppLogo } from "@/components/AppLogo";
import { useSettings } from "@/lib/store/settings";

// 처음 한 번만: 로고와 한 줄 소개 → 시작하기 → 역 검색
export function Onboarding() {
  const finishOnboarding = useSettings((s) => s.finishOnboarding);

  return (
    <section className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <AppLogo className="size-24" />
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.04em]">
            Le<span className="text-go">Go</span>
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground">
            탈 열차에 맞춰
            <br />
            언제 나가면 되는지 알려 드려요
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-3 pb-2">
        <button
          type="button"
          onClick={finishOnboarding}
          className="flex h-14 items-center justify-center rounded-lg bg-primary font-semibold text-primary-foreground transition-colors hover:bg-neutral-700 active:bg-neutral-900"
        >
          시작하기
        </button>
        <p className="text-center text-xs text-muted-foreground">서울시 실시간 도착 정보를 써요</p>
      </div>
    </section>
  );
}
