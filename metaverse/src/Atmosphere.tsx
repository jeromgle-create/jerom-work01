// Sky, image-based lighting and a sun whose shadows follow the player.
//  - Outdoors by day: a physical sky (three's Sky shader) drawn behind everything, and the same sky
//    baked into an environment map so glass and metal reflect it and every surface gets sky light.
//  - Indoors / at night: a neutral room environment for soft reflections, background colour as before.
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { selfPos } from "./net";

export const SUN_DIR = new THREE.Vector3(0.45, 0.75, 0.48).normalize(); // from the south-east, high

/** Owns scene.background: the baked sky outdoors by day, else the plain colour `bg`. */
export function Atmosphere({ outdoor, dark, park, bg }: { outdoor: boolean; dark: boolean; park: boolean; bg: string }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  // The sun never moves, so the (expensive, per-pixel) Sky shader is rendered once into a cube map
  // that then serves as the background.
  const skyBg = useMemo(() => {
    const s = new Sky();
    s.scale.setScalar(100);
    const u = s.material.uniforms;
    u.turbidity.value = 5;
    u.rayleigh.value = 1.2;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.8;
    u.sunPosition.value.copy(SUN_DIR);
    const sc = new THREE.Scene();
    sc.add(s);
    const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
    const cam = new THREE.CubeCamera(1, 1000, rt);
    const tm = gl.toneMapping;
    cam.update(gl, sc);
    gl.toneMapping = tm;
    s.geometry.dispose();
    s.material.dispose();
    return rt;
  }, [gl]);
  useEffect(() => () => skyBg.dispose(), [skyBg]);
  const envs = useMemo(() => {
    const pm = new THREE.PMREMGenerator(gl);
    // Outdoor light probe: a soft sky-to-ground gradient (the Sky shader itself is HDR and far too
    // bright to light with directly) plus a warm glow toward the sun.
    const skyScene = new THREE.Scene();
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(50, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: { sun: { value: SUN_DIR } },
        vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader: `uniform vec3 sun; varying vec3 vDir;
          void main(){
            float h = vDir.y;
            vec3 zenith = vec3(0.42,0.62,0.86), horizon = vec3(0.86,0.9,0.93), ground = vec3(0.36,0.4,0.3);
            vec3 c = h > 0.0 ? mix(horizon, zenith, pow(h, 0.6)) : mix(horizon, ground, pow(-h, 0.4));
            c += vec3(1.0,0.92,0.8) * pow(max(dot(vDir, sun), 0.0), 24.0) * 1.5;
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    );
    skyScene.add(dome);
    const outdoor = pm.fromScene(skyScene, 0.02).texture;
    const room = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    return { outdoor, room };
  }, [gl]);
  useEffect(() => () => {
    envs.outdoor.dispose();
    envs.room.dispose();
  }, [envs]);
  const daySky = outdoor && !dark;
  useEffect(() => {
    scene.environment = daySky ? envs.outdoor : envs.room;
    scene.background = daySky ? skyBg.texture : new THREE.Color(bg);
    // The park keeps its plain colours (its realistic pass comes later): less sky light there.
    scene.environmentIntensity = daySky ? (park ? 0.3 : 0.75) : dark ? 0.12 : 0.3;
  }, [scene, envs, skyBg, daySky, dark, park, bg]);
  return null;
}

/** Directional sunlight; the shadow box is centred on the player so shadows exist wherever they go. */
export function Sun({ dark }: { dark: boolean }) {
  const light = useRef<THREE.DirectionalLight>(null);
  useFrame(() => {
    const l = light.current;
    if (!l) return;
    // snap to a 2 m grid so shadow edges don't shimmer while walking
    const x = Math.round(selfPos.x / 2) * 2;
    const z = Math.round(selfPos.z / 2) * 2;
    l.position.set(x + SUN_DIR.x * 40, SUN_DIR.y * 40, z + SUN_DIR.z * 40);
    l.target.position.set(x, 0, z);
    l.target.updateMatrixWorld();
  });
  return (
    <directionalLight
      ref={light}
      intensity={dark ? 0.55 : 1.7}
      color={dark ? "#b9c6ff" : "#fff3e0"}
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-34}
      shadow-camera-right={34}
      shadow-camera-top={34}
      shadow-camera-bottom={-34}
      shadow-camera-near={1}
      shadow-camera-far={120}
      shadow-bias={-0.0004}
      shadow-normalBias={0.03}
    />
  );
}
