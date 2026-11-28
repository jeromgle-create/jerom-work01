// 호수 둘레길을 산책하는 강아지 2마리 (서울대공원).
// 위치와 동작(걷기 / 서서 꼬리 흔들기 / 앉기)은 서버 시계(serverNow)만으로 정해지므로
// 모든 접속자가 같은 자리에서 같은 동작을 본다. 서버와 주고받는 데이터는 없다.
// 플레이어(나 또는 다른 사람)가 가까이 오면 그쪽으로 고개를 돌리고 꼬리를 흔든다(각자 화면에서).
// 모델은 metaverse-cafe 키트의 buildAnimal (src/cafe/models.js).
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { buildAnimal } from "./cafe/models.js";
import { PARK } from "../shared/layout.js";
import { remoteTargets, selfPos, serverNow } from "./net";

/** 산책로: 코끼리열차 도로(LOOP, 반폭 1.7 m) 안쪽과 호숫가(LAKE r 16 + 흙 1.2 m) 사이 잔디. 공원 기준 좌표. */
export const DOG_PATH = { x: 8, z: 4, rx: 23.6, rz: 20.6 };
const MEAN_R = (DOG_PATH.rx + DOG_PATH.rz) / 2;
/** 한 주기(초): 걷기 WALK초 → 서서 꼬리 흔들기 WAG초 → 앉기 SIT초. */
const WALK = 40, WAG = 4, SIT = 8, CYCLE = WALK + WAG + SIT;
const SPEED = 0.9; // m/s, 사람 걷기보다 느린 산책 속도
const NOTICE = 3.5; // m, 이 거리 안에 사람이 오면 쳐다봄

type DogDef = { phase: number; start: number; fur: number };
/** start: 산책로 출발 각도(라디안), phase: 주기 어긋남(초). 서로 반대편에서 시작. */
export const DOGS: DogDef[] = [
  { phase: 0, start: 0.6, fur: 0xd08a43 },
  { phase: 23, start: 0.6 + Math.PI, fur: 0xf1e6d2 },
];

export type DogPose = { x: number; z: number; ry: number; state: "Walk" | "TailWag" | "Sit" };
/** i번째 강아지의 공원 기준 위치와 동작. 같은 시각이면 누구에게나 같은 값. */
export function dogPose(i: number, nowMs: number): DogPose {
  const d = DOGS[i];
  const t = nowMs / 1000 + d.phase;
  const cycles = Math.floor(t / CYCLE);
  const inCycle = t - cycles * CYCLE;
  const walked = (cycles * WALK + Math.min(inCycle, WALK)) * SPEED; // 지금까지 걸은 거리(m)
  const a = d.start + walked / MEAN_R;
  const x = DOG_PATH.x + Math.cos(a) * DOG_PATH.rx;
  const z = DOG_PATH.z + Math.sin(a) * DOG_PATH.rz;
  // 진행 방향(타원 접선)을 바라봄. 모델 정면은 +Z
  const tx = -Math.sin(a) * DOG_PATH.rx, tz = Math.cos(a) * DOG_PATH.rz;
  const ry = Math.atan2(tx, tz);
  const state = inCycle < WALK ? "Walk" : inCycle < WALK + WAG ? "TailWag" : "Sit";
  return { x, z, ry, state };
}

const _q = new THREE.Quaternion(), _e = new THREE.Euler();

function Dog({ i }: { i: number }) {
  const { dog, mixer, clips, head, tail } = useMemo(() => {
    const dog = buildAnimal();
    dog.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
    });
    // 털 색: 몸통·다리·머리 등 털 재질 하나를 바꾸면 전부 바뀜
    ((dog.getObjectByName("Dog_Torso") as THREE.Mesh).material as THREE.MeshStandardMaterial).color.setHex(DOGS[i].fur);
    const mixer = new THREE.AnimationMixer(dog);
    const clips = Object.fromEntries(dog.animations.map((c) => [c.name, mixer.clipAction(c)])) as Record<string, THREE.AnimationAction>;
    return { dog, mixer, clips, head: dog.getObjectByName("Dog_Head")!, tail: dog.getObjectByName("Dog_Tail")! };
  }, [i]);
  const current = useRef<string>("");
  const look = useRef(0); // 0~1, 사람을 쳐다보는 정도(부드럽게 바뀜)

  useFrame((_, dt) => {
    const p = dogPose(i, serverNow());
    dog.position.set(p.x, 0, p.z);
    dog.rotation.y = p.ry;
    if (current.current !== p.state) {
      const next = clips[p.state];
      next.reset().fadeIn(0.3).play();
      if (current.current) clips[current.current].fadeOut(0.3);
      current.current = p.state;
    }
    mixer.update(Math.min(dt, 0.1));

    // 가장 가까운 사람(나 + 다른 접속자) 찾기. 위치는 월드 좌표라 공원 기준으로 바꿈
    const wx = PARK.cx + p.x, wz = PARK.cz + p.z;
    let best: { x: number; z: number } | null = null, bd = NOTICE;
    for (const q of [selfPos, ...remoteTargets.values()]) {
      const dd = Math.hypot(q.x - wx, q.z - wz);
      if (dd < bd) { bd = dd; best = q; }
    }
    look.current += ((best ? 1 : 0) - look.current) * Math.min(1, dt * 4);
    if (look.current > 0.01 && best) {
      // 머리를 사람 쪽으로(몸 기준 각도, 최대 ±70°) 돌리고, 꼬리를 빠르게 흔듦
      let yaw = Math.atan2(best.x - wx, best.z - wz) - p.ry;
      yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
      yaw = THREE.MathUtils.clamp(yaw, -1.2, 1.2) * look.current;
      head.quaternion.multiply(_q.setFromEuler(_e.set(-0.1 * look.current, yaw, 0)));
      const wag = Math.sin(performance.now() / 1000 * Math.PI * 2 / 0.3) * 0.7 * look.current;
      tail.quaternion.setFromEuler(_e.set(-0.6, 0, wag));
    }
  });
  return <primitive object={dog} />;
}

export default function ParkDogs() {
  return (
    <>
      {DOGS.map((_, i) => (
        <Dog key={i} i={i} />
      ))}
    </>
  );
}
