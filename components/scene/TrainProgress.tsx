// prefers-reduced-motion 사용자용 2D 대체: 터널 → 승강장 → 퇴장을 막대 위 위치로 표시 (1초마다 갱신, 애니메이션 없음)
export function TrainProgress({ progress, visible }: { progress: number; visible: boolean }) {
  return (
    <div aria-hidden className="flex size-full flex-col justify-center gap-3 bg-muted/40 px-6">
      <div className="relative h-3 rounded-full bg-foreground/10">
        {/* 승강장 구간 */}
        <div className="absolute inset-y-0 left-[35%] w-[30%] rounded-full bg-line/30" />
        {visible && (
          <div
            className="absolute top-1/2 h-6 w-[22%] -translate-x-1/2 -translate-y-1/2 rounded-md border-2 border-background bg-line"
            style={{ left: `${progress * 100}%` }}
          />
        )}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>터널</span>
        <span>승강장</span>
        <span>출발</span>
      </div>
    </div>
  );
}
