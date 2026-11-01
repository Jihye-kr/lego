import { useEffect, useMemo } from "react";
import { AdditiveBlending, BoxGeometry, CylinderGeometry, MeshBasicMaterial, MeshLambertMaterial, type BufferGeometry, type Material } from "three";
import { textColorOn, trainTones } from "@/lib/lines";
import { canvasTexture, fitText, roundedPlane, roundedPrism, signFont } from "./shapes";

// 로우폴리 열차. 레퍼런스: 서울 2호선 투톤 전동차 1량(앞뒤 운전실) + 디테일 시트(전면·지붕·하부·측면)
// 외부 모델 없이 코드로 만든 도형만 사용 (box·cylinder + 둥근 모서리 기둥/판). 실제 운영사 로고·사명은 넣지 않는다
// 원점 = 열차 중앙, 선로 중심선 위. +x = 진행 방향(선두), +z = 승강장 쪽(카메라 쪽). 측면 디테일은 +z 면에만 그린다
const CAR_LENGTH = 8;
const CAR_GAP = 0.4;
const CARS = 1; // 레퍼런스 구도는 한 량. 늘리면 앞뒤 차량만 운전실이 붙는다
const W = 2.8;
const BOTTOM = 0.7; // 차체 바닥 (승강장 높이 1.1 근처)
const TOP = 3.6;
const CORNER = 0.3; // 차체 세로 모서리 반경
const SIDE = W / 2;
const FRONT = CAR_LENGTH / 2;
const BAND_Y = BOTTOM + 0.52; // 노선 색 띠 중심

export const TRAIN_LENGTH = CARS * CAR_LENGTH + (CARS - 1) * CAR_GAP;

// 겹쳐 붙이는 면의 층 (차체 표면에서 띄운 거리, m). 같은 깊이에 두 면이 겹치면 z-fighting(빗금)이 생기므로 층마다 1cm 이상 띄운다
const L = { wrap: 0.01, frame: 0.02, inside: 0.03, detail: 0.04, glass: 0.05, leaf: 0.065, leafWindow: 0.085, leafGlass: 0.09 };

const DOOR_XS = [-2.7, 0, 2.7]; // 출입문 중심
const DOOR_W = 1.3;
const DOOR_H = 2.1;
const DOOR_Y = BOTTOM + 0.3 + DOOR_H / 2;
const WINDOW_Y = 2.55;
const WINDOW_H = 0.95;
const WINDOWS: [number, number][] = [[-1.35, 1.2], [1.35, 1.2]]; // [중심, 폭]
const END_X = 3.53; // 차량 끝: 운전실 쪽은 승무원 문, 아니면 좁은 창
const END_W = 0.32;

// 노선과 무관한 무채색 부품
const lambert = (color: string) => new MeshLambertMaterial({ color });
const basic = (color: string) => new MeshBasicMaterial({ color });
const M = {
  frame: lambert("#8A9096"),
  door: lambert("#AEB3B9"),
  cabGlass: lambert("#1B222B"),
  interior: basic("#EFEADD"), // 창문·열린 문 사이로 보이는 밝은 차내
  cabInterior: basic("#C9CCD0"),
  seat: lambert("#E8742A"),
  prioritySeat: lambert("#3BA55C"),
  handrail: lambert("#8E949A"),
  strap: lambert("#F2C200"),
  caution: lambert("#F2C200"), // 문 주의 스티커
  glassPane: new MeshBasicMaterial({ color: "#BFD3E0", transparent: true, opacity: 0.18, depthWrite: false }),
  roof: lambert("#9CA2A8"),
  roofDark: lambert("#6E747B"),
  insulator: lambert("#D9D6CF"),
  under: lambert("#2A2D33"),
  equip: lambert("#4F545B"),
  equipLight: lambert("#6A7077"),
  skirt: lambert("#B4B8BD"),
  dark: lambert("#1A1D22"),
  amber: basic("#FFB000"),
  head: new MeshBasicMaterial({ color: "#FFF8E0", fog: false }), // 켜진 등은 안개를 무시 → 터널 깊숙이서도 불빛이 보인다
  headOff: lambert("#C9C6BC"),
  tail: new MeshBasicMaterial({ color: "#FF2A2A", fog: false }),
  // 전조등 번짐: 터널 깊숙이 있을 때 몇 픽셀짜리 불빛이 보이도록 (가산 혼합, 안개 무시)
  halo: new MeshBasicMaterial({ color: "#FFF1C8", transparent: true, opacity: 0.45, blending: AdditiveBlending, depthWrite: false, fog: false }),
  tailOff: lambert("#7A2A2A"),
};

const BOX = new BoxGeometry(1, 1, 1);
const CYL = new CylinderGeometry(1, 1, 1, 16);
// 지붕: 위쪽 반원통을 x축으로 눕혀 납작하게 (scale = [길이, 높이, 반폭])
const ROOF = new CylinderGeometry(1, 1, 1, 24, 1, false, 0, Math.PI).rotateZ(Math.PI / 2);

type V3 = [number, number, number];

// 씬 전체를 x로 뒤집어 그리므로(TrackScene) 글자 판은 한 번 더 뒤집어 바로 읽히게 한다
const TEXT_FLIP: V3 = [-1, 1, 1];

function B({ m, p, s, r }: { m: Material; p: V3; s: V3; r?: V3 }) {
  return <mesh geometry={BOX} material={m} position={p} scale={s} rotation={r} />;
}

function C({ m, p, s, r }: { m: Material; p: V3; s: V3; r?: V3 }) {
  return <mesh geometry={CYL} material={m} position={p} scale={s} rotation={r} />;
}

function G({ g, m, p, r }: { g: BufferGeometry; m: Material; p: V3; r?: V3 }) {
  return <mesh geometry={g} material={m} position={p} rotation={r} />;
}

// 노선 색 도장 + 글자 텍스처 (행선지·노선 번호·차량번호)
type Paint = { body: Material; band: Material; stripe: Material; dest: Material; lineBox: Material; frontNo: Material; sideNo: Material };

function usePaint(color: string, lineLabel: string, destination: string, trainNo: string): Paint {
  const paint = useMemo(() => {
    const t = trainTones(color);
    const fg = textColorOn(color);
    const tex = (w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, transparent = false) =>
      new MeshBasicMaterial({ map: canvasTexture(w, h, draw), transparent });
    const lineSquare = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.roundRect(x, y, size, size, size * 0.18);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x + size * 0.08, y + size * 0.08, size * 0.84, size * 0.84, size * 0.14);
      ctx.fill();
      ctx.fillStyle = fg;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = signFont(lineLabel.length > 1 ? size * 0.4 : size * 0.62);
      ctx.fillText(lineLabel, x + size / 2, y + size / 2 + size * 0.04);
    };
    return {
      body: lambert(t.body),
      band: lambert(t.band),
      stripe: lambert(t.stripe),
      // 전면 행선지 표시기: 검은 판 + 호박색 행선지 + 오른쪽 노선 번호
      dest: tex(640, 100, (ctx) => {
        ctx.fillStyle = "#0E0F11";
        ctx.fillRect(0, 0, 640, 100);
        ctx.fillStyle = "#FFB000";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        fitText(ctx, destination, 280, 54, 440, 64);
        lineSquare(ctx, 548, 12, 76);
      }),
      lineBox: tex(128, 128, (ctx) => lineSquare(ctx, 4, 4, 120), true),
      // 전면 띠 위 차량번호 (흰 글자)
      frontNo: tex(256, 96, (ctx) => {
        ctx.fillStyle = "#FFFFFF";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        fitText(ctx, trainNo, 128, 52, 240, 76);
      }, true),
      // 측면 차량번호 + SEOUL (노선 색 글자)
      sideNo: tex(256, 160, (ctx) => {
        ctx.fillStyle = t.band;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        fitText(ctx, trainNo, 128, 58, 240, 78);
        fitText(ctx, "SEOUL", 128, 124, 200, 40);
      }, true),
    };
  }, [color, lineLabel, destination, trainNo]);
  useEffect(
    () => () =>
      Object.values(paint).forEach((m) => {
        (m as MeshBasicMaterial).map?.dispose();
        m.dispose();
      }),
    [paint],
  );
  return paint;
}

// 차체를 한 바퀴 감싸는 띠(노선 색) + 위아래 가는 줄 + 지붕 아래 가는 줄
function Wraps({ paint }: { paint: Paint }) {
  const wrap = (h: number) => roundedPrism(CAR_LENGTH + 2 * L.wrap, W + 2 * L.wrap, h, CORNER + L.wrap);
  return (
    <>
      <G g={wrap(0.08)} m={paint.stripe} p={[0, BOTTOM + 0.27, 0]} />
      <G g={wrap(0.4)} m={paint.band} p={[0, BAND_Y, 0]} />
      <G g={wrap(0.08)} m={paint.stripe} p={[0, BOTTOM + 0.8, 0]} />
      <G g={wrap(0.06)} m={paint.band} p={[0, TOP - 0.18, 0]} />
    </>
  );
}

// 측면 창: 회색 테두리 + 밝은 차내 벽 + 좌석 등받이 + 손잡이 봉·손잡이 + 반투명 유리
// (차체가 속이 찬 도형이라 창 면에 층층이 그려 넣는다)
function SideWindow({ x, width }: { x: number; width: number }) {
  const narrow = width < 0.6; // 차량 끝 좁은 창 = 노약자석(초록)
  const straps = Math.max(1, Math.floor(width / 0.28));
  const z = SIDE;
  return (
    <group position={[x, WINDOW_Y, 0]}>
      <G g={roundedPlane(width + 0.1, WINDOW_H + 0.1, 0.1)} m={M.frame} p={[0, 0, z + L.frame]} />
      <G g={roundedPlane(width, WINDOW_H, 0.07)} m={M.interior} p={[0, 0, z + L.inside]} />
      <B m={narrow ? M.prioritySeat : M.seat} p={[0, -0.33, z + L.detail]} s={[width - 0.1, 0.18, 0.004]} />
      <B m={M.handrail} p={[0, 0.33, z + L.detail]} s={[width - 0.06, 0.03, 0.004]} />
      {Array.from({ length: straps }, (_, i) => (
        <B key={i} m={M.strap} p={[-width / 2 + (width / straps) * (i + 0.5), 0.24, z + L.detail]} s={[0.05, 0.12, 0.004]} />
      ))}
      <G g={roundedPlane(width, WINDOW_H, 0.07)} m={M.glassPane} p={[0, 0, z + L.glass]} />
    </group>
  );
}

// 출입문: 테두리 + 밝은 차내(뒤) + 양쪽으로 열리는 문짝 두 장(세로로 긴 창 + 노란 주의 스티커).
// 문짝 group의 원점은 바깥쪽 끝 → TrackScene이 scale.x를 (1 - 열림)으로 줄이면 문 주머니로 들어가는 것처럼 보인다
function Door({ x }: { x: number }) {
  const z = SIDE;
  const leafW = DOOR_W / 2 - 0.02;
  return (
    <group position={[x, DOOR_Y, 0]}>
      <G g={roundedPlane(DOOR_W + 0.12, DOOR_H + 0.08, 0.08)} m={M.frame} p={[0, 0, z + L.frame]} />
      <G g={roundedPlane(DOOR_W, DOOR_H, 0.05)} m={M.interior} p={[0, 0, z + L.inside]} />
      {[-1, 1].map((dir) => {
        const cx = -dir * (DOOR_W / 4 + 0.03);
        return (
          <group key={dir} position={[(dir * DOOR_W) / 2, 0, 0]} userData={{ door: true }}>
            <B m={M.door} p={[(-dir * DOOR_W) / 4, 0, z + L.leaf]} s={[leafW, DOOR_H, 0.03]} />
            <G g={roundedPlane(0.3, 0.82, 0.06)} m={M.interior} p={[cx, 0.35, z + L.leafWindow]} />
            <G g={roundedPlane(0.3, 0.82, 0.06)} m={M.glassPane} p={[cx, 0.35, z + L.leafGlass]} />
            <G g={roundedPlane(0.14, 0.09, 0.015)} m={M.caution} p={[cx, -0.2, z + L.leafWindow]} />
          </group>
        );
      })}
    </group>
  );
}

// 운전실 옆 승무원 문 (좁은 문 + 작은 창)
function CrewDoor({ x }: { x: number }) {
  const z = SIDE;
  return (
    <group position={[x, DOOR_Y, 0]}>
      <G g={roundedPlane(END_W + 0.08, DOOR_H + 0.04, 0.06)} m={M.frame} p={[0, 0, z + L.frame]} />
      <G g={roundedPlane(END_W, DOOR_H - 0.04, 0.04)} m={M.door} p={[0, 0, z + L.inside]} />
      <G g={roundedPlane(END_W - 0.1, 0.6, 0.05)} m={M.cabGlass} p={[0, 0.45, z + L.detail]} />
    </group>
  );
}

// 운전실 전면. dir = +1(선두, 전조등) / -1(후미, 미등). 전면 판은 ±x를 향하도록 y축으로 돌린다
// 배치(정면에서 볼 때): 위 = 행선지 표시기, 왼쪽 = 관통문, 오른쪽 = 큰 앞유리, 띠 = 등 유닛·차량번호, 아래 = 앞치마·연결기
function Cab({ dir, paint }: { dir: 1 | -1; paint: Paint }) {
  const r: V3 = [0, (dir * Math.PI) / 2, 0];
  // 전면에서 d만큼 띄운 위치. side = 화면에서 정면을 볼 때 오른쪽(+)/왼쪽(-) → 차체 z
  // (TrackScene이 씬을 x로 뒤집어 그리므로 뒤집힌 화면 기준으로 맞춘다)
  const at = (y: number, side: number, d: number): V3 => [dir * (FRONT + d), y, dir * side];
  const lit = dir === 1 ? { white: M.head, red: M.tailOff } : { white: M.headOff, red: M.tail };
  return (
    <>
      {/* 행선지 표시기 */}
      <G g={roundedPlane(2.16, 0.38, 0.06)} m={M.frame} p={at(3.25, 0, L.frame)} r={r} />
      <mesh position={at(3.25, 0, L.inside)} rotation={r} scale={TEXT_FLIP}>
        <planeGeometry args={[2.06, 0.32]} />
        <primitive object={paint.dest} attach="material" />
      </mesh>
      {/* 오른쪽 큰 앞유리 + 와이퍼 */}
      <G g={roundedPlane(1.5, 1.12, 0.12)} m={M.frame} p={at(2.5, 0.32, L.frame)} r={r} />
      <G g={roundedPlane(1.4, 1.02, 0.1)} m={M.cabInterior} p={at(2.5, 0.32, L.inside)} r={r} />
      <G g={roundedPlane(1.4, 1.02, 0.1)} m={M.glassPane} p={at(2.5, 0.32, L.glass)} r={r} />
      <B m={M.dark} p={at(2.2, 0.15, L.glass + 0.01)} s={[0.01, 0.55, 0.025]} r={[dir * 0.9, 0, 0]} />
      {/* 왼쪽 관통문: 띠 위에서 시작 (아래 등 유닛과 겹치지 않게) + 작은 창 + 노선 번호 */}
      <G g={roundedPlane(0.62, 1.6, 0.08)} m={M.frame} p={at(2.32, -0.78, L.frame)} r={r} />
      <G g={roundedPlane(0.54, 1.52, 0.06)} m={paint.body} p={at(2.32, -0.78, L.inside)} r={r} />
      <G g={roundedPlane(0.38, 0.62, 0.06)} m={M.cabGlass} p={at(2.6, -0.78, L.detail)} r={r} />
      <mesh position={at(1.9, -0.78, L.detail)} rotation={r} scale={TEXT_FLIP}>
        <planeGeometry args={[0.2, 0.2]} />
        <primitive object={paint.lineBox} attach="material" />
      </mesh>
      {/* 띠 높이: 양쪽 등 유닛(미등 바깥·전조등 안쪽) + 가운데 차량번호 */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <G g={roundedPlane(0.52, 0.24, 0.07)} m={M.dark} p={at(BAND_Y, s * 0.8, L.frame)} r={r} />
          <G g={roundedPlane(0.18, 0.13, 0.04)} m={lit.red} p={at(BAND_Y, s * 0.92, L.inside)} r={r} />
          <G g={roundedPlane(0.18, 0.13, 0.04)} m={lit.white} p={at(BAND_Y, s * 0.69, L.inside)} r={r} />
          {dir === 1 && <G g={roundedPlane(0.7, 0.5, 0.25)} m={M.halo} p={at(BAND_Y, s * 0.69, L.glass + 0.05)} r={r} />}
        </group>
      ))}
      {/* 선두 전조등이 앞 선로와 터널 벽을 비춘다 */}
      {dir === 1 && <pointLight position={[FRONT + 2, BAND_Y, 0]} color="#FFF1C8" intensity={8} distance={18} decay={1.5} />}
      <mesh position={at(BAND_Y - 0.02, 0, L.frame)} rotation={r} scale={TEXT_FLIP}>
        <planeGeometry args={[0.6, 0.22]} />
        <primitive object={paint.frontNo} attach="material" />
      </mesh>
      {/* 앞치마 + 가운데 홈의 연결기·완충판 + 공기 호스 */}
      <G g={roundedPrism(0.3, W - 0.16, 0.6, 0.12)} m={M.skirt} p={[dir * (FRONT + 0.1), 0.42, 0]} />
      <G g={roundedPlane(0.8, 0.36, 0.08)} m={M.dark} p={at(0.4, 0, 0.26)} r={r} />
      <B m={M.equip} p={[dir * (FRONT + 0.38), 0.42, 0]} s={[0.3, 0.16, 0.22]} />
      <B m={M.equipLight} p={[dir * (FRONT + 0.55), 0.42, 0]} s={[0.06, 0.26, 0.38]} />
      <C m={M.dark} p={at(0.32, -0.62, 0.3)} s={[0.03, 0.34, 0.03]} r={[0, 0, dir * 0.35]} />
    </>
  );
}

// 마름모 접이식 팬터그래프 + 절연애자
function Pantograph() {
  const arm = (x0: number, y0: number, x1: number, y1: number, z: number, key: string) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    return <B key={key} m={M.dark} p={[(x0 + x1) / 2, (y0 + y1) / 2, z]} s={[0.04, len, 0.04]} r={[0, 0, -Math.atan2(x1 - x0, y1 - y0)]} />;
  };
  return (
    <group position={[-(CAR_LENGTH / 2 - 1.6), TOP + 0.2, 0]}>
      {[-0.4, 0.4].map((x) => [-0.4, 0.4].map((z) => <C key={`${x}${z}`} m={M.insulator} p={[x, 0.08, z]} s={[0.06, 0.16, 0.06]} />))}
      <B m={M.roofDark} p={[0, 0.19, 0]} s={[1.0, 0.06, 1.0]} />
      {[-0.3, 0.3].flatMap((z) => [
        arm(0, 0.22, -0.45, 0.62, z, `a${z}`),
        arm(-0.45, 0.62, 0, 1.02, z, `b${z}`),
        arm(0, 0.22, 0.45, 0.62, z, `c${z}`),
        arm(0.45, 0.62, 0, 1.02, z, `d${z}`),
      ])}
      <B m={M.dark} p={[0, 1.04, 0]} s={[0.1, 0.04, 1.5]} />
      {[-0.78, 0.78].map((z) => (
        <B key={z} m={M.dark} p={[0, 1.0, z]} s={[0.06, 0.04, 0.12]} r={[z > 0 ? -0.5 : 0.5, 0, 0]} />
      ))}
    </group>
  );
}

// 냉방장치: 둥근 상자 + 위의 팬 그릴 두 개 + 옆 통풍구
function AirConditioner({ x }: { x: number }) {
  return (
    <group position={[x, 0, 0]}>
      <G g={roundedPrism(2.6, 1.7, 0.3, 0.2)} m={M.roof} p={[0, TOP + 0.38, 0]} />
      {[-0.7, 0.7].map((fx) => (
        <group key={fx}>
          <C m={M.dark} p={[fx, TOP + 0.54, 0]} s={[0.36, 0.02, 0.36]} />
          <C m={M.roofDark} p={[fx, TOP + 0.555, 0]} s={[0.22, 0.02, 0.22]} />
          <C m={M.dark} p={[fx, TOP + 0.57, 0]} s={[0.06, 0.02, 0.06]} />
        </group>
      ))}
      <B m={M.dark} p={[0, TOP + 0.38, 0.86]} s={[2.0, 0.14, 0.02]} />
    </group>
  );
}

// 대차: 프레임 + 측면 프레임·스프링 + 바퀴·축상 + 가운데 견인 전동기
function Bogie({ x }: { x: number }) {
  return (
    <group position={[x, 0, 0]}>
      <G g={roundedPrism(2.0, 1.6, 0.18, 0.1)} m={M.dark} p={[0, 0.66, 0]} />
      {[-0.92, 0.92].map((z) => (
        <group key={z}>
          <G g={roundedPrism(2.3, 0.12, 0.26, 0.06)} m={M.under} p={[0, 0.55, z]} />
          {[-0.35, 0.35].map((sx) => (
            <C key={sx} m={M.equipLight} p={[sx, 0.74, z]} s={[0.08, 0.16, 0.08]} />
          ))}
          {[-0.75, 0.75].map((wx) => (
            <B key={wx} m={M.equip} p={[wx, 0.5, z + Math.sign(z) * 0.05]} s={[0.22, 0.18, 0.1]} />
          ))}
        </group>
      ))}
      {[-0.75, 0.75].flatMap((wx) =>
        [-0.72, 0.72].map((wz) => (
          <group key={`${wx}${wz}`}>
            <C m={M.under} p={[wx, 0.5, wz]} s={[0.3, 0.1, 0.3]} r={[Math.PI / 2, 0, 0]} />
            <C m={M.equipLight} p={[wx, 0.5, wz + Math.sign(wz) * 0.055]} s={[0.12, 0.02, 0.12]} r={[Math.PI / 2, 0, 0]} />
          </group>
        )),
      )}
      <C m={M.equip} p={[0, 0.5, 0]} s={[0.2, 1.0, 0.2]} r={[Math.PI / 2, 0, 0]} />
    </group>
  );
}

// 바닥 아래 전기 기기함들 + 공기탱크 (승강장 쪽에서 보이는 크기·간격을 조금씩 다르게)
const CABINETS: [number, number, number][] = [[-1.75, 0.55, 0.4], [-1.05, 0.7, 0.48], [-0.3, 0.6, 0.44], [0.45, 0.75, 0.5], [1.25, 0.6, 0.42], [1.85, 0.4, 0.36]]; // [x, 길이, 높이]

function Underfloor() {
  return (
    <>
      <B m={M.under} p={[0, 0.52, 0]} s={[CAR_LENGTH - 4.8, 0.36, W - 0.6]} />
      {CABINETS.map(([x, len, h], i) => (
        <G key={x} g={roundedPrism(len, 0.3, h, 0.04)} m={i % 2 ? M.equipLight : M.equip} p={[x, BOTTOM - h / 2, SIDE - 0.38]} />
      ))}
      <C m={M.equipLight} p={[0, 0.48, -0.55]} s={[0.15, 1.6, 0.15]} r={[0, 0, Math.PI / 2]} />
    </>
  );
}

type TrainInfo = { lineLabel: string; destination: string; trainNo: string };

function Car({ x, paint, cabs, pantograph, trainNo }: { x: number; paint: Paint; cabs: (1 | -1)[]; pantograph: boolean; trainNo: string }) {
  const z = SIDE;
  return (
    <group position={[x, 0, 0]}>
      <G g={roundedPrism(CAR_LENGTH, W, TOP - BOTTOM, CORNER)} m={paint.body} p={[0, (BOTTOM + TOP) / 2, 0]} />
      <Wraps paint={paint} />
      {WINDOWS.map(([wx, ww]) => (
        <SideWindow key={wx} x={wx} width={ww} />
      ))}
      {[-1, 1].map((end) =>
        cabs.includes(end as 1 | -1) ? <CrewDoor key={end} x={end * END_X} /> : <SideWindow key={end} x={end * END_X} width={END_W} />,
      )}
      {DOOR_XS.map((dx) => (
        <Door key={dx} x={dx} />
      ))}
      {/* 창 위 행선지 LED + 창 아래 차량번호 */}
      <G g={roundedPlane(0.9, 0.16, 0.03)} m={M.dark} p={[-1.35, 3.2, z + L.frame]} />
      <B m={M.amber} p={[-1.35, 3.2, z + L.inside]} s={[0.7, 0.05, 0.004]} />
      {trainNo && (
        <mesh position={[1.35, 1.8, z + L.frame]} scale={TEXT_FLIP}>
          <planeGeometry args={[0.55, 0.34]} />
          <primitive object={paint.sideNo} attach="material" />
        </mesh>
      )}
      {/* 둥근 지붕 + 지붕 위 통로 + 냉방장치 */}
      <mesh geometry={ROOF} material={M.roof} position={[0, TOP, 0]} scale={[CAR_LENGTH - 0.2, 0.3, SIDE - 0.02]} />
      <B m={M.roofDark} p={[0, TOP + 0.3, 0]} s={[CAR_LENGTH - 1, 0.02, 0.5]} />
      <AirConditioner x={1} />
      {pantograph && <Pantograph />}
      <Underfloor />
      {[-1, 1].map((side) => (
        <Bogie key={side} x={side * (CAR_LENGTH / 2 - 1.3)} />
      ))}
      {cabs.map((dir) => (
        <Cab key={dir} dir={dir} paint={paint} />
      ))}
    </group>
  );
}

// 터널(-x)에서 나와 +x로 달리므로 선두차는 +x를 향한다. 위치는 부모 group이 정한다
export function Train({ color, lineLabel, destination, trainNo }: { color: string } & TrainInfo) {
  const paint = usePaint(color, lineLabel, destination, trainNo);
  const carX = (i: number) => -TRAIN_LENGTH / 2 + CAR_LENGTH / 2 + i * (CAR_LENGTH + CAR_GAP);
  return (
    <>
      {Array.from({ length: CARS }, (_, i) => (
        <Car
          key={i}
          x={carX(i)}
          paint={paint}
          cabs={[...(i === 0 ? [-1 as const] : []), ...(i === CARS - 1 ? [1 as const] : [])]}
          pantograph={i === CARS >> 1}
          trainNo={trainNo}
        />
      ))}
      {/* 차량 사이 연결막 */}
      {Array.from({ length: CARS - 1 }, (_, i) => (
        <B key={i} m={M.dark} p={[carX(i) + (CAR_LENGTH + CAR_GAP) / 2, 2.15, 0]} s={[CAR_GAP + 0.02, 2.3, 2.0]} />
      ))}
    </>
  );
}
