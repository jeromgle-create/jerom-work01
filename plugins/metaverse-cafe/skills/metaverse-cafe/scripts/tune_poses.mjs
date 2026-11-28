// 사용법: node scripts/tune_poses.mjs <models.js가 있는 폴더> [dog|arm|all]
// 자세 값을 격자 탐색으로 다시 맞춘다. 모델 치수(다리 길이, 팔 길이 등)를 바꾼 뒤 실행하고,
// 출력된 값을 models.js의 DOG_SIT / ARM_POSE에 붙여 넣는다.
//  - dog: 앉은 강아지의 네 발이 바닥(y=0)에 닿고 엉덩이가 2~9 cm에 오도록
//  - arm: 앉은 사람의 손이 테이블 위(1.13 m, 앞 0.38 m)에, 마실 때 손이 입 앞(1.45 m, 앞 0.24 m)에 오도록.
//         팔꿈치는 몸 바깥(x < -0.2)에 두어 팔이 가슴을 가로지르지 않게 함
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [srcDir = 'assets', which = 'all'] = process.argv.slice(2);
const T = (p) => import(pathToFileURL(path.resolve(srcDir, 'node_modules/three', p)).href); // three는 assets/node_modules에서 읽음
const THREE = await T('build/three.module.js');
const M = await import(pathToFileURL(path.resolve(srcDir, 'models.js')).href);
const R = (a, b, st) => { const o = []; for (let v = a; v <= b + 1e-9; v += st) o.push(Math.round(v * 100) / 100); return o; };
function play(obj, clip, t) {
  const mx = new THREE.AnimationMixer(obj);
  mx.clipAction(obj.animations.find((c) => c.name === clip)).play(); mx.update(t); obj.updateMatrixWorld(true);
}
if (which === 'dog' || which === 'all') {
  const minY = (o, n) => new THREE.Box3().setFromObject(o.getObjectByName(n)).min.y;
  let best = null;
  for (const pitch of R(-0.6, -0.3, 0.05)) for (const by of R(-0.12, 0, 0.01)) for (const thigh of R(-1.4, -0.6, 0.1)) for (const knee of R(1.2, 2.4, 0.1)) for (const front of R(0.2, 1.0, 0.05)) {
    const sit = { ...M.DOG_SIT, pitch, by, thigh, knee, front };
    const d = M.buildAnimal({ sit }); play(d, 'Sit', 0.01);
    const paws = ['FL', 'FR', 'BL', 'BR'].map((k) => minY(d, 'Dog_Paw_' + k));
    const hip = minY(d, 'Dog_Thigh_BL') ;
    let err = paws.reduce((a, v) => a + v * v, 0) * 100 + Math.abs(pitch + 0.5) * 0.02;
    if (minY(d, 'Dog_Shin_BL') < -0.005) err += 1;
    if (!best || err < best.err) best = { err, sit, paws, hip };
  }
  console.log('DOG_SIT =', JSON.stringify(best.sit), 'paws', best.paws.map((v) => v.toFixed(3)).join(','));
}
if (which === 'arm' || which === 'all') {
  const hand = (arm, clip, t) => { const c = M.buildCharacter({ arm }); play(c, clip, t);
    return { p: c.getObjectByName('Char_Hand_R').getWorldPosition(new THREE.Vector3()), e: c.getObjectByName('Char_Elbow_R').getWorldPosition(new THREE.Vector3()) }; };
  let best = null;
  for (const sx of R(-1.2, 0, 0.05)) for (const sz of R(0, 0.4, 0.05)) for (const e of R(-2.0, 0, 0.05)) {
    const { p, e: el } = hand({ sit: { sx, sz, e } }, 'Sit', 0.01);
    let err = (p.y - 1.13) ** 2 * 4 + (p.z - 0.38) ** 2 + (p.x + 0.2) ** 2; if (el.y < 1.0) err += (1.0 - el.y) * 2;
    if (!best || err < best.err) best = { err, v: { sx, sz, e } };
  }
  const sit = best.v; best = null;
  for (const sx of R(-1.6, -0.6, 0.1)) for (const sy of R(-1, 1, 0.2)) for (const sz of R(0, 0.8, 0.1)) for (const e of R(-2.4, -0.8, 0.1)) {
    const { p, e: el } = hand({ sit, drink: { sx, sy, sz, e } }, 'Drink', 1.0);
    let err = (p.x + 0.05) ** 2 + (p.y - 1.45) ** 2 + (p.z - 0.24) ** 2;
    if (el.y > 1.35) err += (el.y - 1.35) * 0.5; if (el.x > -0.2) err += (el.x + 0.2) * 2; if (p.z < 0.2) err += (0.2 - p.z) * 5;
    if (!best || err < best.err) best = { err, v: { sx, sy, sz, e } };
  }
  console.log('ARM_POSE =', JSON.stringify({ sit, drink: best.v }));
}
