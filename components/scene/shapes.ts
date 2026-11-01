import {
  CanvasTexture,
  ExtrudeGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Shape,
  ShapeGeometry,
  type BufferGeometry,
} from "three";

// 둥근 모서리 도형 (three 기본 Shape/Extrude만 사용). 같은 크기는 한 번만 만든다
// ponytail: 캐시는 지우지 않음 — 크기 조합이 코드에 고정된 몇십 개뿐
const cache = new Map<string, BufferGeometry>();

function memo(key: string, make: () => BufferGeometry): BufferGeometry {
  let g = cache.get(key);
  if (!g) cache.set(key, (g = make()));
  return g;
}

function roundedRect(w: number, h: number, r: number): Shape {
  const x = -w / 2;
  const y = -h / 2;
  const s = new Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

// 위에서 보면 둥근 사각형인 기둥 모양 (x 길이, z 폭, y 높이). 원점 = 중심
export function roundedPrism(lx: number, wz: number, h: number, r: number): BufferGeometry {
  return memo(`prism ${lx} ${wz} ${h} ${r}`, () => {
    const g = new ExtrudeGeometry(roundedRect(lx, wz, r), { depth: h, bevelEnabled: false, curveSegments: 6 });
    g.rotateX(-Math.PI / 2); // 돌출 방향 → +y
    g.translate(0, -h / 2, 0);
    return g;
  });
}

// +z를 향한 둥근 사각형 판 (창문·안내판)
export function roundedPlane(w: number, h: number, r: number): BufferGeometry {
  return memo(`plane ${w} ${h} ${r}`, () => new ShapeGeometry(roundedRect(w, h, r), 6));
}

// 줄눈 있는 타일 (코드로 그린 텍스처). repeat은 벽 크기(m) / 타일 크기(m)
export function tileTexture(base: string, grout: string, repeatX: number, repeatY: number): CanvasTexture {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = grout;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = base;
  ctx.fillRect(3, 3, size - 6, size - 6);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// 벽 역명판 (레퍼런스: 진회색 판 + 흰 역명 + 영문 역명 + 오른쪽 노선 원 + 아래 노선 색 띠)
export const SIGN_ASPECT = 3.6;

export function stationSignTexture(name: string, sub: string, lineLabel: string, lineColor: string, lineFg: string): CanvasTexture {
  const h = 256;
  const w = Math.round(h * SIGN_ASPECT);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const font = signFont;

  ctx.fillStyle = "#3A3D42";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = lineColor;
  ctx.fillRect(0, h * 0.9, w, h * 0.1);

  // 오른쪽 노선 원
  const r = h * 0.22;
  const cx = w - r - h * 0.18;
  const cy = h * 0.44;
  ctx.fillStyle = lineColor;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = lineFg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = font(lineLabel.length > 1 ? 56 : 76);
  ctx.fillText(lineLabel, cx, cy + 3);

  // 역명 + 보조 글자. 왼쪽 정렬, 남은 칸에 맞춰 글자 크기를 줄인다
  const left = h * 0.2;
  const room = cx - r - left - h * 0.15;
  ctx.textAlign = "left";
  ctx.fillStyle = "#FFFFFF";
  let px = 116;
  ctx.font = font(px);
  while (ctx.measureText(name).width > room && px > 40) ctx.font = font((px -= 6));
  ctx.fillText(name, left, h * 0.38);
  ctx.fillStyle = "#C9CCD0";
  px = 44;
  ctx.font = font(px, "normal");
  while (ctx.measureText(sub).width > room && px > 20) ctx.font = font((px -= 2), "normal");
  ctx.fillText(sub, left + 4, h * 0.72);

  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export const signFont = (px: number, weight = "bold") =>
  `${weight} ${px}px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif`;

// 글자 텍스처 공용: 캔버스(w×h px)에 draw로 그린다. 배경을 칠하지 않으면 투명
export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// 남은 폭에 맞춰 글자 크기를 줄여 그린다
export function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, px: number, weight = "bold") {
  ctx.font = signFont(px, weight);
  while (ctx.measureText(text).width > maxWidth && px > 10) ctx.font = signFont((px -= 2), weight);
  ctx.fillText(text, x, y);
}
