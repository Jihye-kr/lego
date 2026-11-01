// 출발 판정 픽토그램 (24px 격자, 선 굵기 2). 움직임은 globals.css의 .pg-* 클래스
// 움직이는 건 급할 때(출발·뛰기)와 상태가 바뀔 때(놓침)만, reduced-motion이면 멈춘다
export type PictogramKind = "relax" | "pack" | "go" | "run" | "missed" | "waiting" | "offline";

type Part = { d: string; className?: string };

const STAND: Part[] = ["M12 8.5v6", "m12 14.5-2 6.5", "m12 14.5 2 6.5", "M12 10.5l-3 3", "M12 10.5l3 3"].map((d) => ({ d }));
const TRAIN = ["M3 5h9a4 4 0 0 1 4 4v7H3z", "M3 11h13", "M6 19l-1.5 2", "M13 19l1.5 2"];
const SPEED_LINES: Part[] = ["M19.5 8h1.5", "M19.5 12h2.5", "M19.5 16h1.5"].map((d) => ({ d }));

const SHAPES: Record<PictogramKind, { head?: [number, number]; ring?: boolean; parts: Part[] }> = {
  relax: { head: [12, 4.5], parts: STAND },
  pack: { head: [12, 4.5], parts: [...STAND, { d: "M14.5 8.5h2A1.5 1.5 0 0 1 18 10v3.5a1.5 1.5 0 0 1-1.5 1.5h-2" }] },
  go: {
    head: [13.5, 4],
    parts: [
      { d: "M13 8.5 11 14" },
      { d: "M11 14 13.5 20.5", className: "pg-wf" },
      { d: "M11 14 8.5 20.5", className: "pg-wb" },
      { d: "M12.5 10 10 13", className: "pg-af" },
      { d: "M12.5 10 15 13", className: "pg-ab" },
    ],
  },
  run: {
    head: [16, 4],
    parts: [
      { d: "M15 8 11.5 13.5" },
      { d: "M11.5 13.5 15 16 14 20", className: "pg-rf" },
      { d: "M11.5 13.5 9 17 5.5 17", className: "pg-rb" },
      { d: "M14 9.5 17 11 19 9.5", className: "pg-raf" },
      { d: "M14 9.5 11 9.5 9 12", className: "pg-rab" },
      { d: "M2 9h3", className: "pg-speed" },
      { d: "M1.5 13h2.5", className: "pg-speed" },
    ],
  },
  missed: { parts: [...TRAIN.map((d) => ({ d, className: "pg-train" })), ...SPEED_LINES] },
  waiting: { parts: [...TRAIN.map((d) => ({ d })), ...SPEED_LINES] },
  offline: { ring: true, parts: [{ d: "M12 7v5l3 2" }] },
};

export function StatePictogram({ kind, className }: { kind: PictogramKind; className?: string }) {
  const { head, ring, parts } = SHAPES[kind];
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`pg ${className ?? ""}`}
    >
      {head && <circle cx={head[0]} cy={head[1]} r={2} />}
      {ring && <circle cx={12} cy={12} r={9} />}
      {parts.map((p) => (
        <path key={p.d + (p.className ?? "")} d={p.d} className={p.className} />
      ))}
    </svg>
  );
}
