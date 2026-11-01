"use client";

// 임시 3D 열차 데모 (삭제 예정): 진입 → 정차·개문 → 발차를 반복. ?line=1003 처럼 노선 바꾸기
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { LineBadge } from "@/components/LineBadge";
import { TrackScene } from "@/components/scene/TrackScene";
import { LINES, getLine } from "@/lib/lines";
import { APPROACH_SECONDS, DWELL_SECONDS, EXIT_SECONDS } from "@/lib/scene/motion";

const LEAD_MS = (APPROACH_SECONDS + 3) * 1000; // 터널 안에서 3초 기다렸다가 진입
const CYCLE_MS = LEAD_MS + (DWELL_SECONDS + EXIT_SECONDS + 3) * 1000;

function Demo() {
  const [line, setLine] = useState(() => new URLSearchParams(window.location.search).get("line") ?? "1002");
  // ?t=-8 → 도착 8초 뒤(정차·문 열림) 장면부터 시작
  const [loop, setLoop] = useState(() => {
    const t = new URLSearchParams(window.location.search).get("t");
    return { n: 0, arrivalAt: Date.now() + (t === null ? LEAD_MS : Number(t) * 1000) };
  });
  useEffect(() => {
    const id = setInterval(() => setLoop((l) => ({ n: l.n + 1, arrivalAt: Date.now() + LEAD_MS })), CYCLE_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-3 p-4">
      <div className="flex flex-wrap gap-2">
        {Object.keys(LINES).map((id) => (
          <button key={id} onClick={() => setLine(id)} className={id === line ? "rounded-full ring-2 ring-foreground" : ""}>
            <LineBadge subwayId={id} />
          </button>
        ))}
      </div>
      {/* ?w=358 → 휴대폰(390px)에서 앱 메인 화면의 씬 폭 */}
      <div className="aspect-[4/3] w-full overflow-hidden rounded-xl" style={{ maxWidth: Number(new URLSearchParams(window.location.search).get("w")) || undefined }}>
        <TrackScene
          color={getLine(line).color}
          stationName={new URLSearchParams(window.location.search).get("station") ?? "시청"}
          lineName={getLine(line).name}
          arrivalAt={loop.arrivalAt}
          trainKey={String(loop.n)}
          destination="성수행"
          trainNo="2148"
        />
      </div>
      <p className="text-sm text-muted-foreground">
        약 {Math.round(CYCLE_MS / 1000)}초마다 반복: 터널 → 진입(감속) → 정차·문 열림 → 문 닫힘 → 발차
      </p>
    </main>
  );
}

export default dynamic(() => Promise.resolve(Demo), { ssr: false });
