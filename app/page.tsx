"use client";

import { LineTheme } from "@/components/LineTheme";
import { MainScreen } from "@/components/MainScreen";
import { Onboarding } from "@/components/Onboarding";
import { DirectionStep, LineStep, StationStep, WalkStep } from "@/components/SetupSteps";
import { useSettings, useSettingsHydrated } from "@/lib/store/settings";
import { searchStations } from "@/lib/subway/search";

// 온보딩 → 역 검색 → 노선 → 방향 → 승강장까지 시간 → 메인 (spec 1. 사용자 흐름)
export default function Home() {
  const hydrated = useSettingsHydrated();
  const { station, subwayId, direction, setupDone, onboarded } = useSettings();
  if (!hydrated) return null;

  const lines = station ? (searchStations(station, 1)[0]?.lines ?? []) : [];

  return (
    <main className="mx-auto flex w-full flex-1 max-w-md flex-col gap-6 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <LineTheme subwayId={subwayId} />
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
    </main>
  );
}
