import { useQuery } from "@tanstack/react-query";
import type { Arrival } from "@/types/subway";

export type ArrivalsResponse = { arrivals: Arrival[]; updatedAt: number };

// 20초 폴링. 탭이 비활성이면 refetchIntervalInBackground 기본값(false)으로 멈춘다
export function useArrivals(station?: string) {
  return useQuery({
    queryKey: ["arrivals", station],
    enabled: !!station,
    refetchInterval: 20_000,
    staleTime: 15_000,
    queryFn: async ({ signal }): Promise<ArrivalsResponse> => {
      const res = await fetch(`/api/arrivals?station=${encodeURIComponent(station!)}`, { signal });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "도착 정보를 가져오지 못했습니다");
      return res.json();
    },
  });
}
