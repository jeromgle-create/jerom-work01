# Jerom World — 실시간 멀티플레이 메타버스

브라우저에서 접속해 3D 광장을 돌아다니며 다른 접속자와 실시간으로 만나고 채팅하는 웹 메타버스입니다.
상위 레포의 Next.js 사이트와 **완전히 독립된 프로젝트**입니다 (별도 `package.json`, 별도 배포).

**운영 주소:** https://jerom-world.onrender.com (Render `jerom-world` 서비스, Singapore, Free 플랜, 배포 브랜치에 push 시 자동 재배포)

## 기능
- 닉네임·아바타 색상 선택 후 입장 (로그인 없음)
- 3D 월드: 일반적인 한국 초등학교 캠퍼스 (가상의 "한빛초등학교", `src/School.tsx`)
  - 4층 본관(교실 창문, 실시간 시계, 학교 이름), 현관·구령대·국기 게양대(교기)·책 읽는 소녀상·화단
  - 흙 운동장(트랙 선, 센터 서클, 축구 골대), 놀이터(미끄럼틀·정글짐·그네·모래밭), 철봉, 강당
  - 정문·담장, 은행나무·벚나무, 벤치 / 다크 모드에선 창문에 불이 켜진 야간 학교
  - 건물·시설물 충돌 처리 (원형 + 사각형 충돌체)
- **실내 탐방** (`src/Interior.tsx`, `src/zones.ts`): 초록 매트를 밟으면 이동
  - 본관 1층: 1학년 1·2·3반, 과학실, 도서관, 현관 로비(신발장, ▲ 2층 계단, ▼ 나가기)
  - 본관 2층: 2학년 1·2·3반, 음악실, 컴퓨터실, 계단 홀(▼ 1층)
  - 강당: 운동장 서쪽 강당 문으로 입장 — 무대, 코트, 농구 골대
  - 실내는 천장 없는 위에서 보기 시점(돌하우스), 카메라 쪽 벽은 낮게 잘라 내부가 보임
  - 왼쪽 위에 현재 위치 표시 (예: 📍 1층 · 과학실), 다른 방의 음성은 30%로 작게 들림
  - 실내 맵은 같은 좌표계의 떨어진 구역(x=100/200/300)에 있어 위치 동기화·근거리 음성이 그대로 동작
- 이동: WASD / 방향키, 모바일은 가상 조이스틱
- 실시간 동기화: 다른 접속자의 위치·방향 (초당 15회, 보간 처리)
- 채팅: 채팅창 + 머리 위 말풍선(5초), 입·퇴장 알림
- **근거리 음성 채팅**: 🎙️ 버튼으로 참여 → 마이크 켜기/끄기, 나가기
  - 거리 3 이내는 최대 음량, 멀어질수록 작아지다 16 이상이면 들리지 않음 + 좌우 방향감
  - 말하는 사람 이름표에 🔊·초록 테두리, 마이크 꺼짐은 🔇
  - 접속자 목록에서 특정 사람만 내 쪽에서 음소거
  - 동시 참여 최대 8명 (`MAX_VOICE`)
- 접속자 수 / 목록, 자동 재연결
- 라이트/다크 테마 자동 대응

## 구조
| 경로 | 역할 |
|---|---|
| `server/index.js` | Express + Socket.IO 서버. 빌드된 클라이언트(`dist/`)도 함께 서빙 → **서비스 1개로 배포** |
| `src/` | React + React Three Fiber 3D 클라이언트 (Vite) |
| `Dockerfile` | Fly.io / Railway / Render(Docker) / VPS 공용 이미지 |

### 음성 구조와 한계
- 오디오는 **접속자끼리 직접(WebRTC P2P)** 전송되고, 서버는 연결 정보(시그널링)만 중계합니다 → 서버 부하·비용 거의 없음.
- 참여자마다 다른 참여자 전원과 연결하므로 8명 안팎이 적정입니다.
- 기본은 공개 STUN 서버만 사용합니다. 회사 방화벽·일부 모바일 망처럼 직접 연결이 막힌 환경에서는 소리가 안 들릴 수 있으며, 이때는 TURN 중계 서버가 필요합니다.
  TURN 서비스를 구한 뒤 Render 환경 변수 `ICE_SERVERS`에 JSON으로 넣으면 코드 수정 없이 적용됩니다:
  ```json
  [{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:<host>:3478","username":"<user>","credential":"<pass>"}]
  ```
- 마이크는 HTTPS 주소에서만 동작합니다 (Render 주소는 HTTPS).

서버 보호 장치: 좌표 범위 제한, 닉네임 16자·채팅 200자 제한, 채팅 도배 방지(0.7초), 최대 접속자 수(`MAX_PLAYERS`, 기본 50), 음성 참여자끼리만 시그널링 중계·메시지 크기 제한.

## 로컬 실행
```bash
cd metaverse
npm install
npm run dev        # http://localhost:5173 (서버 :3001 자동 연동)
```
프로덕션 모드 확인:
```bash
npm run build && npm start   # http://localhost:3001
```
브라우저 탭 2개로 접속하면 실시간 동기화를 바로 확인할 수 있습니다.

## 외부 배포 (택 1)

> Vercel은 WebSocket 서버를 상시 실행할 수 없어 이 프로젝트에는 맞지 않습니다. 아래처럼 **Node 서버를 상시 실행하는 호스팅**을 사용합니다.

### A. Render (권장 · 무료로 시작)
1. https://render.com 가입 → GitHub 연결
2. **New → Web Service** → 이 레포 선택
3. 설정값
   | 항목 | 값 |
   |---|---|
   | Branch | 배포할 브랜치 |
   | Root Directory | `metaverse` |
   | Runtime | Node |
   | Build Command | `npm ci --include=dev && npm run build` |
   | Start Command | `npm start` |
   | Health Check Path | `/healthz` |
   | Environment | `NODE_ENV=production` |
4. 배포 완료 후 `https://<서비스명>.onrender.com` 으로 누구나 접속 가능

무료 플랜은 일정 시간 접속이 없으면 잠들고, 첫 접속 시 깨어나는 데 수십 초가 걸립니다. 상시 운영하려면 유료 플랜이 필요합니다.

### B. Docker 지원 호스팅 (Fly.io, Railway 등)
`metaverse/Dockerfile`을 그대로 사용합니다. 컨테이너는 `PORT`(기본 8080)에서 대기합니다.
```bash
cd metaverse
docker build -t jerom-metaverse .
docker run -p 8080:8080 jerom-metaverse
```

### C. 임시 공유 (내 PC에서 바로)
로컬에서 `npm run build && npm start` 후 Cloudflare Quick Tunnel 등으로 임시 공개 URL을 만들 수 있습니다.
```bash
cloudflared tunnel --url http://localhost:3001
```
PC를 끄면 접속이 끊기므로 테스트 용도로만 적합합니다.

## 별도 레포로 분리하기 (선택)
상위 레포 루트에서:
```bash
git subtree split --prefix=metaverse -b metaverse-only
```
생성된 `metaverse-only` 브랜치를 새 GitHub 레포에 push하면 커밋 이력이 유지된 독립 레포가 됩니다. 이 경우 Render의 Root Directory는 비워 둡니다.
