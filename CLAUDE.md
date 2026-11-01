# 프로젝트: LeGo

## 목적
사용자가 "현재 위치 → 승강장까지 걸리는 시간"을 입력하면,
실시간 지하철 도착 정보를 기반으로 **언제 출발해야 열차를 탈 수 있는지** 알려주는 모바일 우선 웹앱.
열차가 선로 위에서 다가오고 멀어지는 모습을 **3D 애니메이션**으로 보여주는 것이 핵심 차별점.

## 기술 스택
- Next.js (App Router), TypeScript (strict), Tailwind CSS, shadcn/ui
- 서버 상태: TanStack Query (폴링) / 클라이언트 상태: Zustand (persist로 설정 저장)
- 3D: three.js + @react-three/fiber + @react-three/drei
- PWA: Web App Manifest + 서비스 워커 (Serwist 등, 설치 전 확인)
- 배포: Vercel. 데모는 URL 공유 + 홈 화면에 추가로 테스트

## 디렉터리 규칙
- app/api/arrivals/route.ts : 서울시 API 프록시 (API 키는 서버에서만 사용)
- lib/subway/ : API 호출, 응답 파싱, 시간 보정 로직 (순수 함수)
- lib/departure/ : 출발 시각 계산 로직 (순수 함수, UI 의존 금지)
- lib/lines/ : 노선 메타데이터 (노선 ID, 이름, 공식 색상) — 색상은 반드시 이 파일 한 곳에서만 정의
- components/scene/ : 3D 씬 관련 컴포넌트 (R3F)
- components/ui/ : shadcn 컴포넌트
- types/ : 공용 타입

## 코드 규칙
- any 금지. API 원본 응답 타입(RawArrival)과 앱 내부 타입(Arrival)을 분리하고 파서에서 변환
- 시간 계산 로직은 반드시 순수 함수 + 단위 테스트(Vitest)
- 3D 컴포넌트는 dynamic import(ssr: false)로 불러오기
- 새 라이브러리 설치 전 반드시 먼저 물어볼 것
- 외부 3D 모델/텍스처 파일을 가져오지 말고, 코드로 만든 도형(box·cylinder, three 기본 Shape/Extrude로 만든 둥근 모서리 도형)과 코드로 그린 캔버스 텍스처(타일·역명판·행선지 글자)로 열차·역사를 직접 만들 것
- 3D 씬은 x축으로 뒤집어 그린다(TrackScene) → 글자 판은 scale x -1로 한 번 더 뒤집고, 겹쳐 붙이는 면은 1cm 이상 띄워 z-fighting을 막을 것

## 노선 색상 규칙
- 노선 색은 lib/lines/에서 가져오고, 컴포넌트에 hex 값을 하드코딩하지 말 것
- 선택된 노선 색을 CSS 변수(--line-color)와 3D 머티리얼 양쪽에 같은 값으로 주입
- 색만으로 노선을 구분하지 말 것: 항상 노선 번호/이름 배지를 함께 표시 (색각이상 사용자 고려)
- 노선 색 배경 위 글자색은 대비를 계산해서 흰색/검정 자동 선택 (예: 9호선처럼 밝은 색)

## PWA 규칙
- manifest의 theme_color는 기본 앱 색, 노선 선택 후에는 meta theme-color를 노선 색으로 동적 변경
- 오프라인일 때는 마지막 데이터를 "업데이트 시각"과 함께 흐리게 표시하고, 실시간이 아님을 명확히 알릴 것
- iOS Safari "홈 화면에 추가"에서 정상 동작하는지 확인 (아이콘, 상태바, safe-area)

## 서울시 지하철 실시간 도착 API 주의사항
- 응답의 recptnDt(데이터 생성 시각)와 현재 시각의 차이만큼 열차가 더 진행했다고 보정해야 함
- 서울시 구간 밖 역은 제공되지 않음
- 일부 역은 API상 역명이 다름 (예: 응암 → 응암순환(상선), 천호 → 천호(풍납토성))
- 일일 호출 제한이 있으므로 서버에서 짧게 캐싱(약 15~30초)
- 실시간은 방면마다 다음 2대(약 4~8분 앞)까지만 온다 → 탈 열차는 시간표(/api/timetable, 1~9호선만 제공)에서 고르고 실시간은 지연 보정에 쓴다
- 시간표 TRAIN_NO는 접두어가 붙고("K479") 실시간 btrainNo는 0으로 채워진다("0479") → normalizeTrainNo로 숫자만 비교
- API 키는 .env.local의 SEOUL_SUBWAY_API_KEY, 절대 클라이언트 번들에 노출 금지

## 작업 방식
- 큰 변경 전에는 계획을 먼저 보여줄 것
- 기능 하나가 끝날 때마다 `npm run build`, `npm run lint`, `npm run test` 통과 확인
- 3D 작업 후에는 모바일 성능(프레임, 탭 비활성 시 렌더 중지)을 함께 점검
