import names from "./station-names-en.json";
import { infoStationName } from "./timetable";

// 역명판 영문 표기. 데이터: scripts/fetch-station-names-en.mjs (서울시 지하철역 정보, 2026-10-31)
const EN: Record<string, string> = names;

// 실시간 API 역명과 역 정보 API 역명이 다른 역
const ALIASES: Record<string, string> = {
  "4.19 민주묘지": "4·19민주묘지",
  뚝섬유원지: "자양",
  세종왕릉: "세종대왕릉",
  지제: "평택지제",
};

export function englishStationName(name: string): string | undefined {
  return EN[ALIASES[name] ?? infoStationName(name)];
}
