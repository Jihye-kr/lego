#!/bin/sh
# LeGo 아이콘 생성: 파란 타일(--go) + 흰 '출발' 걷는 사람 (StatePictogram "logo"와 같은 선)
# 필요: rsvg-convert (brew install librsvg). 실행: sh scripts/make-icons.sh
set -e
cd "$(dirname "$0")/.."
TMP=$(mktemp -d)

# $1 모서리 반경(96 기준, 0이면 꽉 찬 사각), $2 픽토그램 배율(1칸=24)
svg() {
  tx=$(echo "48 - 12 * $2" | bc -l); ty=$(echo "48 - 11.5 * $2" | bc -l)
  cat <<SVG
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
<rect width="96" height="96" rx="$1" fill="#2563EB"/>
<g transform="translate($tx $ty) scale($2)" fill="none" stroke="#FFFFFF" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
<circle cx="13.5" cy="4" r="2" fill="#FFFFFF"/><path d="M13 8.5 11 14"/><path d="M11 14 14.5 16.5 14 21"/><path d="M11 14 8.5 20.5"/><path d="M12.5 10 9.5 12.5"/><path d="M12.5 10 15.5 12.5"/>
</g>
</svg>
SVG
}

svg 22 2.9 > app/icon.svg                 # 브라우저 탭 (SVG 파비콘)
svg 22 2.9 > "$TMP/round.svg"
svg 0 2.9 > "$TMP/square.svg"             # iOS가 모서리를 직접 깎음
svg 0 2.3 > "$TMP/maskable.svg"           # 안드로이드 마스크 안전 영역(가운데 80%) 안에 들어가게

rsvg-convert -w 180 -h 180 "$TMP/square.svg" -o app/apple-icon.png
rsvg-convert -w 192 -h 192 "$TMP/round.svg" -o public/icons/icon-192.png
rsvg-convert -w 512 -h 512 "$TMP/round.svg" -o public/icons/icon-512.png
rsvg-convert -w 512 -h 512 "$TMP/maskable.svg" -o public/icons/icon-maskable-512.png
for s in 16 32 48; do rsvg-convert -w $s -h $s "$TMP/round.svg" -o "$TMP/$s.png"; done

# favicon.ico: PNG 3장을 그대로 담는 ICO
python3 - "$TMP" <<'PY'
import struct, sys
d = sys.argv[1]; sizes = [16, 32, 48]
pngs = [open(f"{d}/{s}.png", "rb").read() for s in sizes]
out = struct.pack("<HHH", 0, 1, len(pngs)); off = 6 + 16 * len(pngs)
for s, p in zip(sizes, pngs):
    out += struct.pack("<BBBBHHII", s, s, 0, 0, 1, 32, len(p), off); off += len(p)
open("app/favicon.ico", "wb").write(out + b"".join(pngs))
PY
rm -r "$TMP"
echo "icons ok"
