"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MathUtils, Object3D, type Group, type InstancedMesh, type PerspectiveCamera, type Texture } from "three";
import { lineShortLabel, textColorOn } from "@/lib/lines";
import {
  APPROACH_SECONDS,
  FAR_SECONDS,
  HIDDEN_PROGRESS,
  type SceneTrain,
  isAnimating,
  sceneDoors,
  stepScene,
} from "@/lib/scene/motion";
import { englishStationName } from "@/lib/subway/english";
import { SIGN_ASPECT, roundedPrism, stationSignTexture, tileTexture } from "./shapes";
import { TRAIN_LENGTH, Train } from "./Train";

// 단위: m. x = 선로 방향(터널은 -x), z = 승강장(+z) ↔ 반대편 벽(-z), y = 위
// 화면에서는 레퍼런스 구도(열차 앞면이 왼쪽, 터널이 오른쪽 안쪽)가 되도록 씬 전체를 x로 뒤집어 그린다 (TrackScene)
const TRACK_LENGTH = 80;
const TRACKS_Z = [0, -3.6]; // 0 = 이쪽 승강장 선로
const RAIL_OFFSET = 0.72; // 표준궤 1435mm / 2
const SLEEPER_SPACING = 0.9;
const PLATFORM = { top: 1.1, edgeZ: 1.7, depth: 5 };
const TUNNEL_X = -TRACK_LENGTH / 2; // 역 끝 = 터널 입구
const TUNNEL_LENGTH = 100; // 입구 안쪽으로 이어지는 터널 (전 역에서 오는 열차의 불빛이 보이는 구간)
const TUNNEL = { z0: -5.8, z1: 2.2, top: 5.0 }; // 터널 단면: 선로 두 줄 폭
const RAIL_START = TUNNEL_X - TUNNEL_LENGTH;
const RAIL_LENGTH = TRACK_LENGTH / 2 - RAIL_START;
const RAIL_CX = (RAIL_START + TRACK_LENGTH / 2) / 2;
const CEILING_Y = 6.4;
const FAR_WALL_Z = -6.2;

// 레퍼런스: 밝은 타일 역사 + 회색 자갈·콘크리트 침목 + 갈색 레일 + 어두운 터널
const BG = "#15171B";
const TILE = "#E9EAEC";
const GROUT = "#C6C8CB";
const FLOOR = "#D6D2CA";
const FLOOR_GROUT = "#B7B3AB";
const CEILING_GROUT = "#BDBFC2";
const EDGE = "#E4E1DA"; // 승강장 끝 둥근 마감
const CEILING = "#D7D8DA";
const LAMP = "#FFFFFF";
const PLATFORM_SIDE = "#8E8C87";
const TACTILE = "#F2C200"; // 점자블록 (노란색 고정)
const BALLAST = "#5E5F62";
const SLEEPER = "#A3A29D";
const RAIL = "#6E5444";
const CONCRETE = "#7B7F86";
const TUNNEL_WALL = "#3A3D42";
const TUNNEL_END = "#050607";
const TUNNEL_LAMP = "#FFE7B0";

// 콘크리트 침목: 레일 아래 블록 두 개짜리 (instancing으로 한 번에)
function Sleepers() {
  const ref = useRef<InstancedMesh>(null);
  const perTrack = Math.floor(RAIL_LENGTH / SLEEPER_SPACING);
  const count = perTrack * TRACKS_Z.length * 2;
  useLayoutEffect(() => {
    const o = new Object3D();
    let i = 0;
    for (const z of TRACKS_Z) {
      for (let k = 0; k < perTrack; k++) {
        for (const dz of [-RAIL_OFFSET, RAIL_OFFSET]) {
          o.position.set(RAIL_START + 0.5 + k * SLEEPER_SPACING, 0.08, z + dz);
          o.updateMatrix();
          ref.current!.setMatrixAt(i++, o.matrix);
        }
      }
    }
    ref.current!.instanceMatrix.needsUpdate = true;
  }, [perTrack]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <boxGeometry args={[0.3, 0.16, 0.55]} />
      <meshLambertMaterial color={SLEEPER} />
    </instancedMesh>
  );
}

function Tracks() {
  return (
    <>
      <mesh position={[RAIL_CX, -0.05, -1.8]}>
        <boxGeometry args={[RAIL_LENGTH, 0.1, 8]} />
        <meshLambertMaterial color={BALLAST} />
      </mesh>
      <Sleepers />
      {TRACKS_Z.flatMap((z) =>
        [-RAIL_OFFSET, RAIL_OFFSET].map((dz) => (
          <mesh key={`${z}${dz}`} position={[RAIL_CX, 0.22, z + dz]}>
            <boxGeometry args={[RAIL_LENGTH, 0.13, 0.08]} />
            <meshLambertMaterial color={RAIL} />
          </mesh>
        )),
      )}
    </>
  );
}

const WALL_TILE = 0.6; // m
const SIGN_W = 4;
const SIGN_X = 2.2; // 씬 좌표(뒤집기 전). 화면에서는 정차한 열차 앞면 왼쪽 벽
const SIGN_Y = 3.1;

function Box({ p, s, color, basic, map }: { p: [number, number, number]; s: [number, number, number]; color?: string; basic?: boolean; map?: Texture }) {
  return (
    <mesh position={p}>
      <boxGeometry args={s} />
      {basic ? <meshBasicMaterial color={color} /> : <meshLambertMaterial color={color} map={map} />}
    </mesh>
  );
}

// 코드로 그린 타일 텍스처들 (외부 이미지 없음). 크기가 고정이라 한 번만 만든다
function useStationTextures() {
  const tex = useMemo(
    () => ({
      wall: tileTexture(TILE, GROUT, TRACK_LENGTH / WALL_TILE, CEILING_Y / WALL_TILE),
      floor: tileTexture(FLOOR, FLOOR_GROUT, TRACK_LENGTH / 0.8, PLATFORM.depth / 0.8),
      ceiling: tileTexture(CEILING, CEILING_GROUT, TRACK_LENGTH / 1.2, 14 / 1.2),
      // ExtrudeGeometry UV는 m 단위라 1m당 반복 수
      pillar: tileTexture(TILE, GROUT, 1 / WALL_TILE, 1 / WALL_TILE),
    }),
    [],
  );
  useEffect(() => () => Object.values(tex).forEach((t) => t.dispose()), [tex]);
  return tex;
}

type StationProps = { color: string; stationName: string; lineName: string };

// 역 끝 입구 벽 + 안쪽으로 이어지는 어두운 터널. 벽 등은 안개(fog)를 무시해 멀리서도 점처럼 보인다
function Tunnel({ color }: { color: string }) {
  const cx = TUNNEL_X - TUNNEL_LENGTH / 2;
  const width = TUNNEL.z1 - TUNNEL.z0;
  const station = { z0: FAR_WALL_Z - 0.2, z1: PLATFORM.edgeZ + PLATFORM.depth + 0.4 };
  return (
    <>
      {/* 입구 벽: 터널 구멍 위·양옆 */}
      <Box p={[TUNNEL_X - 0.3, (TUNNEL.top + CEILING_Y) / 2, (station.z0 + station.z1) / 2]} s={[0.5, CEILING_Y - TUNNEL.top, station.z1 - station.z0]} color={CONCRETE} />
      <Box p={[TUNNEL_X - 0.3, TUNNEL.top / 2, (TUNNEL.z1 + station.z1) / 2]} s={[0.5, TUNNEL.top, station.z1 - TUNNEL.z1]} color={CONCRETE} />
      <Box p={[TUNNEL_X - 0.3, TUNNEL.top / 2, (station.z0 + TUNNEL.z0) / 2]} s={[0.5, TUNNEL.top, TUNNEL.z0 - station.z0]} color={CONCRETE} />
      {/* 터널 벽·천장·끝 */}
      <Box p={[cx, TUNNEL.top / 2, TUNNEL.z0 - 0.2]} s={[TUNNEL_LENGTH, TUNNEL.top, 0.4]} color={TUNNEL_WALL} />
      <Box p={[cx, TUNNEL.top / 2, TUNNEL.z1 + 0.2]} s={[TUNNEL_LENGTH, TUNNEL.top, 0.4]} color={TUNNEL_WALL} />
      <Box p={[cx, TUNNEL.top + 0.2, (TUNNEL.z0 + TUNNEL.z1) / 2]} s={[TUNNEL_LENGTH, 0.4, width + 0.8]} color={TUNNEL_WALL} />
      <Box p={[RAIL_START, TUNNEL.top / 2, (TUNNEL.z0 + TUNNEL.z1) / 2]} s={[0.2, TUNNEL.top, width]} color={TUNNEL_END} basic />
      {Array.from({ length: TUNNEL_LENGTH / 10 }, (_, k) =>
        [TUNNEL.z0 + 0.02, TUNNEL.z1 - 0.02].map((z) => (
          <mesh key={`${k}${z}`} position={[TUNNEL_X - 5 - k * 10, 3.4, z]}>
            <boxGeometry args={[0.5, 0.12, 0.04]} />
            <meshBasicMaterial color={TUNNEL_LAMP} fog={false} />
          </mesh>
        )),
      )}
      {/* 입구 근처를 노선 색으로 은은하게 물들이는 조명 */}
      <pointLight position={[TUNNEL_X + 3, 3, -1.8]} color={color} intensity={25} distance={14} />
    </>
  );
}

function Station({ color, stationName, lineName }: StationProps) {
  const tex = useStationTextures();
  const sign = useMemo(
    () => stationSignTexture(stationName, englishStationName(stationName) ?? lineName, lineShortLabel(lineName), color, textColorOn(color)),
    [stationName, lineName, color],
  );
  useEffect(() => () => sign.dispose(), [sign]);

  const platformZ = PLATFORM.edgeZ + PLATFORM.depth / 2;
  const backZ = PLATFORM.edgeZ + PLATFORM.depth + 0.2;
  const ceilingDepth = backZ - FAR_WALL_Z;
  return (
    <>
      {/* 승강장: 타일 바닥 + 둥근 끝 마감 + 노란 점자블록 */}
      <Box p={[0, PLATFORM.top / 2, platformZ]} s={[TRACK_LENGTH, PLATFORM.top, PLATFORM.depth]} color={PLATFORM_SIDE} />
      <Box p={[0, PLATFORM.top + 0.01, platformZ + 0.06]} s={[TRACK_LENGTH, 0.02, PLATFORM.depth - 0.12]} map={tex.floor} />
      <mesh position={[0, PLATFORM.top - 0.05, PLATFORM.edgeZ + 0.07]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.08, 0.08, TRACK_LENGTH, 12]} />
        <meshLambertMaterial color={EDGE} />
      </mesh>
      <Box p={[0, PLATFORM.top + 0.025, PLATFORM.edgeZ + 0.55]} s={[TRACK_LENGTH, 0.01, 0.4]} color={TACTILE} />
      {/* 승강장 위 둥근 기둥 */}
      {[-26, -16, -6, 14].map((x) => (
        <mesh key={x} geometry={roundedPrism(0.8, 0.8, CEILING_Y, 0.15)} position={[x, CEILING_Y / 2, PLATFORM.edgeZ + 3.9]}>
          <meshLambertMaterial map={tex.pillar} />
        </mesh>
      ))}
      {/* 승강장 뒤 벽 + 반대편 벽 (타일) */}
      <Box p={[0, CEILING_Y / 2, backZ]} s={[TRACK_LENGTH, CEILING_Y, 0.4]} map={tex.wall} />
      <Box p={[0, CEILING_Y / 2, FAR_WALL_Z]} s={[TRACK_LENGTH, CEILING_Y, 0.4]} map={tex.wall} />
      <Box p={[0, 2.0, FAR_WALL_Z + 0.21]} s={[TRACK_LENGTH, 0.25, 0.02]} color={color} />
      {/* 벽 역명판 하나: 정차한 열차 앞면 왼쪽(레퍼런스 구도) — 열차가 서 있어도 보이는 자리.
          씬 전체를 x로 뒤집어 그리므로 글자는 한 번 더 뒤집어 바로 읽히게 한다 */}
      <group position={[SIGN_X, SIGN_Y, FAR_WALL_Z + 0.22]}>
        <Box p={[0, 0, 0]} s={[SIGN_W + 0.06, SIGN_W / SIGN_ASPECT + 0.06, 0.04]} color="#2A2C30" />
        <mesh position={[0, 0, 0.025]} scale={[-1, 1, 1]}>
          <planeGeometry args={[SIGN_W, SIGN_W / SIGN_ASPECT]} />
          <meshLambertMaterial map={sign} />
        </mesh>
      </group>
      {/* 천장 패널 + 형광등 줄 */}
      <Box p={[0, CEILING_Y + 0.15, (backZ + FAR_WALL_Z) / 2]} s={[TRACK_LENGTH, 0.3, ceilingDepth]} map={tex.ceiling} />
      {[4.2, -1.8, -4.6].map((z) => (
        <Box key={z} p={[0, CEILING_Y - 0.03, z]} s={[TRACK_LENGTH - 2, 0.06, 0.18]} color={LAMP} basic />
      ))}
      <Tunnel color={color} />
    </>
  );
}

// progress 0 → 선두가 터널 입구, 0.5 → 승강장 중앙 정차, 1 → 꼬리가 반대편 끝을 지남
const X_RANGE = TRACK_LENGTH / 2 + TRAIN_LENGTH / 2;
const GAP = (TRAIN_LENGTH + 4) / (2 * X_RANGE); // 앞 열차와 최소 4m 떨어져 따라온다 (progress 단위)
const MAX_DT = 0.25; // 오래 쉬었다 깨어난 첫 프레임에 한 번에 많이 움직이지 않게
const toX = (p: number) => (p - 0.5) * 2 * X_RANGE;

// 문짝 group의 원점이 바깥쪽 끝이라 scale.x를 줄이면 문 주머니로 들어간다 (Train.tsx)
function setDoors(train: Group, open: number) {
  for (const leaf of train.userData.doorLeaves as Object3D[]) {
    leaf.scale.x = Math.max(0.001, 1 - open);
    leaf.visible = open < 0.99;
  }
}

export type SceneTrainInfo = { key: string; arrivalAt: number; destination: string; trainNo: string };

// 승강장을 비추는 화면: 이 방면 열차를 모두 그린다. 열차는 뒤로 가지 않고, 정차 후엔 목록에서 빠져도 떠날 때까지 그린다
function Trains({ color, lineLabel, trains }: { color: string; lineLabel: string; trains: SceneTrainInfo[] }) {
  const invalidate = useThree((s) => s.invalidate);
  const live = useRef(trains);
  const info = useRef(new Map<string, SceneTrainInfo>()); // 목록에서 빠져 떠나는 열차의 표시기 글자도 유지
  const scene = useRef<SceneTrain[] | null>(null); // null = 데이터를 아직 못 받음 → 처음 받은 위치에 바로 놓는다
  const groups = useRef(new Map<string, Group>());
  const [shown, setShown] = useState<SceneTrainInfo[]>([]);
  const shownKeys = useRef("");

  // 움직이는 열차가 있거나, 대기 중에 데이터상 진입 시각이 되면 루프를 깨운다
  useEffect(() => {
    live.current = trains;
    for (const t of trains) info.current.set(t.key, t);
    const wake = () => {
      const now = Date.now();
      const near = live.current.some((t) => (t.arrivalAt - now) / 1000 <= APPROACH_SECONDS + FAR_SECONDS);
      if (near || scene.current?.some((s) => isAnimating(s, now))) invalidate();
    };
    wake();
    const id = setInterval(wake, 1000);
    return () => clearInterval(id);
  }, [trains, invalidate]);

  useFrame((_, delta) => {
    const now = Date.now();
    if (scene.current === null && live.current.length === 0) return;
    const next = stepScene(scene.current ?? [], live.current, now, Math.min(delta, MAX_DT), GAP, scene.current === null);
    scene.current = next;
    const visible = next.filter((s) => s.p > HIDDEN_PROGRESS);
    const keys = visible.map((s) => s.key).join();
    if (keys !== shownKeys.current) {
      shownKeys.current = keys;
      setShown(visible.map((s) => info.current.get(s.key)!));
    }
    for (const s of visible) {
      const g = groups.current.get(s.key);
      if (!g) continue; // 다음 렌더에 붙는다
      g.position.x = toX(s.p);
      setDoors(g, sceneDoors(s, now));
      g.visible = true;
    }
    if (next.some((s) => isAnimating(s, now))) invalidate();
  });

  return shown.map((t) => (
    <group
      key={t.key}
      visible={false}
      ref={(g) => {
        if (!g) return void groups.current.delete(t.key);
        // Train의 문짝 group (userData.door) — 매 프레임 찾지 않게 한 번만 모아 열차 group에 달아 둔다
        const leaves: Object3D[] = [];
        g.traverse((o) => o.userData.door && leaves.push(o));
        g.userData.doorLeaves = leaves;
        groups.current.set(t.key, g);
        invalidate();
      }}
    >
      <Train color={color} lineLabel={lineLabel} destination={t.destination} trainNo={t.trainNo} />
    </group>
  ));
}

const FOV = 55; // 4:3 기준 세로 시야각
// 화면이 4:3보다 세로로 길어지면(남는 높이를 채울 때) 가로 시야가 4:3과 같도록 세로 시야를 넓힌다 → 열차가 좌우로 잘리지 않는다
function FitFov() {
  const aspect = useThree((s) => s.size.width / s.size.height);
  const get = useThree((s) => s.get);
  useEffect(() => {
    const { camera: c, invalidate } = get();
    const camera = c as PerspectiveCamera;
    const half = MathUtils.degToRad(FOV / 2);
    camera.fov = aspect >= 4 / 3 ? FOV : MathUtils.radToDeg(2 * Math.atan((Math.tan(half) * (4 / 3)) / aspect));
    camera.updateProjectionMatrix();
    invalidate();
  }, [aspect, get]);
  return null;
}

// trains = 이 방면 실시간 열차 (destination·trainNo는 전면 표시기·차체 번호)
export function TrackScene({ color, stationName, lineName, trains }: StationProps & { trains: SceneTrainInfo[] }) {
  return (
    <Canvas
      // 필요할 때만 렌더. 탭이 비활성이면 requestAnimationFrame이 멈춰 렌더도 멈춘다
      frameloop="demand"
      dpr={[1, 2]}
      // 승강장에 선 사람 눈높이(바닥 + 1.6m)에서 정차 위치의 열차를 비스듬히 바라본다. 터널은 오른쪽 안쪽
      camera={{ position: [-11, PLATFORM.top + 1.6, 5.2], fov: FOV, near: 0.3, far: 200 }}
      onCreated={({ camera }) => camera.lookAt(1.5, 2.0, -0.5)}
      fallback={<p className="p-4 text-sm text-muted-foreground">3D를 표시할 수 없어요</p>}
      aria-hidden
    >
      <FitFov />
      <color attach="background" args={[BG]} />
      {/* 안개: 터널 깊숙한 곳은 어둠 속에 묻히고 열차 전조등·터널 등만 보인다 */}
      <fog attach="fog" args={[BG, 30, 80]} />
      <ambientLight intensity={0.9} />
      <hemisphereLight args={["#FFFFFF", "#6B6B6B", 1.1]} />
      <directionalLight position={[-4, 12, 8]} intensity={1.3} />
      {/* x 뒤집기: 열차가 오른쪽 안 터널에서 나와 왼쪽 앞으로 들어온다 (three가 음수 스케일의 면 방향을 보정) */}
      <group scale={[-1, 1, 1]}>
        <Tracks />
        <Station color={color} stationName={stationName} lineName={lineName} />
        <Trains color={color} lineLabel={lineShortLabel(lineName)} trains={trains} />
      </group>
    </Canvas>
  );
}
