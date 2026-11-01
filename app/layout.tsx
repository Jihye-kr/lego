import type { CSSProperties } from "react";
import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/Providers";
import { APP_COLOR, lineThemeVars } from "@/lib/lines";
// 화면에 쓰인 글자만 나눠 받는 dynamic subset (한글 전체 폰트를 한 번에 받지 않음)
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "LeGo",
  description: "실시간 지하철 도착 정보로 언제 출발할지 알려드려요",
  applicationName: "LeGo",
  appleWebApp: { capable: true, title: "LeGo", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: APP_COLOR,
  viewportFit: "cover", // iOS safe-area
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" style={lineThemeVars(APP_COLOR) as CSSProperties} className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
