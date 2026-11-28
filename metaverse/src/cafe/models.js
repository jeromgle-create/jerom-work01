// Ported from the user's artifact "메타버스 에셋 스튜디오" (models.js), unchanged except for this header:
// low-poly cafe building, box people and a dog, built in code with three.js (no files to load).
// 메타버스용 로우폴리 시제품 에셋 (Three.js)
// 단위: 미터(m). 모든 모델은 발/바닥이 y=0, 정면이 +Z 방향.
// 브라우저(importmap)와 Node(node_modules) 양쪽에서 동일하게 동작한다.
import * as THREE from 'three';

const mat = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0, ...extra });

function box(name, w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.name = name;
  m.position.set(x, y, z);
  return m;
}

function pivot(name, x, y, z) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  return g;
}

// X축 회전 왕복 애니메이션 트랙
function swingTrack(nodeName, amp, phase, duration, axis = 'x', steps = 16) {
  const times = [], values = [];
  const ax = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0);
  const q = new THREE.Quaternion();
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * duration;
    q.setFromAxisAngle(ax, amp * Math.sin((t / duration) * Math.PI * 2 + phase));
    times.push(t);
    values.push(q.x, q.y, q.z, q.w);
  }
  return new THREE.QuaternionKeyframeTrack(`${nodeName}.quaternion`, times, values);
}

function bendTrack(nodeName, base, amp, phase, duration, steps = 16) {
  const times = [], values = [], q = new THREE.Quaternion(), ax = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * duration;
    q.setFromAxisAngle(ax, base - amp * Math.max(0, Math.sin((t / duration) * Math.PI * 2 + phase)));
    times.push(t); values.push(q.x, q.y, q.z, q.w);
  }
  return new THREE.QuaternionKeyframeTrack(`${nodeName}.quaternion`, times, values);
}

export const ARM_POSE = { sit: { sx: -0.4, sz: 0.3, e: -1.35 }, drink: { sx: -1.5, sy: 0.8, sz: 0.3, e: -1.7 } };

function bobTrack(nodeName, baseY, amp, duration, steps = 16) {
  const times = [], values = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * duration;
    times.push(t);
    values.push(0, baseY + amp * Math.abs(Math.sin((t / duration) * Math.PI * 2)), 0);
  }
  return new THREE.VectorKeyframeTrack(`${nodeName}.position`, times, values);
}

/* ---------------- 캐릭터 (사람형, 약 1.75m) ---------------- */
// opts로 색·체형·헤어스타일을 바꿔 다른 인물을 만든다.
//   opts.colors: { skin, shirt, pants, hair, apron }
//   opts.hair:   'short' | 'long' | 'bun' | 'cap' | 'ponytail' | 'buzz'
//   opts.build:  { h: 키 배율(0.85~1.12), w: 몸통 폭 배율(0.85~1.3) }
export const HAIR_STYLES = ['short', 'long', 'bun', 'cap', 'ponytail', 'buzz'];
export function buildCharacter(opts = {}) {  // opts.arm: ARM_POSE 덮어쓰기(조정용)
  const root = new THREE.Group();
  root.name = opts.name || 'Character';
  const body = pivot('Char_Body', 0, 0, 0);
  root.add(body);

  const c = { skin: 0xf2c7a5, shirt: 0x3f7cc4, pants: 0x2f3a4f, hair: 0x3b2618, ...opts.colors };
  const skin = mat(c.skin), shirt = mat(c.shirt), pants = mat(c.pants),
        shoe = mat(0x1f1f24), hair = mat(c.hair), eye = mat(0x111111), white = mat(0xffffff);
  const H = opts.build?.h ?? 1, Wd = opts.build?.w ?? 1;
  const style = opts.hair || 'short';

  // 다리
  for (const [side, x] of [['L', 0.11 * (0.6 + 0.4 * Wd)], ['R', -0.11 * (0.6 + 0.4 * Wd)]]) {
    // 허벅지(Char_Leg) → 무릎(Char_Knee) → 정강이·신발. 무릎이 있어야 앉는 자세가 됨
    const leg = pivot(`Char_Leg_${side}`, x, 0.8, 0);
    leg.add(box(`Char_Thigh_${side}`, 0.17, 0.38, 0.19, pants, 0, -0.19, 0));
    const knee = pivot(`Char_Knee_${side}`, 0, -0.38, 0);
    knee.add(box(`Char_Shin_${side}`, 0.165, 0.34, 0.185, pants, 0, -0.17, 0));
    knee.add(box(`Char_Shoe_${side}`, 0.19, 0.1, 0.28, shoe, 0, -0.37, 0.04));
    leg.add(knee);
    body.add(leg);
  }
  // 몸통
  body.add(box('Char_Torso', 0.46 * Wd, 0.56, 0.27 * (0.5 + 0.5 * Wd), shirt, 0, 1.08, 0));
  body.add(box('Char_Belt', 0.47 * Wd, 0.06, 0.28 * (0.5 + 0.5 * Wd), mat(0x5a3a22), 0, 0.82, 0));
  if (c.apron) {
    body.add(box('Char_Apron', 0.4 * Wd, 0.62, 0.02, mat(c.apron), 0, 0.92, 0.135 * (0.5 + 0.5 * Wd) + 0.015));
    body.add(box('Char_ApronTie', 0.48, 0.04, 0.29, mat(c.apron), 0, 1.12, 0));
  }
  // 팔
  for (const [side, x] of [['L', 0.23 * Wd + 0.07], ['R', -(0.23 * Wd + 0.07)]]) {
    // 어깨(Char_Arm) → 위팔(소매) → 팔꿈치(Char_Elbow) → 아래팔 → 손. 손 위치는 예전과 같은 -0.55
    const arm = pivot(`Char_Arm_${side}`, x, 1.32, 0);
    arm.add(box(`Char_Sleeve_${side}`, 0.14, 0.24, 0.15, shirt, 0, -0.1, 0));
    arm.add(box(`Char_UpperArm_${side}`, 0.11, 0.06, 0.11, skin, 0, -0.25, 0));
    const elbow = pivot(`Char_Elbow_${side}`, 0, -0.27, 0);
    elbow.add(box(`Char_Forearm_${side}`, 0.105, 0.24, 0.105, skin, 0, -0.12, 0));
    const hand = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), skin);
    hand.name = `Char_Hand_${side}`;
    hand.position.set(0, -0.28, 0);
    elbow.add(hand);
    arm.add(elbow);
    body.add(arm);
  }
  // 머리
  const head = pivot('Char_Head', 0, 1.4, 0);
  head.add(box('Char_Neck', 0.12, 0.08, 0.12, skin, 0, 0.02, 0));
  head.add(box('Char_Face', 0.34, 0.34, 0.32, skin, 0, 0.22, 0));
  // 헤어스타일
  if (style === 'buzz') {
    head.add(box('Char_HairTop', 0.35, 0.04, 0.33, hair, 0, 0.39, 0));
  } else if (style === 'cap') {
    head.add(box('Char_CapTop', 0.37, 0.1, 0.35, mat(c.cap ?? 0x2b4c7e), 0, 0.42, -0.01));
    head.add(box('Char_CapBrim', 0.33, 0.03, 0.16, mat(c.cap ?? 0x2b4c7e), 0, 0.38, 0.22));
    head.add(box('Char_HairBack', 0.37, 0.14, 0.06, hair, 0, 0.3, -0.155));
  } else {
    head.add(box('Char_HairTop', 0.37, 0.1, 0.35, hair, 0, 0.41, -0.01));
    head.add(box('Char_HairBack', 0.37, style === 'long' ? 0.46 : 0.24, 0.08, hair, 0, style === 'long' ? 0.19 : 0.3, -0.15));
    if (style === 'long') {
      head.add(box('Char_HairSide_L', 0.05, 0.36, 0.26, hair, 0.19, 0.24, -0.03));
      head.add(box('Char_HairSide_R', 0.05, 0.36, 0.26, hair, -0.19, 0.24, -0.03));
    }
    if (style === 'bun') {
      const bun = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), hair);
      bun.name = 'Char_HairBun'; bun.position.set(0, 0.5, -0.06); head.add(bun);
    }
    if (style === 'ponytail') {
      head.add(box('Char_Ponytail', 0.08, 0.3, 0.08, hair, 0, 0.22, -0.23));
      head.add(box('Char_HairTie', 0.09, 0.04, 0.09, mat(0xd9576b), 0, 0.37, -0.22));
    }
  }
  head.add(box('Char_EyeWhite_L', 0.07, 0.06, 0.01, white, 0.08, 0.24, 0.161));
  head.add(box('Char_EyeWhite_R', 0.07, 0.06, 0.01, white, -0.08, 0.24, 0.161));
  head.add(box('Char_Eye_L', 0.035, 0.05, 0.012, eye, 0.085, 0.235, 0.166));
  head.add(box('Char_Eye_R', 0.035, 0.05, 0.012, eye, -0.075, 0.235, 0.166));
  head.add(box('Char_Mouth', 0.08, 0.02, 0.01, mat(0xb5504a), 0, 0.12, 0.161));
  body.add(head);

  const D = 0.9;
  const walk = new THREE.AnimationClip('Walk', D, [
    swingTrack('Char_Leg_L', 0.55, 0, D),
    swingTrack('Char_Leg_R', 0.55, Math.PI, D),
    swingTrack('Char_Arm_L', 0.5, Math.PI, D),
    swingTrack('Char_Arm_R', 0.5, 0, D),
    // 걸을 때 팔꿈치는 살짝 굽힌 채, 팔이 앞으로 갈 때 더 굽음
    bendTrack('Char_Elbow_L', -0.3, 0.2, Math.PI, D),
    bendTrack('Char_Elbow_R', -0.3, 0.2, 0, D),
    bobTrack('Char_Body', 0, 0.03, D),
  ]);
  const idle = new THREE.AnimationClip('Idle', 2.4, [
    swingTrack('Char_Head', 0.06, 0, 2.4, 'y'),
    swingTrack('Char_Arm_L', 0.04, 0, 2.4, 'z'),
    swingTrack('Char_Arm_R', 0.04, Math.PI, 2.4, 'z'),
  ]);
  // 앉기: 허벅지 -90°, 무릎 +90°, 팔은 테이블 위로. 엉덩이(골반) 높이는 모델 원점 기준 0.8 m
  const pose = (name, ax, angle) => {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...ax), angle);
    return new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, [0, 1], [q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w]);
  };
  const X = [1, 0, 0];
  // 팔 자세: sx = 어깨 앞뒤, sz = 어깨 안쪽(오른팔 기준 +), e = 팔꿈치. 손이 테이블/입에 닿도록 맞춘 값
  const A = { ...ARM_POSE, ...(opts.arm || {}) };
  const armPose = (side, p) => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(p.sx, 0, side === 'R' ? p.sz : -p.sz));
    const qe2 = new THREE.Quaternion().setFromEuler(new THREE.Euler(p.e, 0, 0));
    return [new THREE.QuaternionKeyframeTrack(`Char_Arm_${side}.quaternion`, [0, 1], [q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w]),
      new THREE.QuaternionKeyframeTrack(`Char_Elbow_${side}.quaternion`, [0, 1], [qe2.x, qe2.y, qe2.z, qe2.w, qe2.x, qe2.y, qe2.z, qe2.w])];
  };
  const sit = new THREE.AnimationClip('Sit', 1, [
    pose('Char_Leg_L', X, -Math.PI / 2), pose('Char_Leg_R', X, -Math.PI / 2),
    pose('Char_Knee_L', X, Math.PI / 2), pose('Char_Knee_R', X, Math.PI / 2),
    ...armPose('L', A.sit), ...armPose('R', A.sit),
    pose('Char_Head', X, 0.08),
  ]);
  // 마시기(앉은 채): 오른팔을 입 쪽으로 들어 올렸다가 내림. 2.2초, 한 번 재생
  const qe = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
  const keyed = (name, times, quats) =>
    new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, quats.flatMap((q) => [q.x, q.y, q.z, q.w]));
  const DT = [0, 0.6, 1.6, 2.2];
  const drink = new THREE.AnimationClip('Drink', 2.2, [
    pose('Char_Leg_L', X, -Math.PI / 2), pose('Char_Leg_R', X, -Math.PI / 2),
    pose('Char_Knee_L', X, Math.PI / 2), pose('Char_Knee_R', X, Math.PI / 2),
    ...armPose('L', A.sit),
    keyed('Char_Arm_R', DT, [A.sit, A.drink, A.drink, A.sit].map((p) => qe(p.sx, p.sy || 0, p.sz))),
    keyed('Char_Elbow_R', DT, [A.sit, A.drink, A.drink, A.sit].map((p) => qe(p.e, 0, 0))),
    keyed('Char_Head', DT, [qe(0.08, 0, 0), qe(-0.22, 0, 0), qe(-0.22, 0, 0), qe(0.08, 0, 0)]),
  ]);
  root.scale.setScalar(H);
  root.userData.hipHeight = 0.8 * H;
  root.userData.look = { colors: c, hair: style, build: { h: H, w: Wd } };
  root.animations = [walk, idle, sit, drink];
  return root;
}

/* ---------------- 건물 (작은 카페, 약 6m x 5m, 내부 진입 가능) ---------------- */
// 벽은 면별 그룹(Bld_Front/Back/East/West, userData.facade)으로 나뉘고,
// 충돌이 필요한 메시는 userData.collider = true. 문은 Bld_DoorPivot(경첩)을 Y축으로 돌려 연다.
export function buildBuilding() {
  const root = new THREE.Group();
  root.name = 'Building';

  const wall = mat(0xe9dcc4), inner = mat(0xf3ead8), trim = mat(0x7a4b2a), roof = mat(0xb4493a),
        stone = mat(0x9a9a94), glass = mat(0x9fd4e8, { emissive: 0x2a5566, emissiveIntensity: 0.35, roughness: 0.2 }),
        awning = mat(0x2e8b6a), wood = mat(0x8b5a33), floorMat = mat(0xc89b6a), metal = mat(0x8c9399, { metalness: 0.5, roughness: 0.45 });

  const facade = (name) => { const g = new THREE.Group(); g.name = name; g.userData.facade = true; root.add(g); return g; };
  const wallBox = (g, name, w, h, d, x, y, z, m = wall) => {
    const b = box(name, w, h, d, m, x, y, z); b.userData.wall = true; b.userData.collider = true; g.add(b); return b;
  };

  root.add(box('Bld_Foundation', 6.4, 0.3, 5.4, stone, 0, 0.15, 0));
  root.add(box('Bld_Floor', 5.6, 0.05, 4.6, floorMat, 0, 0.325, 0));

  // 벽: 높이 3.2 m (y 0.3~3.5), 두께 0.2 m
  const front = facade('Bld_Front'), back = facade('Bld_Back'), east = facade('Bld_East'), west = facade('Bld_West');
  wallBox(back, 'Bld_WallBack', 6, 3.2, 0.2, 0, 1.9, -2.4);
  wallBox(east, 'Bld_WallEast', 0.2, 3.2, 4.6, 2.9, 1.9, 0);
  wallBox(west, 'Bld_WallWest', 0.2, 3.2, 4.6, -2.9, 1.9, 0);
  // 정면은 문 구멍(폭 1.2 m, 높이 2.3 m)을 남기고 세 조각으로
  wallBox(front, 'Bld_WallFront_L', 2.4, 3.2, 0.2, -1.8, 1.9, 2.4);
  wallBox(front, 'Bld_WallFront_R', 2.4, 3.2, 0.2, 1.8, 1.9, 2.4);
  wallBox(front, 'Bld_WallFront_Top', 1.2, 0.9, 0.2, 0, 3.05, 2.4);

  // 박공 지붕
  const shape = new THREE.Shape();
  shape.moveTo(-3.4, 0); shape.lineTo(3.4, 0); shape.lineTo(0, 1.9); shape.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: 5.6, bevelEnabled: false });
  roofGeo.translate(0, 0, -2.8);
  const roofMesh = new THREE.Mesh(roofGeo, roof);
  roofMesh.name = 'Bld_Roof'; roofMesh.position.y = 3.5; roofMesh.userData.roof = true;
  root.add(roofMesh);
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-3, 0); gableShape.lineTo(3, 0); gableShape.lineTo(0, 1.65); gableShape.closePath();
  const gableGeo = new THREE.ExtrudeGeometry(gableShape, { depth: 4.9, bevelEnabled: false });
  gableGeo.translate(0, 0, -2.45);
  const gable = new THREE.Mesh(gableGeo, wall);
  gable.name = 'Bld_Gable'; gable.position.y = 3.5; gable.userData.roof = true;
  root.add(gable);
  const chimney = box('Bld_Chimney', 0.5, 1.4, 0.5, stone, 1.8, 4.6, -1); chimney.userData.roof = true;
  root.add(chimney);

  // 문 (경첩은 왼쪽, 바깥쪽으로 열림)
  const fz = 2.5;
  front.add(box('Bld_DoorFrame_L', 0.1, 2.3, 0.24, trim, -0.65, 1.45, 2.4));
  front.add(box('Bld_DoorFrame_R', 0.1, 2.3, 0.24, trim, 0.65, 1.45, 2.4));
  front.add(box('Bld_DoorFrame_T', 1.4, 0.1, 0.24, trim, 0, 2.6, 2.4));
  const door = pivot('Bld_DoorPivot', -0.58, 0, fz);
  const leaf = box('Bld_Door', 1.14, 2.2, 0.08, wood, 0.57, 1.45, 0);
  door.add(leaf);
  door.add(box('Bld_DoorWindow', 0.6, 0.6, 0.02, glass, 0.57, 2.0, 0.05));
  const knob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), mat(0xd9b84a, { metalness: 0.6, roughness: 0.4 }));
  knob.name = 'Bld_DoorKnob'; knob.position.set(0.98, 1.35, 0.08);
  door.add(knob);
  const knobIn = knob.clone(); knobIn.name = 'Bld_DoorKnobIn'; knobIn.position.z = -0.08;
  door.add(knobIn);
  front.add(door);

  for (const [s, x] of [['L', -1.9], ['R', 1.9]]) {
    front.add(box(`Bld_WinFrame_${s}`, 1.5, 1.3, 0.08, trim, x, 1.9, fz + 0.03));
    front.add(box(`Bld_Win_${s}`, 1.3, 1.1, 0.04, glass, x, 1.9, fz + 0.06));
    front.add(box(`Bld_WinIn_${s}`, 1.3, 1.1, 0.02, glass, x, 1.9, 2.29));
    front.add(box(`Bld_WinBar_${s}`, 0.06, 1.1, 0.06, trim, x, 1.9, fz + 0.08));
    front.add(box(`Bld_Planter_${s}`, 1.5, 0.25, 0.3, wood, x, 1.15, fz + 0.18));
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), mat([0xe85d75, 0xf2c14e, 0xe85d75][i]));
      f.name = `Bld_Flower_${s}${i}`; f.position.set(x - 0.45 + i * 0.45, 1.35, fz + 0.18);
      front.add(f);
    }
  }
  const awn = box('Bld_Awning', 6.2, 0.12, 1.1, awning, 0, 2.95, fz + 0.5);
  awn.rotation.x = 0.25;
  front.add(awn);
  for (const [n, m, w, h, d, z] of [['Bld_Sign', trim, 2.4, 0.55, 0.1, fz + 0.02], ['Bld_SignFace', mat(0xf4ead2), 2.2, 0.38, 0.03, fz + 0.08]]) {
    const b = box(n, w, h, d, m, 0, 4.2, z); b.userData.roof = true; root.add(b);
  }
  root.add(box('Bld_Step1', 1.8, 0.15, 0.4, stone, 0, 0.075, fz + 0.4));
  for (const [s, x, g] of [['E', 3.0, east], ['W', -3.0, west]]) {
    g.add(box(`Bld_SideWin_${s}`, 0.06, 1.0, 1.4, glass, x, 2.0, 0));
    g.add(box(`Bld_SideWinIn_${s}`, 0.02, 1.0, 1.4, glass, x * 0.932, 2.0, 0));
  }

  // ----- 내부 (바닥 윗면 y = 0.35) -----
  const F = 0.35;
  for (const [n, w, d, x, z] of [['Bld_InnerBack', 5.6, 0.01, 0, -2.29], ['Bld_InnerEast', 0.01, 4.6, 2.79, 0], ['Bld_InnerWest', 0.01, 4.6, -2.79, 0]]) {
    const b = box(n, w, 3.1, d, inner, x, F + 1.55, z); b.userData.facadeOf = n.replace('Inner', 'Wall'); root.add(b);
  }
  back.add(root.getObjectByName('Bld_InnerBack')); east.add(root.getObjectByName('Bld_InnerEast')); west.add(root.getObjectByName('Bld_InnerWest'));
  root.add(box('Bld_Rug', 2.0, 0.01, 1.4, mat(0x3f6e8c), -0.2, F + 0.005, 0.8));
  // 카운터
  // 카운터(앞면 z = -0.95). 뒤쪽 0.6 m는 바리스타 자리
  const counter = box('Bld_Counter', 3.0, 1.0, 0.7, wood, 0.6, F + 0.5, -1.3); counter.userData.collider = true; root.add(counter);
  root.add(box('Bld_CounterTop', 3.1, 0.06, 0.8, mat(0xe4dcd0), 0.6, F + 1.03, -1.3));
  root.add(box('Bld_CoffeeMachine', 0.5, 0.45, 0.4, metal, 1.5, F + 1.29, -1.4));
  root.add(box('Bld_Register', 0.35, 0.22, 0.3, mat(0x2b2f33), -0.3, F + 1.17, -1.25));
  for (let i = 0; i < 3; i++) root.add(box(`Bld_Cup_${i}`, 0.08, 0.1, 0.08, mat(0xffffff), 1.0 + i * 0.12, F + 1.11, -1.5));
  // 선반과 메뉴판
  root.add(box('Bld_Shelf', 2.4, 0.06, 0.3, wood, 0.6, F + 2.2, -2.13));
  [0xc0392b, 0xf2c14e, 0x2e8b6a, 0x8e5a9b, 0x3f6e8c].forEach((c, i) => root.add(box(`Bld_Jar_${i}`, 0.18, 0.26, 0.18, mat(c), -0.3 + i * 0.45, F + 2.36, -2.13)));
  root.add(box('Bld_MenuBoard', 1.1, 0.75, 0.04, mat(0x2a2f2c), -2.0, F + 1.85, -2.26));
  for (let i = 0; i < 4; i++) root.add(box(`Bld_MenuLine_${i}`, 0.75 - (i % 2) * 0.2, 0.04, 0.01, mat(0xf4ead2), -2.05, F + 2.05 - i * 0.14, -2.235));
  // 테이블 2개 + 의자
  [[-1.6, 0.5], [1.4, 0.9]].forEach(([x, z], t) => {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 10), mat(0xe4dcd0));
    top.name = `Bld_Table_${t}`; top.position.set(x, F + 0.74, z); top.userData.collider = true; root.add(top);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 0.72, 6), metal);
    leg.name = `Bld_TableLeg_${t}`; leg.position.set(x, F + 0.36, z); leg.userData.collider = true; root.add(leg);
    for (const a of [0.9, 0.9 + Math.PI]) {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.46, 8), mat(0x2e8b6a));
      st.name = `Bld_Stool_${t}_${a > 2 ? 1 : 0}`; st.userData.seat = true; st.userData.table = `Bld_Table_${t}`; st.position.set(x + Math.cos(a) * 0.62, F + 0.23, z + Math.sin(a) * 0.62);
      root.add(st);
    }
  });
  // 펜던트 조명
  root.add(box('Bld_LampCord', 0.02, 0.5, 0.02, mat(0x222222), 0, 3.25, 0.3));
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.25, 8, 1, true), mat(0x2e8b6a, { side: THREE.DoubleSide }));
  shade.name = 'Bld_LampShade'; shade.position.set(0, 2.9, 0.3); root.add(shade);
  const bulb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 0), mat(0xfff2c8, { emissive: 0xffd98a, emissiveIntensity: 1.5 }));
  bulb.name = 'Bld_LampBulb'; bulb.position.set(0, 2.78, 0.3); root.add(bulb);
  const light = new THREE.PointLight(0xffd9a0, 8, 8, 2);
  light.name = 'Bld_LampLight'; light.position.set(0, 2.7, 0.3); root.add(light);

  const OPEN = -1.65;
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), OPEN);
  const doorOpen = new THREE.AnimationClip('DoorOpen', 0.6, [
    new THREE.QuaternionKeyframeTrack('Bld_DoorPivot.quaternion', [0, 0.6], [qa.x, qa.y, qa.z, qa.w, qb.x, qb.y, qb.z, qb.w]),
  ]);
  root.userData.doorOpenAngle = OPEN;
  root.userData.counter = { minX: -0.9, maxX: 2.1, front: -0.95, top: F + 1.06, baristaZ: -1.95, machineX: 1.5, pickup: [0.0, -1.15] };
  root.animations = [doorOpen];
  return root;
}

/* ---------------- 동물 (강아지, 어깨 높이 약 0.5m) ---------------- */
export function buildBarista() {
  return buildCharacter({ name: 'Barista', colors: { shirt: 0xf4f1ea, pants: 0x3a3a3a, hair: 0x15110e, skin: 0xe0b08c, apron: 0x2e8b6a } });
}

export const DOG_SIT = { pitch: -0.45, by: -0.07, bz: 0.05, thigh: -1.4, knee: 1.3, front: 0.75, fknee: 0 };
export function buildAnimal(opts = {}) {
  const root = new THREE.Group();
  root.name = 'Animal_Dog';
  const body = pivot('Dog_Body', 0, 0, 0);
  root.add(body);

  const fur = mat(0xd08a43), light = mat(0xf3e2c7), dark = mat(0x3a2a1e), nose = mat(0x151515);

  // 몸통은 이음새 없는 한 덩어리 메시이고, 뼈 2개(Dog_Spine: 가슴 쪽, Dog_Hips: 엉덩이 쪽)로 휜다(스키닝).
  // 가운데(z -0.12 ~ +0.12)의 정점은 두 뼈의 영향을 섞어 받아서 엉덩이가 돌면 허리가 부드럽게 휘어진다.
  // 뒷다리와 꼬리는 Dog_Hips 뼈에 붙어 있어 꼬리를 흔들면 엉덩이도 같이 실룩거린다.
  const spine = new THREE.Bone(); spine.name = 'Dog_Spine'; spine.position.set(0, 0.47, 0); body.add(spine);
  const hips = new THREE.Bone(); hips.name = 'Dog_Hips'; hips.position.set(0, 0.47, 0); body.add(hips);
  const skinBox = (name, w, h, d, material, y, z) => {
    const g = new THREE.BoxGeometry(w, h, d, 1, 1, 10);
    g.translate(0, y - 0.47, z); // 뼈 위치(0, 0.47, 0) 기준 좌표
    const pos = g.attributes.position, idx = [], wt = [];
    for (let i = 0; i < pos.count; i++) {
      const k = Math.min(1, Math.max(0, (pos.getZ(i) + 0.12) / 0.24)), f = k * k * (3 - 2 * k); // 앞쪽일수록 1
      idx.push(0, 1, 0, 0); wt.push(f, 1 - f, 0, 0);
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wt, 4));
    const m = new THREE.SkinnedMesh(g, material); m.name = name; m.position.set(0, 0.47, 0);
    return m;
  };
  const torso = skinBox('Dog_Torso', 0.34, 0.3, 0.72, fur, 0.47, 0);
  const belly = skinBox('Dog_Belly', 0.28, 0.08, 0.6, light, 0.32, 0.02);
  body.add(torso, belly);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton([spine, hips]);
  torso.bind(skeleton); belly.bind(skeleton);
  body.add(box('Dog_Chest', 0.26, 0.24, 0.08, light, 0, 0.47, 0.37));
  // 다리 4개
  const legs = [['FL', 0.11, 0.26], ['FR', -0.11, 0.26], ['BL', 0.11, -0.26], ['BR', -0.11, -0.26]];
  for (const [id, x, z] of legs) {
    const leg = pivot(`Dog_Leg_${id}`, x, 0.36, z);
    if (id[0] === 'B') {
      // 뒷다리: 허벅지 → 무릎(Dog_Knee, 실제로는 개의 뒷무릎·발목 관절) → 정강이·발
      leg.add(box(`Dog_Thigh_${id}`, 0.11, 0.18, 0.12, fur, 0, -0.09, 0));
      const knee = pivot(`Dog_Knee_${id}`, 0, -0.17, 0);
      knee.add(box(`Dog_Shin_${id}`, 0.09, 0.15, 0.09, fur, 0, -0.075, 0));
      knee.add(box(`Dog_Paw_${id}`, 0.11, 0.06, 0.13, light, 0, -0.16, 0.015));
      leg.add(knee);
    } else {
      // 앞다리: 위팔 → 무릎(Dog_Knee, 개의 앞발목 관절이라 뒤쪽으로 굽음) → 아래팔·발
      leg.add(box(`Dog_UpperLeg_${id}`, 0.1, 0.18, 0.1, fur, 0, -0.09, 0));
      const knee = pivot(`Dog_Knee_${id}`, 0, -0.17, 0);
      knee.add(box(`Dog_Forearm_${id}`, 0.09, 0.15, 0.09, fur, 0, -0.075, 0));
      knee.add(box(`Dog_Paw_${id}`, 0.11, 0.06, 0.13, light, 0, -0.16, 0.015));
      leg.add(knee);
    }
    if (id[0] === 'B') { leg.position.sub(hips.position); hips.add(leg); } else body.add(leg);
  }
  // 머리
  const head = pivot('Dog_Head', 0, 0.62, 0.36);
  head.add(box('Dog_Skull', 0.3, 0.28, 0.28, fur, 0, 0.08, 0.06));
  head.add(box('Dog_Snout', 0.16, 0.13, 0.16, light, 0, 0.01, 0.27));
  head.add(box('Dog_Nose', 0.07, 0.05, 0.03, nose, 0, 0.065, 0.355));
  head.add(box('Dog_Eye_L', 0.04, 0.05, 0.01, dark, 0.075, 0.13, 0.205));
  head.add(box('Dog_Eye_R', 0.04, 0.05, 0.01, dark, -0.075, 0.13, 0.205));
  for (const [s, x] of [['L', 0.14], ['R', -0.14]]) {
    const ear = box(`Dog_Ear_${s}`, 0.08, 0.18, 0.12, dark, x, 0.13, 0.03);
    ear.rotation.z = x > 0 ? -0.35 : 0.35;
    head.add(ear);
  }
  body.add(head);
  // 꼬리
  const tail = pivot('Dog_Tail', 0, 0.56, -0.36);
  const tailMesh = box('Dog_TailMesh', 0.06, 0.26, 0.06, fur, 0, 0.12, 0);
  tail.add(tailMesh);
  tail.rotation.x = -0.5;
  tail.position.sub(hips.position);
  hips.add(tail);

  const D = 0.6;
  // 엉덩이 흔들기: 꼬리가 가는 쪽으로 엉덩이도 같이 돌고(yaw) 살짝 기울어짐(roll) — 몸 뒤쪽 전체가 실룩거림
  const hipTrack = (dur, fn, steps = 24) => {
    const times = [], vals = [], q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * dur, [yaw, roll] = fn(t);
      q.setFromEuler(e.set(0, yaw, roll)); times.push(t); vals.push(q.x, q.y, q.z, q.w);
    }
    return new THREE.QuaternionKeyframeTrack('Dog_Hips.quaternion', times, vals);
  };
  const wagPhase = (t) => Math.sin((t / 0.4) * Math.PI * 2); // 꼬리 흔들기와 같은 위상
  const tailQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.5);
  const wagTimes = [], wagVals = [];
  for (let i = 0; i <= 12; i++) {
    const t = (i / 12) * 0.4;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.6 * Math.sin((t / 0.4) * Math.PI * 2));
    q.premultiply(tailQ);
    wagTimes.push(t); wagVals.push(q.x, q.y, q.z, q.w);
  }
  const wag = new THREE.QuaternionKeyframeTrack('Dog_Tail.quaternion', wagTimes, wagVals);
  const walk = new THREE.AnimationClip('Walk', D, [
    swingTrack('Dog_Leg_FL', 0.5, 0, D),
    swingTrack('Dog_Leg_BR', 0.5, 0, D),
    swingTrack('Dog_Leg_FR', 0.5, Math.PI, D),
    swingTrack('Dog_Leg_BL', 0.5, Math.PI, D),
    // 걸을 때 뒷무릎이 살짝 굽었다 펴짐
    swingTrack('Dog_Knee_BR', 0.3, Math.PI / 2, D),
    swingTrack('Dog_Knee_BL', 0.3, -Math.PI / 2, D),
    // 앞다리는 다리가 뒤로 갈 때 발이 뒤로 접힘(+X 방향으로만 굽음)
    bendTrack('Dog_Knee_FL', 0, -0.5, Math.PI, D),
    bendTrack('Dog_Knee_FR', 0, -0.5, 0, D),
    ...dogHeadWalk(D),
    bobTrack('Dog_Body', 0, 0.02, D),
  ]);
  const wagClip = new THREE.AnimationClip('TailWag', 0.4, [wag, hipTrack(0.4, (t) => [0.14 * wagPhase(t), -0.05 * wagPhase(t)])]);
  // 앉아 있는 동안(6초 반복): 두리번거리기(왼쪽 → 갸웃 → 오른쪽), 숨쉬기, 귀 쫑긋, 꼬리 흔들기
  const SIT_LOOP = 6;
  function dogSitIdle(P, steps = 120) {
    const smooth = (a, b, t) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
    // 구간별 목표 자세 [시작, 끝, yaw(좌우), roll(갸웃), nod(고개 숙임 추가)]
    const poses = [[0.6, 1.4, 0.35, 0.05, 0], [2.0, 2.6, 0, 0.25, -0.08], [3.2, 3.8, 0, 0, 0], [4.2, 5.0, -0.3, -0.05, 0.1], [5.4, 6.0, 0, 0, 0]];
    const hq = [], bq = [], el = [], er = [], tq = [], times = [];
    const q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * SIT_LOOP;
      times.push(t);
      let yaw = 0, roll = 0, nod = 0;
      for (const [a, b, y2, r2, n2] of poses) {
        const k = smooth(a, b, t);
        yaw += (y2 - yaw) * k; roll += (r2 - roll) * k; nod += (n2 - nod) * k;
      }
      // 고개는 몸 기울기를 상쇄해 앞을 보고(+), 두리번거림을 더함
      q.setFromEuler(e.set(-P.pitch * 0.85 + nod, yaw, roll)); hq.push(q.x, q.y, q.z, q.w);
      // 숨쉬기: 1.5초 주기로 몸이 아주 조금 들썩임
      q.setFromEuler(e.set(P.pitch + 0.015 * Math.sin((t / 1.5) * Math.PI * 2), 0, 0)); bq.push(q.x, q.y, q.z, q.w);
      // 귀: 갸웃할 때(2~3초) 쫑긋 세우고, 오른쪽을 볼 때 한 번 털썩
      const perk = 0.25 * (smooth(1.8, 2.3, t) - smooth(3.0, 3.5, t));
      const flick = 0.2 * Math.max(0, Math.sin((t - 4.4) * Math.PI * 4)) * (t > 4.4 && t < 4.9 ? 1 : 0);
      q.setFromEuler(e.set(0, 0, -0.35 + perk - flick)); el.push(q.x, q.y, q.z, q.w);
      q.setFromEuler(e.set(0, 0, 0.35 - perk + flick)); er.push(q.x, q.y, q.z, q.w);
      // 꼬리: 0.4초 주기 흔들기 (6초에 15번이라 반복 이음매가 없음)
      q.setFromEuler(e.set(-0.5, 0, 0)); const wq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.6 * Math.sin((t / 0.4) * Math.PI * 2));
      wq.premultiply(q); tq.push(wq.x, wq.y, wq.z, wq.w);
    }
    return [
      new THREE.QuaternionKeyframeTrack('Dog_Head.quaternion', times, hq),
      new THREE.QuaternionKeyframeTrack('Dog_Body.quaternion', times, bq),
      new THREE.QuaternionKeyframeTrack('Dog_Ear_L.quaternion', times, el),
      new THREE.QuaternionKeyframeTrack('Dog_Ear_R.quaternion', times, er),
      new THREE.QuaternionKeyframeTrack('Dog_Tail.quaternion', times, tq),
      // 앉아 있을 때는 뒷발이 바닥에 붙어 있으므로 작게
      hipTrack(SIT_LOOP, (t) => [0.05 * wagPhase(t), -0.03 * wagPhase(t)], 120),
    ];
  }
  // 걷는 동안 머리: 발이 닿을 때마다(한 걸음 주기에 2번) 살짝 끄덕이고, 앞발 쪽으로 좌우로 흔들림.
  // 몸통이 위아래로 튈 때 머리는 반대로 조금 내려 시선을 안정시킴(개가 실제로 하는 머리 안정화).
  // 귀는 머리보다 늦게 펄럭이고, 꼬리는 걸음에 맞춰 느리게 좌우로 흔듦.
  function dogHeadWalk(dur, steps = 24) {
    const hq = [], hp = [], el = [], er = [], tq = [], times = [];
    const base = new THREE.Vector3(0, 0.62, 0.36), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * dur, ph = (t / dur) * Math.PI * 2;
      times.push(t);
      // 끄덕임(2배 주기) + 좌우 흔들기(1배, 앞다리 FL과 같은 위상) + 약한 기울기
      e.set(0.03 + 0.06 * Math.sin(2 * ph + 0.6), 0.12 * Math.sin(ph), -0.05 * Math.sin(ph));
      q.setFromEuler(e); hq.push(q.x, q.y, q.z, q.w);
      // 몸통 bob(+0.02·|sin|)의 60%를 반대로 상쇄
      hp.push(base.x, base.y - 0.012 * Math.abs(Math.sin(ph)), base.z);
      // 귀: 기본 각도 ±0.35에 머리 끄덕임보다 늦게(위상 지연) 펄럭임
      const flap = 0.18 * Math.sin(2 * ph - 0.9);
      q.setFromEuler(e.set(0, 0, -0.35 - flap)); el.push(q.x, q.y, q.z, q.w);
      q.setFromEuler(e.set(0, 0, 0.35 + flap)); er.push(q.x, q.y, q.z, q.w);
      // 꼬리: 기본 -0.5(위로 든 각도)에서 좌우 0.35
      q.setFromEuler(e.set(-0.5, 0, 0.35 * Math.sin(ph + Math.PI / 2))); tq.push(q.x, q.y, q.z, q.w);
    }
    return [
      new THREE.QuaternionKeyframeTrack('Dog_Head.quaternion', times, hq),
      new THREE.VectorKeyframeTrack('Dog_Head.position', times, hp),
      new THREE.QuaternionKeyframeTrack('Dog_Ear_L.quaternion', times, el),
      new THREE.QuaternionKeyframeTrack('Dog_Ear_R.quaternion', times, er),
      new THREE.QuaternionKeyframeTrack('Dog_Tail.quaternion', times, tq),
      // 걸을 때 엉덩이도 꼬리(위상 +π/2)와 같은 쪽으로 흔들림
      hipTrack(dur, (t) => { const ph = (t / dur) * Math.PI * 2; return [0.08 * Math.sin(ph + Math.PI / 2), -0.03 * Math.sin(ph + Math.PI / 2)]; }),
    ];
  }
  // 앉기: 몸 앞쪽을 들고(피치 -0.5) 뒷다리를 접고, 앞다리는 땅을 짚게 세움. 꼬리는 계속 흔듦
  const fixed = (name, ax, angle) => {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...ax), angle);
    return new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, [0, 0.4], [q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w]);
  };
  const X = [1, 0, 0];
  // 값은 네 발이 모두 바닥(y≈0)에 닿도록 맞춘 것 (DOG_SIT)
  const P = { ...DOG_SIT, ...(opts.sit || {}) };
  const sitClip = new THREE.AnimationClip('Sit', SIT_LOOP, [
    ...dogSitIdle(P),
    new THREE.VectorKeyframeTrack('Dog_Body.position', [0, 0.4], [0, P.by, P.bz, 0, P.by, P.bz]),
    fixed('Dog_Leg_BL', X, P.thigh), fixed('Dog_Leg_BR', X, P.thigh),
    fixed('Dog_Knee_BL', X, P.knee), fixed('Dog_Knee_BR', X, P.knee),
    fixed('Dog_Leg_FL', X, P.front), fixed('Dog_Leg_FR', X, P.front),
    fixed('Dog_Knee_FL', X, P.fknee), fixed('Dog_Knee_FR', X, P.fknee),
  ]);
  root.animations = [walk, wagClip, sitClip];
  return root;
}

export function stats(obj) {
  let tris = 0, meshes = 0;
  obj.traverse((o) => {
    if (o.isMesh) {
      meshes++;
      const g = o.geometry;
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    }
  });
  const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
  return { tris: Math.round(tris), meshes, size };
}
