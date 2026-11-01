import type { Arrival } from "../../types/subway";

export type DirectionOption = { direction: string; towards: string };

// 현재 운행 중인 열차에서 방향을 뽑는다. 열차가 없으면(심야 등) 기본 방향만 제공
export function directionOptions(arrivals: Arrival[], subwayId: string): DirectionOption[] {
  const found = new Map<string, string>();
  for (const a of arrivals) {
    if (a.subwayId === subwayId && !found.has(a.direction)) found.set(a.direction, a.towards);
  }
  if (found.size === 0) {
    return (subwayId === "1002" ? ["내선", "외선"] : ["상행", "하행"]).map((direction) => ({ direction, towards: "" }));
  }
  const order = ["상행", "하행", "내선", "외선"];
  return [...found]
    .map(([direction, towards]) => ({ direction, towards }))
    .sort((a, b) => order.indexOf(a.direction) - order.indexOf(b.direction));
}
