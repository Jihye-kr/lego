// LeGo 로고: 파란 타일 + 흰 '출발' 걷는 사람. 선 모양은 scripts/make-icons.sh(앱 아이콘)와 같게 유지
export function AppLogo({ className }: { className?: string }) {
  return (
    <span aria-hidden className={`inline-flex items-center justify-center rounded-[23%] bg-go ${className ?? ""}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" className="size-[66%]">
        <circle cx={13.5} cy={4} r={2} fill="#FFFFFF" />
        <path d="M13 8.5 11 14" />
        <path d="M11 14 14.5 16.5 14 21" />
        <path d="M11 14 8.5 20.5" />
        <path d="M12.5 10 9.5 12.5" />
        <path d="M12.5 10 15.5 12.5" />
      </svg>
    </span>
  );
}
