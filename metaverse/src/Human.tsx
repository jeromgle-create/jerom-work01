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
  /** stable per player (their id): picks hair, trousers and skin tone */
  seed?: string;
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

const HAIR = ["#1d1a18", "#2b211b", "#3a2a1e", "#191919", "#4a3426"];
const PANTS = ["#26324a", "#2f2f35", "#3b4a5e", "#5a4632", "#1f2a3a"];
const SKIN = ["#f1c7a5", "#e8b893", "#f6d2b5", "#dcaa84"];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7) >>> 0;

/**
 * Clothes painted on the mannequin by body region, from the bind-pose vertex position (the mesh's
 * own normalised coordinates: y = height, x = arm span in the T-pose): head and hands skin, upper
 * body the shirt (player colour), legs trousers, feet shoes.
 */
function outfitMaterial(src: THREE.MeshStandardMaterial, geo: THREE.BufferGeometry, c: { skin: string; shirt: string; pants: string; shoes: string }, joints: boolean) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const mat = new THREE.MeshStandardMaterial({ roughness: joints ? 0.5 : 0.75, metalness: 0 });
  mat.name = src.name;
  const u = {
    bbMin: { value: bb.min.clone() },
    bbMax: { value: bb.max.clone() },
    cSkin: { value: new THREE.Color(c.skin) },
    cShirt: { value: new THREE.Color(c.shirt) },
    cPants: { value: new THREE.Color(c.pants) },
    cShoes: { value: new THREE.Color(c.shoes) },
    shade: { value: joints ? 0.86 : 1 }, // joint rings a little darker, like seams
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBind;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBind = position;");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vBind;\nuniform vec3 bbMin, bbMax, cSkin, cShirt, cPants, cShoes;\nuniform float shade;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float hn = (vBind.y - bbMin.y) / (bbMax.y - bbMin.y);
        float xn = abs(vBind.x - (bbMin.x + bbMax.x) * 0.5) / ((bbMax.x - bbMin.x) * 0.5);
        vec3 wear = hn > 0.835 ? cSkin : xn > 0.8 ? cSkin : hn > 0.535 ? cShirt : hn > 0.045 ? cPants : cShoes;
        // short sleeves end above the elbow
        if (hn > 0.6 && hn <= 0.835 && xn > 0.42 && xn <= 0.8) wear = cSkin;
        diffuseColor.rgb = wear * shade;`,
      );
  };
  mat.customProgramCacheKey = () => `outfit-${joints}`;
  return mat;
}

function HumanModel({ color, riding, seed = "" }: Props) {
  const model = useLoader(GLTFLoader, URL, withMeshopt) as GLTF;
  const root = useRef<THREE.Group>(null);

  const { scene, scale } = useMemo(() => {
    const scene = cloneSkinned(model.scene) as THREE.Group;
    model.scene.updateMatrixWorld(true); // the rig's own scale (e.g. 0.01) must be in the bounds
    const box = new THREE.Box3().setFromObject(model.scene, true);
    const scale = HEIGHT / Math.max(0.01, box.max.y - box.min.y);
    const h = hash(seed);
    const look = { skin: SKIN[h % SKIN.length], shirt: color, pants: PANTS[(h >>> 3) % PANTS.length], shoes: "#f2f2f0", hair: HAIR[(h >>> 6) % HAIR.length] };
    scene.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.frustumCulled = false; // skinned bounds don't follow the animation
      const src = m.material as THREE.MeshStandardMaterial;
      m.material = outfitMaterial(src, m.geometry, look, /Joints/i.test(src.name));
    });
    // Hair and a face on the head bone (bone units are centimetres: the rig is scaled by 0.01).
    const head = scene.getObjectByName("mixamorigHead");
    if (head) {
      const hairMat = new THREE.MeshStandardMaterial({ color: look.hair, roughness: 0.85 });
      const hair = new THREE.Mesh(new THREE.SphereGeometry(12.6, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.56), hairMat);
      hair.position.set(0, 12.8, -1.4);
      hair.scale.set(1, 0.95, 1.08);
      hair.castShadow = true;
      const fringe = new THREE.Mesh(new THREE.SphereGeometry(12.4, 20, 8, Math.PI * 0.15, Math.PI * 0.7, Math.PI * 0.32, Math.PI * 0.14), hairMat);
      fringe.position.set(0, 12.8, 0.2);
      fringe.rotation.y = Math.PI; // fringe over the forehead (front = +z)
      const eyeMat = new THREE.MeshStandardMaterial({ color: "#1b1b1b", roughness: 0.3 });
      const eyes = [-3.3, 3.3].map((x) => {
        const e = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 8), eyeMat);
        e.position.set(x * 1.25, 11.2, 13.6);
        e.scale.set(1, 1.25, 0.6);
        return e;
      });
      head.add(hair, fringe, ...eyes);
    }
    return { scene, scale };
  }, [model, color, seed]);

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
