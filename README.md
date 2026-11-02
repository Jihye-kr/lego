<div align="center">

<img src="app/icon.svg" width="96" alt="LeGo 로고" />

# LeGo (레고)

**지금 출발하면 탈 수 있을까?**<br/>
"승강장까지 걸리는 시간"만 입력하면 실시간 지하철 도착 정보로 **언제 집을 나서야 하는지** 알려주는 모바일 웹앱입니다.<br/>
다가오는 열차를 3D 선로 위에서 직접 보여줍니다.

[🚇 데모 바로가기](https://lego-jihye.vercel.app/)

</div>

---

## 데모

<div align="center">
  <img src="docs/demo.gif" width="720" alt="LeGo 소개 영상: 놓친 열차, 앱 설정, 출발 카운트다운, 3D 열차 도착" />
  <p><a href="docs/lego-promo.mp4">🎬 소개 영상 원본 보기 (MP4, 31초)</a></p>
</div>

소개 영상은 실제 앱 화면을 녹화해 [HyperFrames](https://hyperframes.heygen.com)로 편집했습니다. 소스는 [videos/lego-promo/](videos/lego-promo/)에 있습니다.

## 사용법

1. **역 선택** — 역 이름을 검색합니다. 환승역은 노선 배지가 나란히 표시됩니다.
2. **노선·방향 선택** — 상행/하행(2호선은 내선/외선)을 고릅니다.
3. **승강장까지 걸리는 시간 입력** — 지금 있는 곳에서 승강장까지, 여유 시간을 포함해 분 단위로 입력합니다.
4. **메인 화면 확인**
   - 상단: `N분 M초 후 출발하세요` 카운트다운과 상태 문구 (여유 → 짐 싸기 → 지금 출발! → 뛰면 가능 → 놓침)
   - 중앙: 열차가 다가오고, 정차하고, 떠나는 3D 선로 씬
   - 하단: 다음 열차 목록 (행선지, 도착까지 남은 시간, 급행·막차 표시)
<br/>
설정은 기기에 저장되어 다음에 열면 바로 메인 화면이 나옵니다.<br/>
휴대폰에서 데모 링크를 열고 **홈 화면에 추가**하면 앱처럼 쓸 수 있습니다.

## 설치 및 실행

**요구 사항**: Node.js 20 이상, 서울 열린데이터광장 실시간 지하철 인증키

### 1. API 인증키 발급

1. [서울 열린데이터광장](https://data.seoul.go.kr)에 회원가입 후 로그인합니다.
2. [인증키 신청 페이지](https://data.seoul.go.kr/together/mypage/actkeyMain.do)에서 **'실시간 지하철 인증키 신청'** 버튼을 눌러 신청합니다.
3. 발급된 키 하나로 실시간 도착 정보와 열차 시간표를 모두 조회합니다.

### 2. 설치 및 실행

```bash
git clone https://github.com/Jihye-kr/lego.git
cd lego
npm install

# API 키 설정 (서버에서만 사용, 클라이언트에 노출되지 않음)
echo "SEOUL_SUBWAY_API_KEY=발급받은_키" > .env.local

npm run dev        # http://localhost:3000
```

배포할 때는 Vercel 프로젝트의 **Settings → Environment Variables**에 `SEOUL_SUBWAY_API_KEY`를 같은 값으로 추가한 뒤 다시 배포합니다.

| 명령어 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 실행 |
| `npm run build` / `npm start` | 프로덕션 빌드 / 실행 |
| `npm run test` | 단위 테스트 (Vitest) |
| `npm run lint` | 린트 (ESLint) |

## 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 프레임워크 | Next.js 16 (App Router), React 19, TypeScript (strict) |
| 스타일 / UI | Tailwind CSS 4, shadcn/ui (Base UI), lucide-react, Pretendard |
| 상태 관리 | TanStack Query (실시간 폴링), Zustand (persist로 설정 저장) |
| 3D | three.js, @react-three/fiber — 외부 모델 없이 코드로 만든 도형과 캔버스 텍스처로 열차·역사 구현 |
| 데이터 | 서울시 지하철 실시간 도착 API + 시간표 API (서버 프록시, 짧은 캐싱) |
| 테스트 | Vitest (출발 시각 계산·시간 보정 등 순수 함수) |
| 배포 | Vercel, PWA (Web App Manifest) |

### 핵심 로직

- **시간표 + 실시간 보정** — 실시간 API는 방면마다 다음 2대까지만 알려주기 때문에, 탈 열차는 시간표에서 고르고 실시간 데이터로 지연을 보정합니다.
- **데이터 생성 시각 보정** — 응답의 생성 시각(`recptnDt`)과 현재 시각의 차이만큼 열차가 더 진행한 것으로 계산합니다.
- **노선 색 테마** — 선택한 노선의 공식 색이 UI와 3D 열차 도장에 함께 적용되고, 색각이상 사용자를 위해 노선 번호 배지를 항상 함께 표시합니다.

## 폴더 구조

```
app/api/        서울시 API 프록시 (arrivals, timetable)
lib/subway/     API 호출·응답 파싱·시간 보정
lib/departure/  출발 시각 계산
lib/lines/      노선 메타데이터 (이름·공식 색상)
components/scene/  3D 선로 씬 (R3F)
```
