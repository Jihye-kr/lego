"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Object3D, type Group, type InstancedMesh, type Texture } from "three";
import { lineShortLabel, textColorOn } from "@/lib/lines";
import { doorOpenness, trainMotion } from "@/lib/scene/motion";
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
const SMOOTHING = 6; // 목표 위치를 따라가는 속도 (1/s). 폴링으로 도착 시각이 바뀌어도 순간이동하지 않게

function target(arrivalAt: number | undefined, now: number) {
  if (arrivalAt === undefined) return { visible: false, moving: false, x: -X_RANGE, doors: 0 };
  const t = (arrivalAt - now) / 1000;
  const { phase, progress } = trainMotion(t);
  const doors = doorOpenness(t);
  return {
    visible: phase !== "hidden",
    moving: phase === "approaching" || phase === "departing" || (doors > 0 && doors < 1),
    x: (progress - 0.5) * 2 * X_RANGE,
    doors,
  };
}

// 문짝 group의 원점이 바깥쪽 끝이라 scale.x를 줄이면 문 주머니로 들어간다 (Train.tsx)
function setDoors(train: Group, open: number) {
  for (const leaf of train.userData.doorLeaves as Object3D[]) {
    leaf.scale.x = Math.max(0.001, 1 - open);
    leaf.visible = open < 0.99;
  }
}

type Shown = { x: number; visible: boolean; doors: number; key?: string };

// 움직이거나 목표에 덜 도달했을 때만 다음 프레임이 필요 → 정차(문 다 열림)·대기 중엔 렌더 0
function needsFrame(arrivalAt: number | undefined, shown: Shown) {
  const t = target(arrivalAt, Date.now());
  return t.moving || t.visible !== shown.visible || Math.abs(t.x - shown.x) > 0.01 || Math.abs(t.doors - shown.doors) > 0.01;
}

type TrainLabels = { lineLabel: string; destination: string; trainNo: string };

function MovingTrain({ color, arrivalAt, trainKey, labels }: { color: string; arrivalAt?: number; trainKey?: string; labels: TrainLabels }) {
  const ref = useRef<Group>(null);
  const shown = useRef<Shown>({ x: -X_RANGE, visible: false, doors: 0, key: trainKey });
  const invalidate = useThree((s) => s.invalidate);

  // Train의 문짝 group (userData.door) — 매 프레임 찾지 않게 한 번만 모아 열차 group에 달아 둔다
  useLayoutEffect(() => {
    const leaves: Object3D[] = [];
    ref.current!.traverse((o) => o.userData.door && leaves.push(o));
    ref.current!.userData.doorLeaves = leaves;
  }, []);

  // 데이터가 바뀌거나, 대기 중에 진입/출발 시각이 되면 루프를 깨운다
  useEffect(() => {
    invalidate();
    const id = setInterval(() => needsFrame(arrivalAt, shown.current) && invalidate(), 1000);
    return () => clearInterval(id);
  }, [arrivalAt, trainKey, invalidate]);

  useFrame((_, delta) => {
    const t = target(arrivalAt, Date.now());
    const s = shown.current;
    // 다른 열차로 바뀌거나 화면에 나타나는/사라지는 순간은 보간 없이 바로 이동
    const k = 1 - Math.exp(-delta * SMOOTHING);
    if (!t.visible || !s.visible || s.key !== trainKey) {
      s.x = t.x;
      s.doors = t.doors;
    } else {
      s.x += (t.x - s.x) * k;
      s.doors += (t.doors - s.doors) * k;
    }
    s.visible = t.visible;
    s.key = trainKey;
    ref.current!.position.x = s.x;
    setDoors(ref.current!, s.doors);
    ref.current!.visible = t.visible;
    if (needsFrame(arrivalAt, s)) invalidate();
  });

  return (
    <group ref={ref} visible={false}>
      <Train color={color} {...labels} />
    </group>
  );
}

// destination·trainNo = 씬에 그리는 열차의 행선지("성수행")와 차량번호 (전면 표시기·차체 번호)
type TrackSceneProps = StationProps & { arrivalAt?: number; trainKey?: string; destination?: string; trainNo?: string };

export function TrackScene({ color, stationName, lineName, arrivalAt, trainKey, destination, trainNo }: TrackSceneProps) {
  const labels = { lineLabel: lineShortLabel(lineName), destination: destination || lineName, trainNo: trainNo ?? "" };
  return (
    <Canvas
      // 필요할 때만 렌더. 탭이 비활성이면 requestAnimationFrame이 멈춰 렌더도 멈춘다
      frameloop="demand"
      dpr={[1, 2]}
      // 승강장에 선 사람 눈높이(바닥 + 1.6m)에서 정차 위치의 열차를 비스듬히 바라본다. 터널은 오른쪽 안쪽
      camera={{ position: [-11, PLATFORM.top + 1.6, 5.2], fov: 55, near: 0.3, far: 200 }}
      onCreated={({ camera }) => camera.lookAt(1.5, 2.0, -0.5)}
      fallback={<p className="p-4 text-sm text-muted-foreground">3D를 표시할 수 없어요</p>}
      aria-hidden
    >
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
        <MovingTrain color={color} arrivalAt={arrivalAt} trainKey={trainKey} labels={labels} />
      </group>
    </Canvas>
  );
}
