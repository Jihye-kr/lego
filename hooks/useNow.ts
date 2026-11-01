import { useEffect, useState } from "react";

// 1초마다 갱신되는 현재 시각 (폴링 사이 카운트다운용)
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
