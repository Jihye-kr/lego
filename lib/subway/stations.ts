// 앱 역명 → API 역명 (API상 이름이 다른 역)
const API_STATION_NAMES: Record<string, string> = {
  서울역: "서울",
  천호: "천호(풍납토성)",
  응암: "응암순환(상선)",
};

export function toApiStationName(name: string): string {
  return API_STATION_NAMES[name] ?? name;
}
