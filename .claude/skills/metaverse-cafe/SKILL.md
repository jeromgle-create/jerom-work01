---
name: metaverse-cafe
description: Three.js(웹)용 로우폴리 메타버스 카페 시제품 키트. 코드로 만든 캐릭터·바리스타·손님(헤어 6종·체형 4종)·강아지·카페 건물 GLB와, 키보드 이동·문 열기·의자 앉기·카운터 주문·앉아서 마시기·손님 NPC·말풍선 대화·캐릭터 꾸미기·실시간 멀티플레이(claude.ai room)가 들어간 단일 HTML 뷰어를 담고 있다. 사용자가 "메타버스", "웹 3D 가상공간", "Three.js 캐릭터/건물/동물", "카페/가게 시뮬레이션", "NPC", "멀티플레이 아바타", "GLB 에셋 만들기", 또는 이 카페 프로젝트를 이어서 수정하자고 할 때 사용한다. 한빛초등학교 메타버스(metaverse/, React Three Fiber + Socket.IO)에 카페·강아지·NPC 에셋이나 주문·착석 패턴을 넣을 때도 hanbit-metaverse 스킬과 함께 쓴다.
---

# 메타버스 카페 키트 (Three.js)

코드만으로 만든 로우폴리 3D 에셋과, 그것을 플레이할 수 있는 웹 뷰어 한 벌이다.
어도브 프로그램 없이 만든 **시제품**이며, 실제 서비스 품질은 Blender·Substance 3D로 다듬는 것을 전제로 한다.

## 폴더 구성

| 경로 | 내용 |
|---|---|
| `assets/models.js` | 모든 에셋 빌더(ES 모듈). 브라우저·Node 양쪽에서 동작 |
| `assets/index.html` | 뷰어 + 게임 로직 전체(단일 파일, `./models.js`를 import) |
| `assets/package.json` | `three@0.160.0` 의존성 |
| `glb/` | 내보낸 GLB 10종(캐릭터, 바리스타, 손님 6종, 건물, 강아지) |
| `scripts/export_glb.mjs` | models.js → GLB 일괄 내보내기 |
| `scripts/verify_glb.mjs` | GLB 재로딩 검증(메시·스킨·애니메이션 수) |
| `scripts/tune_poses.mjs` | 강아지 앉기·사람 팔 자세 값을 격자 탐색으로 재계산 |
| `scripts/preview_test.cjs` | 로컬 Chromium으로 뷰어를 띄워 플레이 1회 + 스크린샷 |
| `references/features.md` | 기능별 동작·조작키·상태 머신·멀티플레이 스키마 상세 |

## 공통 규칙 (수정할 때 반드시 지킬 것)

- **단위 m, 바닥 y=0, 정면 +Z.** 모든 모델의 발이 y=0에 닿는다.
- **재질:** `MeshStandardMaterial`, `flatShading: true`, 텍스처 없음(색만). Substance Painter로 재질을 다시 입힐 수 있게 메시 이름을 유지한다.
- **관절은 이름으로 애니메이션한다.** 트랙 이름이 노드 이름(`Char_Arm_R.quaternion` 등)이므로 노드 이름을 바꾸면 애니메이션이 끊긴다.
  - 사람: `Char_Body` → `Char_Leg_L/R` → `Char_Knee_L/R`, `Char_Arm_L/R` → `Char_Elbow_L/R` → `Char_Hand_L/R`, `Char_Head`
  - 강아지: `Dog_Body` → `Dog_Spine`·`Dog_Hips`(뼈, 몸통 스키닝) → 뒷다리·꼬리는 `Dog_Hips` 아래, `Dog_Leg_*` → `Dog_Knee_*`, `Dog_Head`, `Dog_Ear_L/R`, `Dog_Tail`
  - 건물: 면 그룹 `Bld_Front/Back/East/West`(userData.facade), 문 `Bld_DoorPivot`, 의자 `Bld_Stool_*`(userData.seat)
- **자세 값은 계산으로 맞춘 것이다.** `DOG_SIT`(네 발이 바닥에 닿음), `ARM_POSE`(손이 테이블·입에 닿음). 다리·팔 길이를 바꾸면 `scripts/tune_poses.mjs`를 돌려 다시 맞춘다. 눈대중으로 고치지 않는다.
- **강아지 몸통은 스키닝 메시 1개**(이음새 없음). 박스 두 개로 나누면 이음새가 보이므로 되돌리지 않는다.
- **에셋 예산:** 모바일 웹 기준 에셋당 5,000 삼각형. 현재 사람 약 316~340, 강아지 420, 건물 1,128.

## 작업 순서

1. **준비:** `cd assets && npm install` (three 0.160.0).
2. **모델 수정:** `assets/models.js`의 빌더를 고친다. 새 인물은 `buildCharacter({ name, colors, hair, build })`로 만든다.
3. **자세 재계산(치수를 바꿨다면):** `node ../scripts/tune_poses.mjs . all` → 출력값을 `DOG_SIT`/`ARM_POSE`에 반영.
4. **GLB 내보내기:** `node ../scripts/export_glb.mjs . ../glb` 후 `node ../scripts/verify_glb.mjs ../glb .`.
5. **뷰어 확인:** `node ../scripts/preview_test.cjs . <출력폴더>`로 스크린샷과 스크립트 오류를 확인. Playwright·Chromium이 필요하다.
6. **게시(claude.ai Artifact):** `assets/index.html`을 페이지로, `models.js`를 `files`로 함께 게시한다.
   멀티플레이를 쓰려면 capabilities를 선언한다:
   `{"room": {"topics": {"chat": "interact"}}, "user": {"scopes": ["profile"]}}`
   (Artifact가 아닌 일반 웹에 올리면 `window.claude`가 없어 자동으로 "혼자 보기" 모드로 동작한다.)

## 다른 프로젝트에서 GLB 쓰기

```js
new GLTFLoader().load('character.glb', (g) => {
  scene.add(g.scene);
  const mixer = new THREE.AnimationMixer(g.scene);
  mixer.clipAction(g.animations.find((a) => a.name === 'Walk')).play();
  // 렌더 루프에서 mixer.update(delta)
});
```

| 파일 | 애니메이션 |
|---|---|
| character / barista / customer_* | `Walk`, `Idle`, `Sit`, `Drink` |
| animal | `Walk`, `TailWag`, `Sit`(6초 두리번거림 포함) |
| building | `DoorOpen` |

## 알려진 한계 (사용자에게 숨기지 말 것)

- 길찾기가 아니라 손으로 정한 경유점(`NAV`, `seatRoute`)을 따라 걷는다. 카페 배치를 바꾸면 경유점도 고쳐야 한다.
- NPC·주문·문·강아지는 각자 화면에서만 돌아간다. 멀티플레이로 공유되는 것은 캐릭터 위치·동작·외형·손에 든 컵·앉은 의자·대화뿐이다.
- 동시 착석 판정은 각 기기 시계 기준이라 1초 안쪽 동시 착석은 오차가 있을 수 있다.
- Mixamo 리깅과 호환되지 않는다(관절을 직접 회전시키는 방식).
- 어도브 연동(Adobe for creativity)은 2D 이미지 편집만 제공하며 3D 모델 제작에는 쓸 수 없다.

기능별 상세(조작키, NPC 상태 머신, 주문 흐름, 멀티플레이 presence 형식)는 `references/features.md`를 읽는다.

한빛초 메타버스(`metaverse/`)에 넣을 때는 `references/hanbit-metaverse.md`를 먼저 읽는다. 그 앱의 구조·서버·테스트·배포 규칙은 `hanbit-metaverse` 스킬이 우선한다.
