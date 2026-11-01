"use client";

import { useEffect } from "react";
import { APP_COLOR, getLine, lineThemeVars, lineTone } from "@/lib/lines";

// 선택된 노선 색(톤 다운)을 :root CSS 변수와 meta theme-color(상단 상태바)에 주입. 미선택이면 앱 기본 색.
export function LineTheme({ subwayId }: { subwayId?: string }) {
  useEffect(() => {
    const official = subwayId ? getLine(subwayId).color : APP_COLOR;
    for (const [k, v] of Object.entries(lineThemeVars(official))) {
      document.documentElement.style.setProperty(k, v);
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", lineTone(official).color);
  }, [subwayId]);
  return null;
}
