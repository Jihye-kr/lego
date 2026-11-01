// 노선 색은 이 파일에서만 정의한다. (CLAUDE.md 노선 색상 규칙)

export type Line = { id: string; name: string; color: string };

// 노선 미선택 시 앱 기본 색 (manifest theme_color와 같게 유지)
export const APP_COLOR = "#1C1C1E";
export const UNKNOWN_LINE_COLOR = "#8E8E93";

const WHITE = "#FFFFFF";
const BLACK = "#000000";

// subwayId 검증: fixtures/ 의 실제 응답(subwayId, subwayList) — lib/lines/index.test.ts
export const LINES = {
  "1001": { name: "1호선", color: "#0052A4" },
  "1002": { name: "2호선", color: "#00A84D" },
  "1003": { name: "3호선", color: "#EF7C1C" },
  "1004": { name: "4호선", color: "#00A4E3" },
  "1005": { name: "5호선", color: "#996CAC" },
  "1006": { name: "6호선", color: "#CD7C2F" },
  "1007": { name: "7호선", color: "#747F00" },
  "1008": { name: "8호선", color: "#E6186C" },
  "1009": { name: "9호선", color: "#BDB092" },
  "1063": { name: "경의중앙선", color: "#77C4A3" },
  "1075": { name: "수인분당선", color: "#F5A200" },
  // 아래는 subwayId만 응답으로 확인됨 — 색상은 공식 자료로 재확인 필요
  "1065": { name: "공항철도", color: "#0090D2" },
  "1067": { name: "경춘선", color: "#0C8E72" },
  "1077": { name: "신분당선", color: "#D4003B" },
  "1094": { name: "신림선", color: "#6789CA" },
  // 1092·1093은 sample 키 응답(신설동·대곡역 subwayList, 2026-10-31)으로 확인 — 현재 fixtures엔 없음
  "1092": { name: "우이신설선", color: "#B7C452" },
  "1093": { name: "서해선", color: "#8FC31F" },
  // 1032·1081은 실시간도착_역정보(20260902).xlsx로 확인 — 실시간 응답으로는 미확인
  "1032": { name: "GTX-A", color: "#9A6292" },
  "1081": { name: "경강선", color: "#0054A6" },
} as const satisfies Record<string, Omit<Line, "id">>;

export function getLine(subwayId: string): Line {
  const line = (LINES as Record<string, Omit<Line, "id">>)[subwayId];
  return line
    ? { id: subwayId, ...line }
    : { id: subwayId, name: "기타 노선", color: UNKNOWN_LINE_COLOR };
}

// WCAG 2.x 상대 휘도
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 0xff, n & 0xff].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// 배경색 위에서 대비가 더 큰 쪽(흰/검정)을 고른다. 둘 중 큰 값은 항상 4.58:1 이상.
export function textColorOn(bg: string): typeof WHITE | typeof BLACK {
  return contrastRatio(bg, WHITE) >= contrastRatio(bg, BLACK) ? WHITE : BLACK;
}

// a → b 로 t(0~1)만큼 섞은 색
export function mixHex(a: string, b: string, t: number): string {
  const [x, y] = [a, b].map((h) => parseInt(h.slice(1), 16));
  const ch = (n: number, shift: number) => (n >> shift) & 0xff;
  const mixed = [16, 8, 0].map((s) => Math.round(ch(x, s) + (ch(y, s) - ch(x, s)) * t));
  return `#${mixed.map((c) => c.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

// 앱에서 쓰는 노선 색: 공식 색의 채도(HSL)를 낮춰 강조색(출발 블루·뛰기 오렌지)보다 한 발 물러나게 한다
export const LINE_SATURATION = 0.6;
export function mutedColor(hex: string, saturation = LINE_SATURATION): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 0xff, n & 0xff].map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  // 무채색 축(같은 명도의 회색)으로 당기면 HSL 채도만 줄고 색상·명도는 그대로
  const gray = Math.round(l * 255).toString(16).padStart(2, "0");
  return mixHex(hex, `#${gray}${gray}${gray}`, max === min ? 0 : 1 - saturation);
}

// 바탕 위에서 4.5:1이 될 때까지 같은 색을 검정 쪽으로 내린다 (노선 스티커 글자)
export function readableOn(color: string, bg: string): string {
  let c = color;
  for (let t = 0.01; contrastRatio(c, bg) < 4.5 && t <= 1; t += 0.01) c = mixHex(color, BLACK, t);
  return c;
}

export const SURFACE = "#F5F5F5"; // 스티커·카드 바탕 (globals.css --muted와 같은 값)

// 노선 하나에서 쓰는 색 묶음. color는 CSS 변수와 3D 머티리얼에 같은 값으로 들어간다
export function lineTone(official: string) {
  const color = mutedColor(official);
  return { color, fg: textColorOn(color), text: readableOn(color, SURFACE) };
}

// CSS 변수(--line-color, --line-fg, --line-text)
export function lineThemeVars(official: string) {
  const { color, fg, text } = lineTone(official);
  return { "--line-color": color, "--line-fg": fg, "--line-text": text };
}

// 3D 열차 도장 (레퍼런스: 서울 2호선 투톤). 노선 색 하나에서 계산 → 어느 노선이든 같은 디자인
export function trainTones(color: string) {
  return {
    body: mixHex(color, WHITE, 0.3), // 차체 밝은 톤
    band: color, // 진한 띠 = 노선 공식 색
    stripe: mixHex(color, WHITE, 0.8), // 띠 위아래 가는 줄
  };
}

// 원형 노선 배지에 넣을 짧은 글자: "2호선" → "2", "경의중앙선" → "경"
export function lineShortLabel(name: string): string {
  return name.match(/^(\d+)호선$/)?.[1] ?? name.slice(0, 1);
}
