import { getLine, lineTone, readableOn } from "@/lib/lines";

// 노선 스티커: 바탕은 통일하고 글자에만 노선 색. 색만으로 구분하지 않도록 노선명(번호 포함)을 항상 표시
// on="surface": 회색 카드 위에 놓일 때 흰 바탕
export function LineBadge({ subwayId, on = "page" }: { subwayId: string; on?: "page" | "surface" }) {
  const { name, color } = getLine(subwayId);
  const tone = lineTone(color);
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-bold ${on === "surface" ? "bg-background" : "bg-muted"}`}
      style={{ color: on === "surface" ? readableOn(tone.color, "#FFFFFF") : tone.text }}
    >
      {name}
    </span>
  );
}
