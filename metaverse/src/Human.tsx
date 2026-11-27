// Realistic animated people for every avatar: a rigged human mannequin with idle / walk / run clips,
// tinted with the player's colour. Model: public/models/xbot.glb (Mixamo "X Bot" from the three.js
// examples, trimmed to three clips and meshopt-compressed). Another Mixamo body can't simply borrow
// these clips: its rest pose differs, so it needs its own clips (or proper retargeting).
import { Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

const URL = "/models/xbot.glb";
const HEIGHT = 1.75; // metres, same as the old capsule avatar
const WALK_SPEED = 1.6; // m/s the walk clip looks right at
const RUN_SPEED = 4.2; // m/s the run clip looks right at
const SIT_HIP = -Math.PI / 2; // thigh swing for sitting (local x of the Mixamo leg bones)
const SIT_KNEE = Math.PI / 2;
const SIT_DROP = 0.5; // metres the seated body is lowered

const withMeshopt = (l: GLTFLoader) => {
  l.setMeshoptDecoder(MeshoptDecoder);
};

type Props = {
  color: string;
  /** true while seated on a ride: play idle whatever the speed */
  riding?: () => boolean;
  fallback: ReactNode;
};

export default function Human(props: Props) {
  return (
    <Suspense fallback={props.fallback}>
      <HumanModel {...props} />
    </Suspense>
  );
}

function HumanModel({ color, riding }: Props) {
  const model = useLoader(GLTFLoader, URL, withMeshopt) as GLTF;
  const root = useRef<THREE.Group>(null);

  const { scene, scale } = useMemo(() => {
    const scene = cloneSkinned(model.scene) as THREE.Group;
    model.scene.updateMatrixWorld(true); // the rig's own scale (e.g. 0.01) must be in the bounds
    const box = new THREE.Box3().setFromObject(model.scene, true);
    const scale = HEIGHT / Math.max(0.01, box.max.y - box.min.y);
    const tint = new THREE.Color(color);
    scene.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.frustumCulled = false; // skinned bounds don't follow the animation
      // A plain mannequin: body in the player's colour, joints dark grey.
      const src = m.material as THREE.MeshStandardMaterial;
      const mat = src.clone();
      if (/Joints/i.test(src.name)) mat.color.set("#3b3f46");
      else mat.color.copy(tint);
      mat.roughness = 0.55;
      mat.metalness = 0.1;
      m.material = mat;
    });
    return { scene, scale };
  }, [model, color]);

  const mixer = useMemo(() => new THREE.AnimationMixer(scene), [scene]);
  const actions = useMemo(() => {
    const get = (name: string) => {
      const a = mixer.clipAction(model.animations.find((c) => c.name === name)!);
      a.play();
      return a;
    };
    return { idle: get("idle"), walk: get("walk"), run: get("run") };
  }, [model, mixer]);
  useEffect(() => () => void mixer.stopAllAction(), [mixer]);
  // Bones bent by hand for the sitting pose (the clips have none).
  const legs = useMemo(() => {
    const b = (n: string) => scene.getObjectByName(n) as THREE.Bone | undefined;
    return { up: [b("mixamorigLeftUpLeg"), b("mixamorigRightUpLeg")], knee: [b("mixamorigLeftLeg"), b("mixamorigRightLeg")] };
  }, [scene]);
  const body = useRef<THREE.Group>(null);

  const last = useRef<THREE.Vector3 | null>(null);
  const speed = useRef(0);
  const world = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const r = root.current;
    if (!r || dt <= 0) return;
    r.getWorldPosition(world);
    const prev = last.current;
    let v = 0;
    if (prev) {
      const d = Math.hypot(world.x - prev.x, world.z - prev.z);
      v = d > 8 ? 0 : d / dt; // a door or stairs jump is not running
    }
    last.current = (prev ?? new THREE.Vector3()).copy(world);
    const seated = !!riding?.();
    if (seated) v = 0;
    speed.current += (v - speed.current) * Math.min(1, dt * 8);
    const s = speed.current;
    // idle → walk → run blend by speed
    const walkW = THREE.MathUtils.clamp((s - 0.2) / 1.2, 0, 1) * (1 - THREE.MathUtils.clamp((s - 2.5) / 1.5, 0, 1));
    const runW = THREE.MathUtils.clamp((s - 2.5) / 1.5, 0, 1);
    actions.idle.setEffectiveWeight(1 - Math.max(walkW, runW));
    actions.walk.setEffectiveWeight(walkW);
    actions.run.setEffectiveWeight(runW);
    actions.walk.setEffectiveTimeScale(THREE.MathUtils.clamp(s / WALK_SPEED, 0.6, 1.6));
    actions.run.setEffectiveTimeScale(THREE.MathUtils.clamp(s / RUN_SPEED, 0.7, 1.6));
    mixer.update(Math.min(dt, 0.1));
    // Seated on a ride: thighs forward, shins down, and the body lowered so the feet hang where the
    // standing feet were (ride poses give the feet height) and the hips rest on the seat.
    for (const bone of legs.up) bone?.rotateX(seated ? SIT_HIP : 0);
    for (const bone of legs.knee) bone?.rotateX(seated ? SIT_KNEE : 0);
    if (body.current) body.current.position.y = seated ? -SIT_DROP : 0;
  });

  return (
    <group ref={root}>
      <group ref={body}>
        <primitive object={scene} scale={scale} />
      </group>
    </group>
  );
}
