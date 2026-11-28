# 한빛초 메타버스(metaverse/)에서 이 키트 쓰기

한빛초 메타버스는 Vite + React Three Fiber 클라이언트와 Express + Socket.IO 서버로 된 별도 앱이다.
**앱 구조·충돌·서버 규칙·테스트·배포는 항상 `hanbit-metaverse` 스킬을 따르고**, 이 키트는 에셋과 상호작용 패턴을 가져다 쓰는 용도로만 쓴다.

## 호환성 (확인한 것)

- `assets/models.js`의 빌더 4개(캐릭터·바리스타·건물·강아지)는 한빛초가 쓰는 **three 0.187**에서도 그대로 만들어지고 애니메이션이 재생된다(삼각형 수는 0.160과 거의 같음, 건물 1,128 → 1,120). 아래 예시 컴포넌트는 metaverse/에서 `tsc --noEmit` 타입 검사를 통과했다.
- `metaverse/tsconfig.json`이 `allowJs: true`라 `models.js`를 TypeScript 프로젝트에 그대로 넣을 수 있다.
- 단위 m·y 위가 같다. 키트 모델의 정면은 +Z, 한빛초 카메라는 북쪽(-Z)을 본다 → 손님 쪽을 보게 하려면 `rotation.y`를 맞춘다.

## 가져다 쓸 수 있는 것

| 키트 | 한빛초에서 쓰는 방법 |
|---|---|
| 강아지(`buildAnimal`, `animal.glb`) | 대공원 동물·반려견. `Walk`/`TailWag`/`Sit` 클립 그대로 사용 |
| 카페 건물(`buildBuilding`, `building.glb`) | 대공원 매점·카페. 문(`Bld_DoorPivot`)·의자(`userData.seat`) 표시가 들어 있음 |
| 바리스타·손님(`buildBarista`, `customer_*.glb`) | **NPC 전용.** 플레이어 아바타는 X Bot(`Human.tsx`)을 유지 |
| 주문·착석·마시기·NPC 상태 머신 | `references/features.md`의 흐름을 참고해 다시 구현 |

## 한빛초에 이미 들어간 것 (2026-11)

- **잔디광장 카페** (`src/Cafe.tsx`, `src/cafeNpcs.ts`, `src/cafe/models.js`): 키트 건물을 90° 돌려 문이 잔디밭(서쪽)을 보게 세움, 바깥 카운터+바리스타, 테라스 3테이블, 단골손님 3명(서버 시계 일정).
  - 주문·받기·의자·모금은 **서버가 결정**(`cafe:*` 이벤트). 지갑 20,000원과 메뉴 가격, 돈이 떨어지면 `cafe:allowance`(용돈 받기)도 서버가 관리.
  - 건물 실내 라운지: 바닥을 땅높이로 낮추고(`CAFE_ROOM.floor`) 벽 충돌체에 1.6 m 문틈, 다가가면 `Bld_DoorPivot`이 저절로 열림, 안에서는 카메라 쪽 벽(`Bld_East`)·지붕을 숨기고 실내 카메라. 실내 의자 4개는 `CAFE_SEATS` 뒤에 붙임.
  - 마시는 동작: 키트의 `Drink` 클립 대신 X Bot 오른팔 뼈를 굽힘(`src/hands.ts`의 `ARM`: 들기 / 탁자 / 입). 컵은 손 위치(`hands`)를 따라감.
- **공원 강아지** (`src/ParkDogs.tsx`): 호수 둘레길을 걷고 앉고 꼬리 흔듦.

## 넣는 방법

1. **빌더로 쓰기(권장, 파일 추가 없음):** `models.js`를 `metaverse/src/cafe/models.js`로 복사하고 컴포넌트에서 인스턴스마다 새로 만든다.
   ```tsx
   import { useMemo, useRef } from "react";
   import { useFrame } from "@react-three/fiber";
   import * as THREE from "three";
   import { buildAnimal } from "./cafe/models.js";

   export function Dog({ position }: { position: [number, number, number] }) {
     const dog = useMemo(() => buildAnimal(), []);          // 개마다 새로 만들기(스키닝 몸통이라 clone 대신)
     const mixer = useMemo(() => new THREE.AnimationMixer(dog), [dog]);
     useMemo(() => mixer.clipAction(dog.animations.find((c) => c.name === "TailWag")!).play(), [mixer, dog]);
     useFrame((_, dt) => mixer.update(dt));
     return <primitive object={dog} position={position} />;
   }
   ```
2. **GLB로 쓰기:** `glb/*.glb`를 `metaverse/public/models/`에 넣고 `Human.tsx`처럼 `useLoader(GLTFLoader, url)`로 읽는다. 여러 마리면 `SkeletonUtils.clone`(강아지는 스키닝 메시)으로 복제한다. 넣기 전에 glTF Transform으로 압축한다(`hanbit-metaverse` 스킬의 모델 규칙).

## 지킬 것 (한빛초 규칙과 부딪히는 부분)

- **레이아웃·충돌:** 새 건물·NPC 위치는 `shared/layout.js`와 `School.tsx`/`Park.tsx`의 충돌체에 넣는다. 키트의 `blocked()`·`NAV` 경유점은 쓰지 않는다(한빛초에는 A* 길찾기 `pathfind.ts`가 있다).
- **멀티플레이:** 키트의 claude.ai `room` presence는 쓰지 않는다. 한빛초는 Socket.IO 서버가 기준이므로 의자 점유·주문 같은 공유 상태는 **서버가 정하고** 클라이언트는 받기만 한다(키트의 "먼저 앉은 사람" 판정은 서버에서 하면 시계 오차 문제가 없다).
- **대화:** 말풍선은 한빛초 채팅(근처/그룹/전체, 서버가 받는 사람 결정)에 붙인다. 별도 채팅 토픽을 만들지 않는다.
- **아바타:** X Bot 아바타를 키트 캐릭터로 바꾸지 않는다. 키트 캐릭터는 Mixamo 리그가 아니라 X Bot 클립을 공유할 수 없다.
- **확인:** 바꾼 뒤에는 `hanbit-metaverse` 스킬의 Verify 절차(`node tests/sim.mjs` 등, 실제 브라우저 스크린샷)를 그대로 따른다.
