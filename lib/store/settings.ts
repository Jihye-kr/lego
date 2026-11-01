import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

const DEFAULT_LEAD_MINUTES = 6;

type Settings = {
  station?: string; // API 역명 (stations.json의 name)
  subwayId?: string;
  direction?: string;
  leadMinutes: number; // 현재 위치 → 승강장 (여유 포함). 출발 시각 = 도착 - leadMinutes
  setupDone: boolean;
  onboarded: boolean; // 온보딩(로고 화면)을 본 적 있음
};

type Actions = {
  setStation: (station: string, lines: string[]) => void;
  setLine: (subwayId?: string) => void;
  setDirection: (direction?: string) => void;
  finishOnboarding: () => void;
  finishSetup: (leadMinutes: number) => void;
  editSetup: () => void;
};

// v0·v2: 도보(walkMinutes) + 여유(bufferMinutes) 분리 저장 → v1·v3: 합친 leadMinutes
export function migrateSettings(persisted: unknown, version: number): Settings {
  const s = persisted as Settings & { walkMinutes?: number; bufferMinutes?: number };
  if (version === 0 || version === 2) {
    const { walkMinutes, bufferMinutes, ...rest } = s;
    const lead = walkMinutes === undefined && bufferMinutes === undefined ? DEFAULT_LEAD_MINUTES : (walkMinutes ?? 0) + (bufferMinutes ?? 0);
    return { ...rest, leadMinutes: lead };
  }
  return s;
}

export const useSettings = create<Settings & Actions>()(
  persist(
    (set) => ({
      leadMinutes: DEFAULT_LEAD_MINUTES,
      setupDone: false,
      onboarded: false,
      // 노선이 하나뿐인 역은 노선 선택 단계를 건너뛴다
      setStation: (station, lines) => set({ station, subwayId: lines.length === 1 ? lines[0] : undefined, direction: undefined }),
      setLine: (subwayId) => set({ subwayId, direction: undefined }),
      setDirection: (direction) => set({ direction }),
      finishOnboarding: () => set({ onboarded: true }),
      finishSetup: (leadMinutes) => set({ leadMinutes, setupDone: true }),
      editSetup: () => set({ station: undefined, subwayId: undefined, direction: undefined, setupDone: false }),
    }),
    { name: "lego-settings", version: 3, migrate: migrateSettings },
  ),
);

// localStorage 복원 전(SSR 포함)에는 false — 하이드레이션 불일치 방지
export function useSettingsHydrated(): boolean {
  return useSyncExternalStore(
    (cb) => useSettings.persist.onFinishHydration(cb),
    () => useSettings.persist.hasHydrated(),
    () => false,
  );
}
