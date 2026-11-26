# Jerom World — 실시간 멀티플레이 메타버스

브라우저에서 접속해 3D 광장을 돌아다니며 다른 접속자와 실시간으로 만나고 채팅하는 웹 메타버스입니다.
상위 레포의 Next.js 사이트와 **완전히 독립된 프로젝트**입니다 (별도 `package.json`, 별도 배포).

## 기능
- 닉네임·아바타 색상 선택 후 입장 (로그인 없음)
- 3D 월드: 광장, 분수, 나무·건물 (충돌 처리)
- 이동: WASD / 방향키, 모바일은 가상 조이스틱
- 실시간 동기화: 다른 접속자의 위치·방향 (초당 15회, 보간 처리)
- 채팅: 채팅창 + 머리 위 말풍선(5초), 입·퇴장 알림
- 접속자 수 / 목록, 자동 재연결
- 라이트/다크 테마 자동 대응

## 구조
| 경로 | 역할 |
|---|---|
| `server/index.js` | Express + Socket.IO 서버. 빌드된 클라이언트(`dist/`)도 함께 서빙 → **서비스 1개로 배포** |
| `src/` | React + React Three Fiber 3D 클라이언트 (Vite) |
| `Dockerfile` | Fly.io / Railway / Render(Docker) / VPS 공용 이미지 |

서버 보호 장치: 좌표 범위 제한, 닉네임 16자·채팅 200자 제한, 채팅 도배 방지(0.7초), 최대 접속자 수(`MAX_PLAYERS`, 기본 50).

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
