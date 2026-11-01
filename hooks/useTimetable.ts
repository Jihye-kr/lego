import { useQuery } from "@tanstack/react-query";
import { serviceDay, timetableLineNum, type ScheduledTrain } from "@/lib/subway/timetable";

// 하루치 시간표. 운행일(새벽 3시 기준)이 바뀌면 queryKey가 바뀌어 새로 받는다.
// 시간표가 없는 노선·역(404)이면 data가 null → 실시간만으로 동작
export function useTimetable(station: string, subwayId: string, direction: string, now: number) {
  const { date } = serviceDay(now);
  return useQuery({
    queryKey: ["timetable", station, subwayId, direction, date],
    enabled: !!timetableLineNum(subwayId),
    staleTime: Infinity,
    retry: 1,
    queryFn: async ({ signal }): Promise<ScheduledTrain[] | null> => {
      const q = new URLSearchParams({ station, subwayId, direction, date }); // date: CDN 캐시를 운행일별로 나눈다
      const res = await fetch(`/api/timetable?${q}`, { signal });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("시간표를 가져오지 못했습니다");
      return (await res.json()).trains;
    },
  });
}
