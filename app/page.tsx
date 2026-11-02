"use client";

import { LineTheme } from "@/components/LineTheme";
import { MainScreen } from "@/components/MainScreen";
import { Onboarding } from "@/components/Onboarding";
import { DirectionStep, LineStep, StationStep, WalkStep } from "@/components/SetupSteps";
import { useState, type CSSProperties } from "react";
import { useSettings, useSettingsHydrated } from "@/lib/store/settings";
import { searchStations } from "@/lib/subway/search";

// 온보딩 → 역 검색 → 노선 → 방향 → 승강장까지 시간 → 메인 (spec 1. 사용자 흐름)
export default function Home() {
  const hydrated = useSettingsHydrated();
  const { station, subwayId, direction, setupDone, onboarded } = useSettings();
  // 화면 순서: 0 온보딩, 1~4 설정 단계, 5 메인. 앞으로 가면 오른쪽에서, 뒤로 가면 왼쪽에서 들어온다
  const screen = !onboarded && !station ? 0 : !station ? 1 : !subwayId ? 2 : !direction ? 3 : !setupDone ? 4 : 5;
  const [prev, setPrev] = useState(screen);
  const [forward, setForward] = useState(true);
  if (screen !== prev) {
    setForward(screen > prev);
    setPrev(screen);
  }
  if (!hydrated) return null;

  const lines = station ? (searchStations(station, 1)[0]?.lines ?? []) : [];

  return (
    <main className="mx-auto flex w-full flex-1 max-w-md flex-col gap-6 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <LineTheme subwayId={subwayId} />
      <div
        key={screen}
        className="flex flex-1 animate-enter flex-col gap-6"
        style={{ "--enter-x": forward ? "24px" : "-24px", "--enter-y": "0" } as CSSProperties}
      >
        {!onboarded && !station ? (
          <Onboarding />
        ) : !station ? (
          <StationStep />
        ) : !subwayId ? (
          <LineStep station={station} lines={lines} />
        ) : !direction ? (
          <DirectionStep station={station} subwayId={subwayId} hasLineStep={lines.length > 1} />
        ) : !setupDone ? (
          <WalkStep subwayId={subwayId} />
        ) : (
          <MainScreen station={station} subwayId={subwayId} direction={direction} />
        )}
      </div>
    </main>
  );
}
